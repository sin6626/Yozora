// 站点语言：中文默认、不带前缀（/posts），其他语言带前缀（/en/posts、/ko/posts）。
// 2026-11-05 起支持哪些语言不再写死：后台“设置 → AI → i18n 语言”（Core 的 GET /ai/i18n）给出，中文一直有。
// 所以判断地址里的语言前缀时要带上“现在开着的语言”（locales 参数）：只有两三个字母的后台页面（如 /me）不能被当成语言。
// 这个文件不依赖 React/Next，服务端、客户端、proxy、检查脚本都能用。
export type Locale = string;
export const defaultLocale = "zh";

// ISO 639 语言代码（小写两三个字母）；从右往左写的语言整页布局要镜像，暂不支持（Core 读取设置时也会去掉）
const rtl = new Set(["ar", "he", "fa", "ur"]);
export const isLanguageCode = (value: unknown): value is string => typeof value === "string" && /^[a-z]{2,3}$/.test(value) && !rtl.has(value);

// 开着的语言：中文在最前，后面按后台填写的顺序，去重、去掉不认识的
export function siteLocales(languages: readonly unknown[] | null | undefined): Locale[] {
  return [defaultLocale, ...new Set((languages ?? []).filter(isLanguageCode).filter((code) => code !== defaultLocale))];
}

// 真的是一种语言（Intl 叫得出名字）：/ko 是语言，/me、/api 不是。proxy 据此把关掉的语言的旧链接送回中文，又不误伤两三个字母的页面
export function isKnownLanguage(value: unknown): value is string {
  if (!isLanguageCode(value)) return false;
  try {
    return new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(value) !== undefined;
  } catch {
    return false;
  }
}

export const isLocale = (value: unknown, locales: readonly string[]): value is Locale => typeof value === "string" && locales.includes(value);

// 语言菜单里每种语言用它自己的名字写（English、日本語、한국어），浏览器自带的 Intl 给出，不用手写
export function languageName(code: Locale) {
  if (code === defaultLocale) return "中文";
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}

// <html lang>、hreflang 用的写法；中文写全 zh-CN（字体、读屏按简体中文）
export const htmlLang = (code: Locale) => (code === defaultLocale ? "zh-CN" : code);

// 分享卡片的 og:locale（zh_CN、en_US、ko_KR）：由语言代码补出最常见的地区
export function ogLocale(code: Locale) {
  try {
    const { language, region } = new Intl.Locale(code === defaultLocale ? "zh-CN" : code).maximize();
    return region ? `${language}_${region}` : language;
  } catch {
    return code;
  }
}

// 读者手动选过语言后记在这个 Cookie 里（proxy.ts 据此决定不带前缀的地址去哪种语言）
export const localeCookie = "NEXT_LOCALE";

// 站内地址加上语言前缀：只处理以 / 开头的站内路径，中文不加；外链、锚点原样返回
export function localizeHref(href: string, locale: Locale) {
  if (locale === defaultLocale || !href.startsWith("/") || href.startsWith("//")) return href;
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

// 从地址里拆出语言前缀：/en/posts → { locale: "en", path: "/posts" }，/posts → { locale: null, path: "/posts" }。
// 只认开着的语言（locales），中文的 /zh 也认（proxy 要把它跳回不带前缀的地址）
export function splitLocale(pathname: string, locales: readonly string[]): { locale: Locale | null; path: string } {
  const segment = pathname.split("/")[1];
  if (!isLocale(segment, locales)) return { locale: null, path: pathname };
  const rest = pathname.slice(segment.length + 1);
  return { locale: segment, path: rest || "/" };
}

// 从浏览器的 Accept-Language（如 "ja,en-US;q=0.9,en;q=0.8"）里按权重挑出第一个开着的语言
export function pickLocale(acceptLanguage: string | null | undefined, locales: readonly string[]): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base, locales)) return base;
  }
  return null;
}
