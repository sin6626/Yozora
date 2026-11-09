import type { MetadataRoute } from "next";
import { getCategories, getNavigationData, getSiteUrl, getTimeline } from "@/lib/blog-data";
import { htmlLang, localizeHref, type Locale } from "@/lib/i18n/config";
import { getSiteLocales } from "@/lib/i18n/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [site, navigation, categories, timeline, locales] = await Promise.all([
    getSiteUrl(),
    getNavigationData(),
    getCategories(),
    // 全部已发布文章与公开手记一次取完（Next 缓存，内容事件经 Webhook 失效）
    getTimeline(),
    getSiteLocales(),
  ]);
  const path = (...segments: string[]) => `/${segments.map(encodeURIComponent).join("/")}`;
  const pages: { url: string; lastModified?: string }[] = [
    { url: "/" },
    { url: path("posts") },
    { url: path("notes") },
    { url: path("projects") },
    { url: path("timeline") },
    { url: path("timeline", "posts") },
    { url: path("timeline", "notes") },
    { url: path("friends") },
    { url: path("says") },
    { url: path("murmurs") },
    { url: path("thinking") },
    ...navigation.pageMeta.map((page) => ({ url: path(page.slug) })),
    ...categories.map((category) => ({ url: path("categories", category.slug) })),
    ...timeline.map((item) => item.kind === "post"
      ? { url: path("posts", item.category.slug, item.slug), lastModified: item.created }
      : { url: path("notes", String(item.nid)), lastModified: item.created }),
  ];
  // 每个页面都有中文（不加前缀）和后台开着的每种外文（/en 等）版本，各自列出并互相标注 hreflang（文章正文有翻译时跟着换，没有时显示中文原文）
  const absolute = (url: string, locale: Locale) => `${site}${localizeHref(url, locale)}`.replace(/\/$/, "") || site;
  return pages.flatMap((page) => {
    const languages = Object.fromEntries([...locales.map((locale) => [htmlLang(locale), absolute(page.url, locale)]), ["x-default", absolute(page.url, "zh")]]);
    return locales.map((locale) => ({ ...page, url: absolute(page.url, locale), alternates: { languages } }));
  });
}
