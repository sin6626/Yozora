import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getApiClient } from "./api";
import { getSiteContent } from "./blog-data";
import { buildSky, parseGitHub, parseLeetCode } from "./sky-calendar";

// 页脚星带的数据：站长在力扣（中国站）刷题和在 GitHub 写代码的每日提交。两边都是不需要登录的公开页面/接口
// （不是官方承诺的公开 API，格式可能会变）。服务端取、缓存几个小时，访客的浏览器不直接连第三方。
// 一边读取失败只显示另一边；两边都失败时抛错，由页脚隐藏星带，下次请求再试（失败不进缓存）。
// 读谁的账号在后台配置片段 theme/yozora 的 accounts（getSiteContent），留空就不显示那一类星

const years = 3;

async function leetCodeYear(account: string, year: number | null) {
  const response = await fetch("https://leetcode.cn/graphql/noj-go/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "query($userSlug: String!, $year: Int) { userCalendar(userSlug: $userSlug, year: $year) { activeYears submissionCalendar } }",
      variables: { userSlug: account, year },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`LeetCode HTTP ${response.status}`);
  const { data } = (await response.json()) as { data?: { userCalendar?: { activeYears: number[]; submissionCalendar: string } } };
  if (!data?.userCalendar) throw new Error("LeetCode calendar missing");
  return data.userCalendar;
}

async function leetCode(account: string, from: number) {
  const { activeYears } = await leetCodeYear(account, null);
  const calendars = await Promise.all(activeYears.filter((year) => year >= from).map((year) => leetCodeYear(account, year)));
  return new Map(calendars.flatMap(({ submissionCalendar }) => [...parseLeetCode(submissionCalendar)]));
}

// 线上服务器在洛杉矶，力扣中国站的 Cloudflare 对它一律返回人机验证（403）；取不到时读站长 Mac 每天同步进 Core 的那份
// （scripts/sync-leetcode.mjs，配置片段 theme/leetcode-calendar，日历和力扣返回的一样是字符串）。本地开发在国内，直接取得到。
// 那份日历记着是哪个账号的：和现在配置的账号不同（刚换账号、还没同步）或没写账号的旧记录都不用，免得拿别人的记录冒充
async function leetCodeFromCore(account: string) {
  const synced = await getApiClient().snippet.getByReferenceAndName<{ account?: string; submissionCalendar: string }>("theme", "leetcode-calendar");
  if (synced.account !== account) throw new Error("synced LeetCode calendar belongs to another account");
  return parseLeetCode(synced.submissionCalendar);
}

async function gitHub(account: string, from: number, to: number) {
  const pages = await Promise.all(Array.from({ length: to - from + 1 }, async (_, index) => {
    const year = from + index;
    const response = await fetch(`https://github.com/users/${encodeURIComponent(account)}/contributions?from=${year}-01-01&to=${year}-12-31`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return parseGitHub(await response.text());
  }));
  return new Map(pages.flatMap((days) => [...days]));
}

export async function getActivitySky() {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 21600, expire: 21600 });
  cacheTag("activity-sky", "blog:theme");
  const { accounts } = await getSiteContent();
  const leetcodeAccount = accounts.leetcode;
  const none = () => Promise.reject(new Error("account not configured"));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const thisYear = Number(today.slice(0, 4));
  const [leetcode, github] = await Promise.allSettled([
    leetcodeAccount ? leetCode(leetcodeAccount, thisYear - years + 1).catch(() => leetCodeFromCore(leetcodeAccount)) : none(),
    accounts.github ? gitHub(accounts.github, thisYear - years + 1, thisYear) : none(),
  ]);
  if (leetcode.status === "rejected" && github.status === "rejected") throw new Error("activity sky unavailable", { cause: [leetcode.reason, github.reason] });
  const value = (result: PromiseSettledResult<Map<string, number>>) => (result.status === "fulfilled" ? result.value : new Map<string, number>());
  return buildSky(value(leetcode), value(github), today, years * 53);
}
