import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isKnownLanguage, isLocale, localeCookie, pickLocale, siteLocales, splitLocale } from "./lib/i18n/config";

// 站点语言的入口（2026-10-30 参照 Shiro；2026-11-05 起开哪些语言由后台“设置 → AI → i18n 语言”决定）：页面都在 app/[locale] 下。
// - 开着的语言 /en/… 原样放行；/zh/… 跳到不带前缀的地址（中文只有一个地址）。
// - 关掉的语言的旧链接（/ko/posts、/ko）送回中文地址（之后照常按 Cookie、浏览器语言挑）。
// - 不带前缀的地址：读者手动选过语言（Cookie NEXT_LOCALE）就听他的，没选过看浏览器首选语言（Accept-Language）；
//   是开着的外文就跳到带前缀的地址，否则在内部改写成 /zh/…，地址栏不变。
// 规则检查：scripts/verify-i18n.mjs（纯函数）、scripts/e2e/i18n.mjs（真实请求）。
// 静态文件（public 里的图片、feed.xml、robots.txt、sitemap.xml 等）不处理；只看最后一段的扩展名，文章 slug 里带点（如 v1.2）照常处理
const staticFile = /\.(?:ico|png|jpe?g|gif|webp|avif|svg|txt|xml|json|webmanifest|js|css|map|woff2?)$/i;

// 内部改写成 /zh/… 时加在请求上的标记
const rewriteMark = "x-locale-rewrite";

// 开着的语言：每分钟最多问一次 Core（GET /ai/i18n），读不到时沿用上次的，从没读到过就只有中文。
// ponytail: 进程内缓存，后台改了语言最多一分钟后生效；要立即生效再接 Webhook
let known: { locales: string[]; at: number } | null = null;
async function enabledLocales() {
  if (known && Date.now() - known.at < 60_000) return known.locales;
  try {
    const response = await fetch(`${process.env.MIX_SPACE_API_URL?.replace(/\/$/, "")}/ai/i18n`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const data = response.ok ? await response.json() : null;
    known = { locales: siteLocales(data?.enabled === true && Array.isArray(data.languages) ? data.languages : []), at: Date.now() };
  } catch {
    known = { locales: known?.locales ?? [defaultLocale], at: Date.now() };
  }
  return known.locales;
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
  // 关掉的语言的旧链接：去掉前缀回到中文地址（临时跳转，语言可能再开）
  const first = pathname.split("/")[1];
  if (isKnownLanguage(first)) {
    return NextResponse.redirect(new URL(`${pathname.slice(first.length + 1) || "/"}${search}`, request.url), 307);
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
