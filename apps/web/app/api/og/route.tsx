import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getArticleTranslation, getNote, getOwner, getPage, getPost, getSiteDescription, getSiteSettings, siteName } from "@/lib/blog-data";
import { formatDate } from "@/lib/date";
import { defaultLocale, isLanguageCode } from "@/lib/i18n/config";
import { getI18nBundle } from "@/lib/i18n/data";
import { zh } from "@/lib/i18n/messages";
import { localize } from "@/lib/i18n/msg";
import { loadCjkFonts, loadImage, ogSize } from "@/lib/og";

// 分享图（og:image / twitter:image，2026-11-07）：首页 ?、文章 ?type=post&category=&slug=、手记 ?type=note&nid=、页面 ?type=page&slug=，
// 外文页面加 &lang=en。地址由 lib/page-metadata.ts 的 shareImage 拼。数据都走 blog-data 的 "use cache" 函数，
// PNG 不缓存（爬虫访问很少）；响应带 Cache-Control 让 CDN/浏览器缓存一小时。ponytail: 访问量大时把 PNG 字节放进 "use cache"。

type Card = { kicker?: string; title: string; description?: string | null; seed: string };

const colors = { sky: "#110e1b", text: "#ece8f4", muted: "#a59fb8", primary: "#e0a6e8", moon: "#f6ead0" };

// 由字符串播种的伪随机数（同一篇文章每次的星空一样）：FNV-1a 加 murmur3 收尾，只差几个字的标题也能散开
function random(seed: string) {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.codePointAt(0)!, 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 整张背景：星点 + 右上一组用细线连起来的星座 + 一弯月亮，都是一张 SVG（resvg 直接画，比几十个 div 省事）
function Sky({ seed }: { seed: string }) {
  const rand = random(seed);
  const { width, height } = ogSize;
  const stars = Array.from({ length: 110 }, () => ({ x: rand() * width, y: rand() * height * 0.92, r: 0.6 + rand() ** 3 * 1.8, o: 0.25 + rand() * 0.6 }));
  // 星座：右半边上方的 5 颗亮星，按横坐标连成一条折线
  const constellation = Array.from({ length: 5 }, () => ({ x: 620 + rand() * 340, y: 60 + rand() * 220 })).sort((a, b) => a.x - b.x);
  const moon = { x: 1080, y: 112, r: 38 };
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
      {stars.map((star, i) => <circle key={i} cx={star.x} cy={star.y} r={star.r} fill={colors.text} opacity={star.o} />)}
      <polyline points={constellation.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={colors.text} strokeOpacity={0.16} strokeWidth={1.2} />
      {constellation.map(({ x, y }, i) => (
        <g key={`c${i}`}>
          <circle cx={x} cy={y} r={7} fill={colors.primary} opacity={0.14} />
          <circle cx={x} cy={y} r={2.4} fill={colors.text} />
        </g>
      ))}
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor={colors.moon} stopOpacity={0.22} />
          <stop offset="100%" stopColor={colors.moon} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={moon.x} cy={moon.y} r={moon.r * 3} fill="url(#glow)" />
      {/* 月牙：外圈半圆弧 + 里面一条较扁的弧 */}
      <path d={`M ${moon.x} ${moon.y - moon.r} A ${moon.r} ${moon.r} 0 1 1 ${moon.x} ${moon.y + moon.r} A ${moon.r * 0.62} ${moon.r} 0 1 0 ${moon.x} ${moon.y - moon.r} Z`} fill={colors.moon} />
    </svg>
  );
}

function Frame({ seed, children }: { seed: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", color: colors.text, fontFamily: "Noto Sans, Noto Sans SC", background: `linear-gradient(165deg, #1d1633 0%, ${colors.sky} 55%, #08060f 100%)` }}>
      {/* 地平线上的一层淡紫光 */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 320, display: "flex", background: "radial-gradient(ellipse 70% 100% at 50% 100%, rgba(224, 166, 232, 0.2), rgba(224, 166, 232, 0))" }} />
      <Sky seed={seed} />
      {children}
    </div>
  );
}

function Avatar({ src, size }: { src: string | null; size: number }) {
  if (!src) return <div style={{ display: "flex", width: size, height: size, borderRadius: size, border: `2px solid ${colors.moon}66` }} />;
  // eslint-disable-next-line @next/next/no-img-element -- ImageResponse 里只能用普通 img
  return <img src={src} width={size} height={size} alt="" style={{ borderRadius: size, border: `3px solid ${colors.moon}80`, boxShadow: `0 0 ${size / 3}px ${colors.moon}40` }} />;
}

const clip = (text: string | null | undefined, max: number) => {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  const chars = [...value];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
};

