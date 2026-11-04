// 站点主题配置：后台“配置与云函数”里引用 theme、名称 yozora 的 JSON 片段（getThemeConfig 读取）。
// 片段对访客公开，只放公开内容。手写 JSON 容易填错，下面逐项丢掉格式不对的。
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// 后台内容里 Core 没有翻译功能的几样（站点描述、作品名和介绍）的外文版本，写在同一个配置片段的 i18n 下：
// { "i18n": { "en": { "siteDescription": "…", "projects": { "<作品 id>": { "name": "…", "description": "…" } } }, "ja": { … } } }
// 没写的项保持中文。翻译的唯一来源仍是 Core（这个片段存在 Core 里）。
export type ContentTranslations = { siteDescription?: string; projects: Record<string, { name?: string; description?: string }> };

export function parseContentTranslations(config: unknown, lang: string): ContentTranslations {
  const i18n = isObject(config) && isObject(config.i18n) ? config.i18n : undefined;
  const value = i18n && isObject(i18n[lang]) ? i18n[lang] : undefined;
  const projects = value && isObject(value.projects) ? value.projects : {};
  return {
    siteDescription: value ? text(value.siteDescription) : undefined,
    projects: Object.fromEntries(Object.entries(projects).flatMap(([id, item]) => (isObject(item) ? [[id, { name: text(item.name), description: text(item.description) }]] : []))),
  };
}

// 站长维护的站点内容，都在 Core 的配置片段 theme/yozora 里（Shiro 也是把主题文案放在后台的配置片段里），后台“配置与云函数”里改：
// {
//   "hero": { "title": "一个在深夜写代码的**大三学生**", "description": ["第一行", "第二行"] },   首屏标题（**…** 是强调的字）和说明（一行一段）
//   "footer": { "motto": "…", "icp": { "label": "萌ICP备…号", "href": "https://icp.gov.moe/?keyword=…" } },
//   "accounts": { "github": "…", "leetcode": "…" },   页脚星带读谁的 GitHub 贡献和力扣（中国站）提交
//   "copyright": "…",                                 开了“版权注明”的文章末尾显示的说明
//   "techStack": { "title": "…", "description": "…", "rows": [[{ "name": "Vue", "icon": "skill-icons:vuejs-dark" }, …], …] },
//   "i18n": { "en": { "hero": {…}, "footer": { "motto": "…" }, "copyright": "…", "techStack": { "title": "…", "description": "…" } }, "ja": { … } }
// }
// 规则：片段读不到、或某一项根本没写，用下面的占位（和站长 2026-10 定的文案相同）；
// 写成空字符串、空数组或 null（包括整组写成 null）就是故意不显示，旧值不会冒回来。
// 外文页面每一项单独找 i18n 里的译文，没有就显示中文那一项并单独标 zh-CN。
export type Tech = { name: string; icon: string };
export type HeroTitle = { text: string; strong: boolean }[];
type Lang = "zh" | "en" | "ja";
type Localized = { text: string; lang?: "zh-CN" };
export type SiteContent = {
  hero: { title: HeroTitle; titleLang?: "zh-CN"; description: string[]; descriptionLang?: "zh-CN" };
  footer: { motto: Localized | null; icp: { label: string; href: string } | null };
  accounts: { github: string | null; leetcode: string | null };
  copyright: Localized | null;
  techStack: { title: Localized | null; description: Localized | null; rows: Tech[][] };
};

