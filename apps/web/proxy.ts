import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isKnownLanguage, isLocale, localeCookie, pickLocale, siteLocales, splitLocale } from "./lib/i18n/config";

// 站点语言的入口（2026-10-30 参照 Shiro；2026-11-05 起开哪些语言由后台“设置 → AI → i18n 语言”决定）：页面都在 app/[locale] 下。
// - 开着的语言 /en/… 原样放行；/zh/… 跳到不带前缀的地址（中文只有一个地址）。
// - 关掉的语言的旧链接（/ko/posts）去掉前缀，回到不带前缀的地址，之后照常按 Cookie、浏览器语言挑（都没开就是中文）。
//   只看两段以上的地址：只有一段的（/ko、/cv、/it）可能是后台页面，按页面处理，没有这个页面就是 404。
// - 不带前缀的地址：读者手动选过语言（Cookie NEXT_LOCALE）就听他的，没选过看浏览器首选语言（Accept-Language）；
//   是开着的外文就跳到带前缀的地址，否则在内部改写成 /zh/…，地址栏不变。
// 规则检查：scripts/verify-i18n.mjs（纯函数）、scripts/e2e/i18n.mjs（真实请求）。
// 静态文件（public 里的图片、feed.xml、robots.txt、sitemap.xml 等）不处理；只看最后一段的扩展名，文章 slug 里带点（如 v1.2）照常处理
const staticFile = /\.(?:ico|png|jpe?g|gif|webp|avif|svg|txt|xml|json|webmanifest|js|css|map|woff2?)$/i;

// 内部改写成 /zh/… 时加在请求上的标记
const rewriteMark = "x-locale-rewrite";

// 问一次 Core 开着哪些语言（GET /ai/i18n）。Core 没有这个接口（404）就是只有中文；
// 读失败（Core 重启、5xx、超时）沿用上次读到的，从没读到过就先只有中文。检查在 scripts/verify-i18n.mjs
export async function readLocales(previous: string[] | null, load: typeof fetch = fetch): Promise<{ locales: string[]; ok: boolean }> {
  try {
    const response = await load(`${process.env.MIX_SPACE_API_URL?.replace(/\/$/, "")}/ai/i18n`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok && response.status !== 404) throw new Error(`Core /ai/i18n 返回 ${response.status}`);
    const data = response.ok ? await response.json() : null;
    return { locales: siteLocales(data?.enabled === true && Array.isArray(data.languages) ? data.languages : []), ok: true };
  } catch {
    return { locales: previous ?? [defaultLocale], ok: false };
  }
}

// 每分钟最多问一次；读失败时 10 秒后再试。
// ponytail: 进程内缓存，后台改了语言最多一分钟后生效；要立即生效再接 Webhook
let known: { locales: string[]; until: number } | null = null;
async function enabledLocales() {
  if (known && Date.now() < known.until) return known.locales;
  const { locales, ok } = await readLocales(known?.locales ?? null);
  known = { locales, until: Date.now() + (ok ? 60_000 : 10_000) };
  return locales;
}

const withVary = (response: NextResponse) => {
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (staticFile.test(pathname)) return NextResponse.next();
  const locales = await enabledLocales();
  const { locale, path } = splitLocale(pathname, locales);
  // 中文只有不带前缀的地址：外面直接访问 /zh/… 时跳回去。下面改写成 /zh/… 的请求会再经过这里一次，带着标记，放行
  if (locale === defaultLocale) {
    return request.headers.get(rewriteMark) ? NextResponse.next() : NextResponse.redirect(new URL(`${path}${search}`, request.url), 308);
  }
  if (locale) return NextResponse.next();
  // 关掉的语言的旧链接：去掉前缀（临时跳转，语言可能再开）。页面只有一级，所以两段以上的地址不会是页面
  const [, first, ...rest] = pathname.split("/");
  if (rest.length && isKnownLanguage(first)) {
    return NextResponse.redirect(new URL(`/${rest.join("/")}${search}`, request.url), 307);
  }
  // 旧的文章翻译链接 ?lang=en / ?lang=ja（站点语言出来之前用的）跳到对应语言的地址
  const legacy = request.nextUrl.searchParams.get("lang");
  if (isLocale(legacy, locales) && legacy !== defaultLocale) {
    const target = new URL(`/${legacy}${pathname === "/" ? "" : pathname}`, request.url);
    request.nextUrl.searchParams.forEach((value, key) => key !== "lang" && target.searchParams.append(key, value));
    return NextResponse.redirect(target, 308);
  }

  const chosen = request.cookies.get(localeCookie)?.value;
  const preferred = isLocale(chosen, locales) ? chosen : pickLocale(request.headers.get("accept-language"), locales) ?? defaultLocale;
  if (preferred !== defaultLocale) {
    return withVary(NextResponse.redirect(new URL(`/${preferred}${pathname === "/" ? "" : pathname}${search}`, request.url), 307));
  }
  const headers = new Headers(request.headers);
  headers.set(rewriteMark, "1");
  return withVary(NextResponse.rewrite(new URL(`/${defaultLocale}${pathname === "/" ? "" : pathname}${search}`, request.url), { request: { headers } }));
}

// 接口和 Next 自己的资源不经过这里
export const config = {
  matcher: ["/((?!api|_next).*)"],
};