// 详情图：左上头像 + 站名 + 网址，下面是分类/日期、大标题、摘要
function DetailCard({ card, site, host, avatar }: { card: Card; site: string; host: string; avatar: string | null }) {
  const length = [...card.title].length;
  const size = length <= 14 ? 72 : length <= 28 ? 60 : 50;
  return (
    <Frame seed={card.seed}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "64px 80px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Avatar src={avatar} size={60} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{site}</span>
            <span style={{ fontSize: 20, color: colors.muted }}>{host}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 960 }}>
          {card.kicker && <span style={{ fontSize: 26, color: colors.primary, marginBottom: 18 }}>{card.kicker}</span>}
          <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1.25, color: colors.text }}>{clip(card.title, 64)}</span>
          {card.description && <span style={{ fontSize: 26, lineHeight: 1.6, color: colors.muted, marginTop: 22 }}>{clip(card.description, 72)}</span>}
        </div>
      </div>
    </Frame>
  );
}

// 首页图：大头像在左，站名和站点那句话在右
function HomeCard({ site, description, host, avatar }: { site: string; description: string; host: string; avatar: string | null }) {
  return (
    <Frame seed={site}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 64, width: "100%", padding: "0 120px" }}>
        <Avatar src={avatar} size={200} />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 660 }}>
          <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.2 }}>{site}</span>
          {description && <span style={{ fontSize: 32, lineHeight: 1.6, color: colors.muted, marginTop: 20 }}>{clip(description, 48)}</span>}
          <span style={{ fontSize: 24, color: colors.primary, marginTop: 28 }}>{host}</span>
        </div>
      </div>
    </Frame>
  );
}

// 外文页面用 Core 里的译文（没有译文时用中文原文）
async function translated(id: string, lang: string, fallback: { title: string; description?: string | null }) {
  const doc = lang === defaultLocale ? null : await getArticleTranslation(id, lang).catch(() => null);
  return doc ? { title: doc.title, description: doc.summary ?? doc.subtitle ?? fallback.description } : fallback;
}

const kicker = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

async function loadCard(query: URLSearchParams, lang: string): Promise<Card | null | undefined> {
  const type = query.get("type");
  if (!type) return undefined; // 首页
  if (type === "post") {
    const category = query.get("category"), slug = query.get("slug");
    const post = category && slug ? await getPost(encodeURIComponent(category), encodeURIComponent(slug), lang) : null;
    if (!post) return null;
    return { ...await translated(post.id, lang, { title: post.title, description: post.summary }), kicker: kicker(post.category?.name, formatDate(post.created)), seed: post.id };
  }
  if (type === "note") {
    const nid = query.get("nid") ?? "";
    if (!/^[1-9]\d*$/.test(nid) || !Number.isSafeInteger(Number(nid))) return null;
    const note = await getNote(Number(nid), lang);
    if (!note || note.locked) return null;
    const label = lang === defaultLocale ? zh.nav.notes : localize(zh, (await getI18nBundle(lang)).messages).nav.notes;
    return { title: (await translated(note.id, lang, { title: note.title })).title, kicker: kicker(label, formatDate(note.created), note.mood, note.weather), seed: note.id };
  }
  if (type === "page") {
    const slug = query.get("slug");
    const page = slug ? await getPage(encodeURIComponent(slug)) : null;
    if (!page) return null;
    return { ...await translated(page.id, lang, { title: page.title, description: page.subtitle }), seed: page.id };
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
    const host = settings ? new URL(settings.siteUrl).host : "";
    const description = card ? "" : (await getSiteDescription(lang)).text;
    const texts = card ? [site, host, card.kicker, card.title, clip(card.description, 72)] : [site, host, description];
    // 中文字体按图里真正出现的字向 Google Fonts 取子集；取不到时只留拉丁字母能写出的字（Next 自带的 Geist），图照样出
    const [fonts, avatar] = await Promise.all([loadCjkFonts(texts.join("")).catch(() => null), owner?.avatar ? loadImage(owner.avatar).catch(() => null) : null]);
    const latin = (text: string | undefined) => (fonts || !text || /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]*$/u.test(text) ? text : undefined);
    const element = card
      ? <DetailCard card={{ ...card, title: latin(card.title) ?? host, kicker: latin(card.kicker), description: latin(card.description ?? undefined) }} site={latin(site) ?? host} host={host} avatar={avatar} />
      : <HomeCard site={latin(site) ?? host} description={latin(description) ?? ""} host={host} avatar={avatar} />;
    return new ImageResponse(element, {
      ...ogSize,
      fonts: fonts?.map((font) => ({ ...font, style: "normal" as const })),
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("分享图生成失败", error);
    return new Response("Failed to generate the image", { status: 500 });
  }
}
