"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useMemo, type ComponentProps } from "react";
import { defaultLocale, localizeHref, splitLocale, type Locale } from "../lib/i18n/config";
import { zh, type Messages } from "../lib/i18n/messages";
import { localize } from "../lib/i18n/msg";

type LocaleState = {
  locale: Locale;
  // 后台开着的语言，中文在最前
  locales: readonly Locale[];
  t: Messages;
  // 每种语言自己的“已切换到{name}”，切换时用新语言播报
  switched: Readonly<Record<string, string>>;
};

const LocaleContext = createContext<LocaleState>({ locale: defaultLocale, locales: [defaultLocale], t: zh, switched: {} });

// 客户端组件拿当前语言和文案：根布局把 [locale]、开着的语言和 Core 翻好的界面文字（条目名 → 译文）放进 context，
// 这里换到中文原文上（缺的仍是中文）。词典里带参数的条目是函数，不能从服务端传过来，所以传译文、在这边拼
export function LocaleProvider({
  locale,
  locales,
  translations,
  switched,
  children,
}: {
  locale: Locale;
  locales: readonly Locale[];
  translations: Record<string, string>;
  switched: Record<string, string>;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, locales, switched, t: localize(zh, translations) }), [locale, locales, switched, translations]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export const useLocale = () => use(LocaleContext).locale;
export const useLocales = () => use(LocaleContext).locales;
export const useT = () => use(LocaleContext).t;
export const useSwitchedTemplates = () => use(LocaleContext).switched;

// 去掉语言前缀的当前路径（/en/posts → /posts），判断当前页、拼地址都用它
export function useLocalePathname() {
  return splitLocale(usePathname(), useLocales()).path;
}

// 站内链接：自动加上当前语言的前缀（中文不加），用法与 next/link 相同
export default function LocaleLink({ href, ...props }: ComponentProps<typeof Link>) {
  const locale = useLocale();
  return <Link href={typeof href === "string" ? localizeHref(href, locale) : href} {...props} />;
}
