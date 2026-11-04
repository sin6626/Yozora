import "server-only";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { getArticleTranslation, getCategories, getNote, getPage, getPost, getSiteSettings, siteName } from "./blog-data";
import { ogLocale } from "./i18n/config";
import { getLocale, getT } from "./i18n/server";

// 详情页的 <title>、描述和分享卡片。复用页面正文同一份 "use cache" 数据，不会多请求一次 Core。
// 地址非法、内容不存在或读取失败时退回布局的默认值，错误提示和 404 由正文负责。
export { siteDescription, siteName } from "./blog-data";

async function describe(title: string, description?: string | null, type: "article" | "website" = "article"): Promise<Metadata> {
  const text = description?.trim() || undefined;
  const name = (await getSiteSettings().catch(() => null))?.name ?? siteName;
  return { title, description: text, openGraph: { siteName: name, title, description: text, type, locale: ogLocale[await getLocale()] } };
}

async function safe(load: () => Promise<Metadata | null>): Promise<Metadata> {
  try {
    return (await load()) ?? {};
  } catch (error) {
    unstable_rethrow(error);
    return {};
  }
}

// 与详情组件一致：先解码再编码，非法编码会抛错并退回默认值。
const reencode = (value: string) => encodeURIComponent(decodeURIComponent(value));

// 外文页面的标题和描述用 Core 里的译文（没有译文时用中文原文）
async function inLocale(id: string, title: string, description?: string | null) {
  const lang = await getLocale();
  const translation = lang === "zh" ? null : await getArticleTranslation(id, lang).catch(() => null);
  return translation ? { title: translation.title, description: translation.summary ?? translation.subtitle ?? description } : { title, description };
}

// params 要在 safe 外读取：预渲染静态外壳时 Next 用内部信号中止对 params 的等待，不能被吞掉。
export async function postMetadata(params: Promise<{ category: string; slug: string }>) {
  const { category, slug } = await params;
  return safe(async () => {
    const post = await getPost(reencode(category), reencode(slug));
    if (!post) return null;
    const { title, description } = await inLocale(post.id, post.title, post.summary);
    return describe(title, description);
  });
}

export async function noteMetadata(params: Promise<{ nid: string }>) {
  const { nid } = await params;
  return safe(async () => {
    if (!/^[1-9]\d*$/.test(nid) || !Number.isSafeInteger(Number(nid))) return null;
    const note = await getNote(Number(nid));
    if (!note || note.locked) return null;
    return describe((await inLocale(note.id, note.title)).title);
  });
}

export async function pageMetadata(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return safe(async () => {
    const page = await getPage(reencode(slug));
    if (!page) return null;
    const { title, description } = await inLocale(page.id, page.title, page.subtitle);
    return describe(title, description, "website");
  });
}

export async function categoryMetadata(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return safe(async () => {
    const decoded = decodeURIComponent(slug);
    const category = (await getCategories(await getLocale())).find((item) => item.slug === decoded);
    return category ? describe(category.name, (await getT()).posts.categoryDescription(category.name), "website") : null;
  });
}
