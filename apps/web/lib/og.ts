import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { readLimited } from "./read-limited";

// 分享图（app/api/og/route.tsx）用到的字体和图片。
export const ogSize = { width: 1200, height: 630 };

// 复用项目已授权的霞鹜文楷轮廓；运行时从磁盘读取，不需要为每个标题向第三方请求字体。
let coverFont: Promise<Buffer> | undefined;
export function loadCoverFont() {
  return coverFont ??= readFile(join(process.cwd(), "assets/og/text.woff")).catch((error) => { coverFont = undefined; throw error; });
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
