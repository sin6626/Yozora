// 把站长在力扣中国站的每日提交日历存进 Core 的配置片段 theme/leetcode-calendar，页脚星带在服务器上取不到力扣时读它。
// 原因：线上服务器在洛杉矶，力扣中国站的 Cloudflare 对它一律返回人机验证（403），只有国内的机器取得到。
// 用法：node scripts/sync-leetcode.mjs [--prod] [--dry-run]   同步一次（默认本地 Core，--prod 线上；内容没变就不写）
//       node scripts/sync-leetcode.mjs --install | --uninstall   在 Mac 上装 / 卸每天 13:00 同步线上的 launchd 定时任务
// Core 地址和后台令牌读 .local/publish.json（同 pnpm draft）。
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { coreUrl } from "./lib/core-url.mjs";
import { systemProxy } from "./lib/system-proxy.mjs";

const args = process.argv.slice(2);
const root = fileURLToPath(new URL("..", import.meta.url));
const label = "me.sin6626.yozora.leetcode-sync";
const plist = join(homedir(), "Library/LaunchAgents", `${label}.plist`);
const domain = `gui/${process.getuid()}`;

if (args.includes("--install") || args.includes("--uninstall")) {
  spawnSync("launchctl", ["bootout", `${domain}/${label}`], { stdio: "ignore" });
  if (args.includes("--uninstall")) {
    if (existsSync(plist)) unlinkSync(plist);
    console.log(`已卸载 ${label}`);
    process.exit(0);
  }
  const log = join(root, ".local/logs/leetcode-sync.log");
  mkdirSync(join(root, ".local/logs"), { recursive: true });
  // 到点时 Mac 在睡眠，醒来后 launchd 会补跑一次；关机错过的那天等下次
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>${process.execPath}</string><string>${fileURLToPath(import.meta.url)}</string><string>--prod</string></array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>13</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`);
  const result = spawnSync("launchctl", ["bootstrap", domain, plist], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`launchctl bootstrap 失败：${result.stderr}`);
  console.log(`已安装 ${label}：每天 13:00 同步到线上，日志 ${log}\n立即跑一次：launchctl kickstart ${domain}/${label}`);
  process.exit(0);
}

const target = args.includes("--prod") ? "prod" : "local";
const dryRun = args.includes("--dry-run");

// 连线上 Core 走系统代理（直连常被重置）。Node 只在启动时读 NODE_USE_ENV_PROXY，所以带上代理变量重新启动自己；力扣在国内，直连。
const proxy = target === "prod" && !process.env.NODE_USE_ENV_PROXY && systemProxy();
if (proxy) {
  const env = { ...process.env, NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: proxy.href, HTTP_PROXY: proxy.href, NO_PROXY: "leetcode.cn,localhost,127.0.0.1,::1" };
  process.exit(spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env }).status ?? 1);
}

const server = JSON.parse(readFileSync(join(root, ".local/publish.json"), "utf8"))[target];
if (!server?.token) throw new Error(`.local/publish.json 没有 ${target} 的 api、token`);

const retry = async (what, run) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= 4) throw error;
      console.error(`${what} 第 ${attempt} 次失败（${error.cause?.code ?? error.message}），稍后重试`);
      await new Promise((done) => setTimeout(done, attempt * 3000));
    }
  }
};

async function leetCodeYear(account, year) {
  const response = await fetch("https://leetcode.cn/graphql/noj-go/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "query($userSlug: String!, $year: Int) { userCalendar(userSlug: $userSlug, year: $year) { activeYears submissionCalendar } }",
      variables: { userSlug: account, year },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`LeetCode HTTP ${response.status}`);
  const calendar = (await response.json()).data?.userCalendar;
  if (!calendar) throw new Error("LeetCode calendar missing");
  return calendar;
}

async function request(path, init = {}) {
  const response = await fetch(coreUrl(server.api, path), { ...init, headers: { "x-api-key": server.token, "content-type": "application/json", ...init.headers }, signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} 失败：HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}

// 账号和前台星带同一个来源：Core 配置片段 theme/yozora 的 accounts.leetcode（后台“配置与云函数”里改）
const themeSnippets = (await retry("Core", () => request("/snippets/group/theme"))).data ?? [];
const siteConfig = themeSnippets.find((item) => item.name === "yozora");
const account = siteConfig ? JSON.parse(siteConfig.raw).accounts?.leetcode : undefined;
if (!account) {
  console.log(`${new Date().toISOString()} ${target}：配置片段 theme/yozora 没有填 accounts.leetcode，跳过`);
  process.exit(0);
}
const { activeYears } = await retry("力扣", () => leetCodeYear(account, null));
const calendars = await Promise.all(activeYears.map((year) => retry("力扣", () => leetCodeYear(account, year))));
const merged = Object.fromEntries(calendars.flatMap(({ submissionCalendar }) => Object.entries(JSON.parse(submissionCalendar))).sort(([a], [b]) => Number(a) - Number(b)));
// 日历存成字符串（和力扣原样一致）：SDK 会把返回对象的键转成驼峰，数字键放在字符串里最稳妥
const submissionCalendar = JSON.stringify(merged);

const existing = themeSnippets.find((item) => item.type === "json" && item.name === "leetcode-calendar");
const previousRecord = existing ? JSON.parse(existing.raw) : null;
// 账号换了也要重写：前台只用和当前账号一致的那份
const unchanged = previousRecord?.account === account && previousRecord?.submissionCalendar === submissionCalendar;
const days = Object.keys(merged).length;
const stamp = new Date().toISOString();
if (unchanged) {
  console.log(`${stamp} ${target}：力扣 ${days} 天，没有变化`);
  process.exit(0);
}
const body = {
  type: "json",
  reference: "theme",
  name: "leetcode-calendar",
  private: false,
  comment: "力扣中国站每日提交（页脚星带用），由站长 Mac 上的 scripts/sync-leetcode.mjs 每天同步，不要手改",
  raw: JSON.stringify({ account, updatedAt: stamp, submissionCalendar }, null, 2),
};
console.log(`${stamp} ${target}：力扣 ${days} 天（${activeYears.join("、")}），${existing ? "更新" : "新建"} theme/leetcode-calendar${dryRun ? "（--dry-run，不写入）" : ""}`);
if (!dryRun) {
  if (existing) await retry("Core", () => request(`/snippets/${existing.id}`, { method: "PUT", body: JSON.stringify(body) }));
  else await retry("Core", () => request("/snippets", { method: "POST", body: JSON.stringify(body) }));
}
