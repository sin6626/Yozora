import { usable } from "./i18n/msg";

// 站点主题配置：后台“配置与云函数”里引用 theme、名称 yozora 的 JSON 片段（getThemeConfig 读取）。
// 片段对访客公开，只放公开内容。手写 JSON 容易填错，下面逐项丢掉格式不对的。
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// 站长维护的站点内容，都在 Core 的配置片段 theme/yozora 里（Shiro 也是把主题文案放在后台的配置片段里），后台“配置与云函数”里改：
// {
//   "hero": { "title": "一个在深夜写代码的**大三学生**", "description": ["第一行", "第二行"] },   首屏标题（**…** 是强调的字）和说明（一行一段）
//   "footer": { "motto": "…", "icp": { "label": "萌ICP备…号", "href": "https://icp.gov.moe/?keyword=…" } },
//   "accounts": { "github": "…", "leetcode": "…" },   页脚星带读谁的 GitHub 贡献和力扣（中国站）提交
//   "copyright": "…",                                 开了“版权注明”的文章末尾显示的说明
//   "techStack": { "title": "…", "description": "…", "rows": [[{ "name": "Vue", "icon": "skill-icons:vuejs-dark" }, …], …] },
// }
// 规则：片段读不到、或某一项根本没写，用下面的占位（和站长 2026-10 定的文案相同）；
// 写成空字符串、空数组或 null（包括整组写成 null）就是故意不显示，旧值不会冒回来。
// 片段里只写中文：外文页面的译文由后台“AI i18n”翻好（Core GET /ai/i18n/:lang 的 site，中文原文 → 译文，传进来的 site），
// 每一项单独找，没有就显示中文那一项并单独标 zh-CN。
export type Tech = { name: string; icon: string };
export type HeroTitle = { text: string; strong: boolean }[];
type Localized = { text: string; lang?: "zh-CN" };
export type SiteContent = {
  hero: { title: HeroTitle; titleLang?: "zh-CN"; description: string[]; descriptionLang?: "zh-CN" };
  footer: { motto: Localized | null; icp: { label: string; href: string } | null };
  accounts: { github: string | null; leetcode: string | null };
  copyright: Localized | null;
  techStack: { title: Localized | null; description: Localized | null; rows: Tech[][] };
};

const placeholder = { title: "一个在深夜写代码的**大三学生**", description: ["白天上课，晚上折腾前端、写博客、做点小东西。", "探索全栈与设计的普通开发者。"], motto: "头顶的星空，是心里的星空。", techTitle: "技术栈", techNote: "平时在用、正在学的东西" };
const placeholderIcp = { label: "萌ICP备20265334号", href: "https://icp.gov.moe/?keyword=20265334" };
const placeholderAccounts = { github: "sin6626", leetcode: "sin-mt" };
const s = (name: string, icon: string) => ({ name, icon: `skill-icons:${icon}` });
const placeholderRows: Tech[][] = [
  [s("Vue", "vuejs-dark"), s("React", "react-dark"), s("TypeScript", "typescript"), s("JavaScript", "javascript"), s("Next.js", "nextjs-dark"), s("Nuxt", "nuxtjs-dark"), s("Tailwind CSS", "tailwindcss-dark"), s("Sass", "sass"), s("Vite", "vite-dark"), s("pnpm", "pnpm-dark")],
  [s("Node.js", "nodejs-dark"), s("NestJS", "nestjs-dark"), s("Express", "expressjs-dark"), s("MongoDB", "mongodb"), s("Redis", "redis-dark"), s("Git", "git"), s("GitHub", "github-dark"), s("Linux", "linux-dark"), s("C++", "cpp"), s("VS Code", "vscode-dark")],
];

// 只去掉 ** 标记：词间空格原样留在各段里，由页面放在强调字外面。
// 两个强调词之间只隔着空格（**Hello** **world**）时，那段空格并到前一段末尾，不能丢
function heroTitle(value: string): HeroTitle {
  const parts: HeroTitle = [];
  value.trim().split(/\*\*(.+?)\*\*/).forEach((part, index) => {
    if (part.trim()) parts.push({ text: part, strong: index % 2 === 1 });
    else if (part && parts.length > 0) parts[parts.length - 1].text += part;
  });
  return parts;
}

