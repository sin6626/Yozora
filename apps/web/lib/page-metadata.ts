import "server-only";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { getArticleTranslation, getCategories, getNote, getPage, getPost, getSiteDescription, getSiteSettings, siteName } from "./blog-data";
import { defaultLocale, localizeHref, ogLocale } from "./i18n/config";
import { excerpt } from "./excerpt";
import { ogSize } from "./og";
import { getLocale, getT } from "./i18n/server";

// 详情页的 <title>、描述和分享卡片。和正文共用 getPost/getNote/getPage（React cache），同一次请求只向 Core 取一次。
// 地址非法、内容不存在或读取失败时退回布局的默认值，错误提示和 404 由正文负责。
export { siteDescription, siteName } from "./blog-data";

// 分享图（app/api/og/route.tsx）的地址和尺寸；相对地址由根布局的 metadataBase（后台“网站地址”）补全。
// 同一张 1200×630 图供两个平台读取；版本号让旧分享图与新设计有不同地址。
export function shareImage(lang: string, query: Record<string, string> = {}, alt?: string) {
  const search = new URLSearchParams({ v: "2", ...query });
  if (lang !== defaultLocale) search.set("lang", lang);
  return [{ url: `/api/og?${search}`, ...ogSize, type: "image/png", alt }];
}

async function describe(title: string, description: string | null | undefined, type: "article" | "website", path: string, query?: Record<string, string>): Promise<Metadata> {
  const text = description?.trim() || undefined;
  const name = (await getSiteSettings().catch(() => null))?.name ?? siteName;
  const locale = await getLocale();
  const images = shareImage(locale, query, title);
  return { title, description: text, openGraph: { url: localizeHref(path, locale), siteName: name, title, description: text, type, locale: ogLocale(locale), images }, twitter: { card: "summary_large_image", title, description: text, images } };
}

async function safe(load: () => Promise<Metadata | null>): Promise<Metadata> {
  try {
    return (await load()) ?? {};
  } catch (error) {
    unstable_rethrow(error);
    return {};
  }
}

// 只为首页设置首页的 og:url，避免其他路由从根布局继承同一个永久地址。
export async function homeMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  const [settings, motto] = await Promise.all([getSiteSettings().catch(() => null), getSiteDescription(lang)]);
  const { openGraph, twitter } = await describe(settings?.name ?? siteName, motto.text, "website", "/");
  return { openGraph, twitter };
}

// 与详情组件一致：先解码再编码，非法编码会抛错并退回默认值。
const reencode = (value: string) => encodeURIComponent(decodeURIComponent(value));

// 没有手写摘要时只取开头一段，让 Discord 的描述在下一节标题前自然结束。
function lead(text?: string | null) {
  for (const block of (text ?? "").replace(/```[\s\S]*?```/g, "").split(/\n\s*\n|\n(?=#{1,6} )/)) {
    const line = excerpt(block.replace(/^#{1,6}\s+.*$/gm, ""), 130);
    if (line) return line;
  }
}

// 外文页面的标题和描述用 Core 里的译文（没有译文时用中文原文）
async function inLocale(id: string, title: string, description?: string | null) {
  const lang = await getLocale();
  const translation = lang === "zh" ? null : await getArticleTranslation(id, lang).catch(() => null);
  return translation ? { title: translation.title, description: translation.summary || translation.subtitle || lead(translation.text) || description } : { title, description };
}

// params 要在 safe 外读取：预渲染静态外壳时 Next 用内部信号中止对 params 的等待，不能被吞掉。
export async function postMetadata(params: Promise<{ category: string; slug: string }>) {
  const { category, slug } = await params;
  return safe(async () => {
    const post = await getPost(reencode(category), reencode(slug));
    if (!post) return null;
    const { title, description } = await inLocale(post.id, post.title, post.summary || lead(post.text));
    return describe(title, description, "article", `/posts/${reencode(category)}/${reencode(slug)}`, { type: "post", category: decodeURIComponent(category), slug: decodeURIComponent(slug) });
  });
}

export async function noteMetadata(params: Promise<{ nid: string }>) {
  const { nid } = await params;
  return safe(async () => {
    if (!/^[1-9]\d*$/.test(nid) || !Number.isSafeInteger(Number(nid))) return null;
    const note = await getNote(Number(nid));
    if (!note || note.locked) return null;
    const { title, description } = await inLocale(note.id, note.title, lead(note.text));
    return describe(title, description, "article", `/notes/${nid}`, { type: "note", nid });
  });
}

export async function pageMetadata(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return safe(async () => {
    const page = await getPage(reencode(slug));
    if (!page) return null;
    const { title, description } = await inLocale(page.id, page.title, page.subtitle);
    return describe(title, description, "website", `/${reencode(slug)}`, { type: "page", slug: decodeURIComponent(slug) });
  });
}

export async function categoryMetadata(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return safe(async () => {
    const decoded = decodeURIComponent(slug);
    const category = (await getCategories(await getLocale())).find((item) => item.slug === decoded);
    return category ? describe(category.name, (await getT()).posts.categoryDescription(category.name), "website", `/categories/${reencode(slug)}`) : null;
  });
}
