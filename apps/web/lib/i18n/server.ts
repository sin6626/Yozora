import "server-only";
import { locale as rootLocale } from "next/root-params";
import { cache } from "react";
import { defaultLocale, isLanguageCode, localizeHref, type Locale } from "./config";
import { getI18nBundle } from "./data";
import { zh } from "./messages";
import { localize as localizeMessages } from "./msg";

// 服务端组件（包括 "use cache" 函数外层）读当前语言：取根路由参数 [locale]（Next 的 next/root-params，不用层层传 props）。
// 开着哪些语言由 proxy.ts 和根布局把关，这里只认格式
export async function getLocale(): Promise<Locale> {
  const value = await rootLocale();
  return isLanguageCode(value) ? value : defaultLocale;
}

// 当前语言的文案：中文原文换上 Core 翻好的译文，缺的条目仍是中文。同一次请求里只拼一次
export const getT = cache(async () => {
  const locale = await getLocale();
  return locale === defaultLocale ? zh : localizeMessages(zh, (await getI18nBundle(locale)).messages);
});

// 服务端给站内地址加当前语言前缀（普通 <a>，如“重试”链接；next/link 用 components/locale-provider 的 LocaleLink）
export async function localize(href: string) {
  return localizeHref(href, await getLocale());
}