function lines(value: unknown) {
  return Array.isArray(value) ? value.flatMap((line) => (typeof line === "string" && line.trim() ? [line.trim()] : [])) : [];
}

function techRows(value: unknown): Tech[][] {
  return (Array.isArray(value) ? value : [])
    .map((row) => (Array.isArray(row) ? row : []).flatMap((item) => {
      const name = isObject(item) ? text(item.name) : undefined;
      const icon = isObject(item) ? text(item.icon) : undefined;
      return name && icon ? [{ name, icon }] : [];
    }))
    .filter((row) => row.length > 0);
}

// 沿着路径找：途中某一级不是对象（比如整组写成 null）就算“写了、清空了”，返回 { value: null }；某一级缺这个键才算“没写”（undefined）
function field(source: unknown, path: string[]): { value: unknown } | undefined {
  let value: unknown = source;
  for (const key of path) {
    if (!isObject(value)) return { value: null };
    if (value[key] === undefined) return undefined;
    value = value[key];
  }
  return { value };
}

export function parseSiteContent(config: unknown, lang: string, site: Record<string, string> = {}): SiteContent {
  const root = isObject(config) ? config : undefined;
  const foreign = lang !== "zh";
  // 一段中文换成译文（Core 存的是去掉首尾空白的原文）；占位符和 ** 对不上的译文不用
  const translate = (source: string) => (foreign && usable(source, site[source]) ? site[source] : undefined);
  // 片段读不到、或这一项根本没写，用占位；写了就用片段里的（包括清空）
  const pick = (path: string[], fallback: unknown) => {
    if (!root) return fallback;
    const found = field(root, path);
    return found ? found.value : fallback;
  };
  const localized = (path: string[], fallback: string | null): Localized | null => {
    const found = text(pick(path, fallback));
    if (!found) return null;
    const translated = translate(found);
    return translated ? { text: translated } : { text: found, ...(foreign && { lang: "zh-CN" as const }) };
  };
  const title = text(pick(["hero", "title"], placeholder.title)) ?? "";
  const titleTranslated = title ? translate(title) : undefined;
  // 说明一行一段，每行单独翻；有一行没有译文就整段显示中文，不中外混排
  const description = lines(pick(["hero", "description"], placeholder.description));
  const descriptionTranslated = description.map(translate);
  const descriptionDone = descriptionTranslated.every((line) => line !== undefined);
  const icpValue = pick(["footer", "icp"], placeholderIcp);
  const icpLabel = isObject(icpValue) ? text(icpValue.label) : undefined;
  const icpHref = isObject(icpValue) ? text(icpValue.href) : undefined;
  const account = (key: "github" | "leetcode") => {
    const found = root ? field(root, ["accounts", key]) : undefined;
    return found ? text(found.value) ?? null : placeholderAccounts[key];
  };
  const rows = root ? field(root, ["techStack", "rows"]) : undefined;
  return {
    hero: {
      title: heroTitle(titleTranslated ?? title),
      ...(foreign && title && !titleTranslated && { titleLang: "zh-CN" as const }),
      description: descriptionDone ? (descriptionTranslated as string[]) : description,
      ...(foreign && description.length > 0 && !descriptionDone && { descriptionLang: "zh-CN" as const }),
    },
    footer: { motto: localized(["footer", "motto"], placeholder.motto), icp: icpLabel && icpHref && /^https?:\/\//i.test(icpHref) ? { label: icpLabel, href: icpHref } : null },
    accounts: { github: account("github"), leetcode: account("leetcode") },
    copyright: localized(["copyright"], null),
    techStack: {
      title: localized(["techStack", "title"], placeholder.techTitle),
      description: localized(["techStack", "description"], placeholder.techNote),
      rows: rows ? techRows(rows.value) : placeholderRows,
    },
  };
}
