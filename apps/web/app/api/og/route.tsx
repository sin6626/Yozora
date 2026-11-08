import { ImageResponse } from "next/og";
import ShareCover, { type Cover } from "@/components/share-cover";
import type { NextRequest } from "next/server";
import { getArticleTranslation, getNote, getOwner, getPage, getPost, getSiteDescription, getSiteSettings, siteName } from "@/lib/blog-data";
import { formatDate } from "@/lib/date";
import { defaultLocale, isLanguageCode } from "@/lib/i18n/config";
import { getI18nBundle } from "@/lib/i18n/data";
import { zh } from "@/lib/i18n/messages";
import { localize } from "@/lib/i18n/msg";
import { loadCoverFont, loadImage, ogSize } from "@/lib/og";

// 外文页面用 Core 里的译文（没有译文时用中文原文）
async function translated(id: string, lang: string, fallback: { title: string; description?: string | null }) {
  const doc = lang === defaultLocale ? null : await getArticleTranslation(id, lang).catch(() => null);
  return doc ? { title: doc.title, description: doc.summary ?? doc.subtitle ?? fallback.description } : fallback;
}

const kicker = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

async function loadCard(query: URLSearchParams, lang: string): Promise<Cover | null | undefined> {
  const type = query.get("type");
  if (!type) return undefined; // 首页
  if (type === "post") {
    const category = query.get("category"), slug = query.get("slug");
    const post = category && slug ? await getPost(encodeURIComponent(category), encodeURIComponent(slug), lang) : null;
    if (!post) return null;
    return { kind: "post", title: (await translated(post.id, lang, { title: post.title })).title, caption: post.category?.name ?? "", date: formatDate(post.created), seed: post.id };
  }
  if (type === "note") {
    const nid = query.get("nid") ?? "";
    if (!/^[1-9]\d*$/.test(nid) || !Number.isSafeInteger(Number(nid))) return null;
    const note = await getNote(Number(nid), lang);
    if (!note || note.locked) return null;
    const label = lang === defaultLocale ? zh.nav.notes : localize(zh, (await getI18nBundle(lang)).messages).nav.notes;
    return { kind: "note", title: (await translated(note.id, lang, { title: note.title })).title, caption: kicker(label, note.mood, note.weather), date: formatDate(note.created), seed: note.id };
  }
  if (type === "page") {
    const slug = query.get("slug");
    const page = slug ? await getPage(encodeURIComponent(slug)) : null;
    if (!page) return null;
    const content = await translated(page.id, lang, { title: page.title, description: page.subtitle });
    return { kind: "page", title: content.title, caption: content.description ?? "", seed: page.id };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const lang = query.get("lang") ?? defaultLocale;
  if (!isLanguageCode(lang)) return new Response("Not Found", { status: 404 });
  try {
    const [card, settings, owner] = await Promise.all([loadCard(query, lang), getSiteSettings().catch(() => null), getOwner().catch(() => null)]);
    if (card === null) return new Response("Not Found", { status: 404 });
    const site = settings?.name ?? siteName;
    const cover: Cover = card ?? { kind: "home", title: site, caption: (await getSiteDescription(lang)).text, seed: site };
    const [font, avatar] = await Promise.all([loadCoverFont(), owner?.avatar ? loadImage(owner.avatar).catch(() => null) : null]);
    return new ImageResponse(<ShareCover cover={cover} byline={card ? site : owner?.name || site} avatar={avatar} />, {
      ...ogSize,
      fonts: [{ name: "Yozora", data: font, weight: 400, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("分享图生成失败", error);
    return new Response("Failed to generate the image", { status: 500 });
  }
}
