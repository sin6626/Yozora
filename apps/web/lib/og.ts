import "server-only";
import { cacheLife } from "next/cache";
import { readLimited } from "./read-limited";

// 分享图（app/api/og/route.tsx）用到的字体和图片。
export const ogSize = { width: 1200, height: 630 };

// Google Fonts 只在老 Safari 的 UA 下给 TTF（Satori 不认 woff2），@vercel/og 自己取字体时也是这么做的
const legacyUA = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";

// 中文字体：不把几 MB 的整套思源黑体打进包，而是按图里真正出现的字向 Google Fonts 取 Noto Sans SC 子集（css2 的 text= 参数，
// 一张图两个字重约几十 KB）。线上服务器在海外能直连 Google；本机经系统代理。按字缓存，同一张图第二次不再下载。
// 取不到时抛错（失败不进缓存，下次再试），由路由退回只用拉丁字母的版本。
export async function loadCjkFonts(text: string) {
  const chars = [...new Set(text)].sort().join("");
  return fetchFonts(chars);
}

async function fetchFonts(chars: string) {
  "use cache";
  cacheLife("weeks");
  const signal = AbortSignal.timeout(6000);
  // 拉丁字母和标点用 Noto Sans（中文字体里的 ’ 等标点是全角宽，“Sin’s” 会被撑开），汉字、假名用 Noto Sans SC
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&family=Noto+Sans+SC:wght@400;700&text=${encodeURIComponent(chars)}`;
  const css = await (await fetch(cssUrl, { headers: { "User-Agent": legacyUA }, signal })).text();
  const faces = [...css.matchAll(/font-family:\s*'([^']+)';[^}]*?font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/g)];
  if (faces.length === 0) throw new Error("Google Fonts 没有返回 TTF");
  return Promise.all(faces.map(async ([, name, weight, url]) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`字体下载失败：${response.status}`);
    return { name, weight: Number(weight) as 400 | 700, data: await response.arrayBuffer() };
  }));
}

// 头像等图片转成 data URL 交给 Satori（它自己取远程图没有超时）。只收 http(s) 地址和 Satori 认得的格式；
// 大小边读边数，超过 3MB 立即停（原来先整份读完再判断，内存兜不住）。地址来自后台站长配置，访客传不进来。
export async function loadImage(url: string) {
  "use cache";
  cacheLife("hours");
  if (!/^https?:\/\//i.test(url)) throw new Error("只收 http(s) 图片");
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response.ok || !["image/png", "image/jpeg", "image/gif"].includes(type)) {
    await response.body?.cancel();
    throw new Error(`图片不能用：${response.status} ${type}`);
  }
  const bytes = Buffer.from(await readLimited(response, 3_000_000));
  return `data:${type};base64,${bytes.toString("base64")}`;
}