const placeholders: Record<Lang, { title: string; description: string[]; motto: string; techTitle: string; techNote: string }> = {
  zh: { title: "一个在深夜写代码的**大三学生**", description: ["白天上课，晚上折腾前端、写博客、做点小东西。", "探索全栈与设计的普通开发者。"], motto: "头顶的星空，是心里的星空。", techTitle: "技术栈", techNote: "平时在用、正在学的东西" },
  en: { title: "Coding by night, a **third-year student**", description: ["Classes by day; front-end tinkering, blogging and small side projects by night.", "An ordinary developer exploring full stack and design."], motto: "The stars overhead are the stars within.", techTitle: "Tech stack", techNote: "What I use and what I'm learning" },
  ja: { title: "深夜にコードを書く**大学三年生**", description: ["昼は授業、夜はフロントエンドをいじったり、ブログを書いたり、小さなものを作ったり。", "フルスタックとデザインを探求する、ふつうの開発者です。"], motto: "頭上の星空は、心の中の星空。", techTitle: "技術スタック", techNote: "普段使っているもの、いま学んでいるもの" },
};
const placeholderIcp = { label: "萌ICP备20265334号", href: "https://icp.gov.moe/?keyword=20265334" };
const placeholderAccounts = { github: "sin6626", leetcode: "sin-mt" };
const s = (name: string, icon: string) => ({ name, icon: `skill-icons:${icon}` });
const placeholderRows: Tech[][] = [
  [s("Vue", "vuejs-dark"), s("React", "react-dark"), s("TypeScript", "typescript"), s("JavaScript", "javascript"), s("Next.js", "nextjs-dark"), s("Nuxt", "nuxtjs-dark"), s("Tailwind CSS", "tailwindcss-dark"), s("Sass", "sass"), s("Vite", "vite-dark"), s("pnpm", "pnpm-dark")],
  [s("Node.js", "nodejs-dark"), s("NestJS", "nestjs-dark"), s("Express", "expressjs-dark"), s("MongoDB", "mongodb"), s("Redis", "redis-dark"), s("Git", "git"), s("GitHub", "github-dark"), s("Linux", "linux-dark"), s("C++", "cpp"), s("VS Code", "vscode-dark")],
];

// 只去掉 ** 标记：词间空格原样留在各段里，由页面放在强调字外面
function heroTitle(value: string): HeroTitle {
  return value.trim().split(/\*\*(.+?)\*\*/).flatMap((part, index) => (part.trim() ? [{ text: part, strong: index % 2 === 1 }] : []));
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

export function parseSiteContent(config: unknown, lang: Lang): SiteContent {
  const root = isObject(config) ? config : undefined;
  const i18n = root && isObject(root.i18n) && isObject(root.i18n[lang]) ? root.i18n[lang] : undefined;
  const fallback = placeholders[lang];
  // 片段读不到时一切用占位；外文页面先找 i18n 里的译文，没有就用中文那一项并标 zh-CN，片段里根本没有这一项时用这种语言的占位
  const pick = (path: string[], placeholder: unknown): { value: unknown; lang?: "zh-CN" } => {
    if (!root) return { value: placeholder };
    const translated = lang === "zh" || !i18n ? undefined : field(i18n, path);
    if (translated) return translated;
    const original = field(root, path);
    if (original) return { value: original.value, lang: lang === "zh" ? undefined : "zh-CN" };
    return { value: placeholder };
  };
  const localized = (path: string[], placeholder: string | null): Localized | null => {
    const { value, lang: mark } = pick(path, placeholder);
    const found = text(value);
    return found ? { text: found, ...(mark && { lang: mark }) } : null;
  };
  const title = pick(["hero", "title"], fallback.title);
  const description = pick(["hero", "description"], fallback.description);
  const icp = root ? field(root, ["footer", "icp"]) : undefined;
  const icpValue = icp ? icp.value : placeholderIcp;
  const icpLabel = isObject(icpValue) ? text(icpValue.label) : undefined;
  const icpHref = isObject(icpValue) ? text(icpValue.href) : undefined;
  const account = (key: "github" | "leetcode") => {
    const found = root ? field(root, ["accounts", key]) : undefined;
    return found ? text(found.value) ?? null : placeholderAccounts[key];
  };
  const rows = root ? field(root, ["techStack", "rows"]) : undefined;
  return {
    hero: {
      title: heroTitle(text(title.value) ?? ""),
      ...(title.lang && { titleLang: title.lang }),
      description: lines(description.value),
      ...(description.lang && { descriptionLang: description.lang }),
    },
    footer: { motto: localized(["footer", "motto"], fallback.motto), icp: icpLabel && icpHref && /^https?:\/\//i.test(icpHref) ? { label: icpLabel, href: icpHref } : null },
    accounts: { github: account("github"), leetcode: account("leetcode") },
    copyright: localized(["copyright"], null),
    techStack: {
      title: localized(["techStack", "title"], fallback.techTitle),
      description: localized(["techStack", "description"], fallback.techNote),
      rows: rows ? techRows(rows.value) : placeholderRows,
    },
  };
}
