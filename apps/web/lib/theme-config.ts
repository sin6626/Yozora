// 站点主题配置：后台“附加功能 → 配置片段”里引用 theme、名称 yozora 的 JSON 片段（getThemeConfig 读取）。
// 片段对访客公开，只放公开内容。后台手写 JSON 容易填错，这里逐项丢掉格式不对的，整块不可用时返回 null，由页面退回写死的默认值。
export type Tech = { name: string; icon: string };
export type TechStackConfig = { title?: string; description?: string; rows: Tech[][] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseTechStack(config: unknown): TechStackConfig | null {
  const value = isObject(config) ? config.techStack : undefined;
  if (!isObject(value) || !Array.isArray(value.rows)) return null;
  const rows = value.rows
    .map((row) => (Array.isArray(row) ? row : []).flatMap((item) => {
      const name = isObject(item) ? text(item.name) : undefined;
      const icon = isObject(item) ? text(item.icon) : undefined;
      return name && icon ? [{ name, icon }] : [];
    }))
    .filter((row) => row.length > 0);
  if (rows.length === 0) return null;
  return { title: text(value.title), description: text(value.description), rows };
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

// 站长维护的站点内容，和技术栈放在同一个片段里（Shiro 也是把主题文案放在后台的配置片段里）：
// {
//   "hero": { "title": "一个在深夜写代码的**大三学生**", "description": ["第一行", "第二行"] },   首屏标题（**…** 是强调的字）和说明（一行一段）
//   "footer": { "motto": "…", "icp": { "label": "萌ICP备…号", "href": "https://icp.gov.moe/?keyword=…" } },
//   "accounts": { "github": "…", "leetcode": "…" },   页脚星带读谁的 GitHub 贡献和力扣（中国站）提交
//   "copyright": "…",                                 开了“版权注明”的文章末尾显示的说明，空就不显示
//   "i18n": { "en": { "hero": {…}, "footer": { "motto": "…" }, "copyright": "…" }, "ja": { … } }
// }
// 片段读不到或某项没写时用下面的占位（和站长 2026-10 定的文案相同）；写成空字符串、空数组或 null 就是故意不显示，旧值不会冒回来。
export type HeroTitle = { text: string; strong: boolean }[];
type Localized = { text: string; lang?: "zh-CN" };
export type SiteContent = {
  hero: { title: HeroTitle; description: string[]; lang?: "zh-CN" };
  footer: { motto: Localized | null; icp: { label: string; href: string } | null };
  accounts: { github: string | null; leetcode: string | null };
  copyright: Localized | null;
};

const placeholders = {
  zh: { title: "一个在深夜写代码的**大三学生**", description: ["白天上课，晚上折腾前端、写博客、做点小东西。", "探索全栈与设计的普通开发者。"], motto: "头顶的星空，是心里的星空。" },
  en: { title: "Coding by night, a **third-year student**", description: ["Classes by day; front-end tinkering, blogging and small side projects by night.", "An ordinary developer exploring full stack and design."], motto: "The stars overhead are the stars within." },
  ja: { title: "深夜にコードを書く**大学三年生**", description: ["昼は授業、夜はフロントエンドをいじったり、ブログを書いたり、小さなものを作ったり。", "フルスタックとデザインを探求する、ふつうの開発者です。"], motto: "頭上の星空は、心の中の星空。" },
};
const placeholderIcp = { label: "萌ICP备20265334号", href: "https://icp.gov.moe/?keyword=20265334" };
const placeholderAccounts = { github: "sin6626", leetcode: "sin-mt" };

function heroTitle(value: string): HeroTitle {
  return value.split(/\*\*(.+?)\*\*/).flatMap((part, index) => (part.trim() ? [{ text: part.trim(), strong: index % 2 === 1 }] : []));
}

function lines(value: unknown) {
  return Array.isArray(value) ? value.flatMap((line) => (typeof line === "string" && line.trim() ? [line.trim()] : [])) : [];
}

// 某项在片段里出现过（哪怕是空）就以片段为准；没出现过返回 undefined，由调用处用占位
function field(source: Record<string, unknown> | undefined, path: string[]) {
  let value: unknown = source;
  for (const key of path) {
    if (!isObject(value) || !(key in value)) return undefined;
    value = value[key];
  }
  return { value };
}

export function parseSiteContent(config: unknown, lang: "zh" | "en" | "ja"): SiteContent {
  const root = isObject(config) ? config : undefined;
  const i18n = root && isObject(root.i18n) && isObject(root.i18n[lang]) ? root.i18n[lang] : undefined;
  const fallback = placeholders[lang];
  // 外文页面：先找 i18n 里的译文，没有就用中文那一项并标 zh-CN；片段里根本没有这一项时用这种语言的占位
  const pick = (path: string[], placeholder: unknown) => {
    const translated = lang === "zh" ? undefined : field(i18n, path);
    if (translated) return { value: translated.value };
    const original = field(root, path);
    if (original) return { value: original.value, lang: lang === "zh" ? undefined : ("zh-CN" as const) };
    return { value: placeholder };
  };
  const localized = (path: string[], placeholder: string | null): Localized | null => {
    const { value, lang: mark } = pick(path, placeholder);
    const value_ = text(value);
    return value_ ? { text: value_, ...(mark && { lang: mark }) } : null;
  };
  const title = pick(["hero", "title"], fallback.title);
  const description = pick(["hero", "description"], fallback.description);
  const icpField = field(root, ["footer", "icp"]);
  const icp = icpField ? icpField.value : placeholderIcp;
  const icpLabel = isObject(icp) ? text(icp.label) : undefined;
  const icpHref = isObject(icp) ? text(icp.href) : undefined;
  const account = (key: "github" | "leetcode") => {
    const found = field(root, ["accounts", key]);
    return found ? text(found.value) ?? null : placeholderAccounts[key];
  };
  return {
    hero: { title: heroTitle(text(title.value) ?? ""), description: lines(description.value), ...((title.lang ?? description.lang) && { lang: "zh-CN" as const }) },
    footer: { motto: localized(["footer", "motto"], fallback.motto), icp: icpLabel && icpHref && /^https?:\/\//i.test(icpHref) ? { label: icpLabel, href: icpHref } : null },
    accounts: { github: account("github"), leetcode: account("leetcode") },
    copyright: localized(["copyright"], null),
  };
}
