import { readLimited } from "./read-limited";

export const COVER_LIMIT = 20 * 1024 * 1024;
export const CLIP_LIMIT = 6 * 1024 * 1024;

async function load(url: string, limit: number, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(url);
  // 边读边数：没有 Content-Length 的分块响应也不会先整份读进内存
  const bytes = await readLimited(response, limit);
  return new Blob([bytes as BlobPart], { type: response.headers.get("content-type") ?? "" });
}

/**
 * 实况图下载：同时取封面和短片（各自限大小），一支失败就取消另一支；signal 取消（组件卸载、超时）时两支都停。
 * build 把两份拼成 Motion Photo，save 交给浏览器保存；每一步之前都看一眼是否已取消，取消后不会再触发保存。
 */
export async function downloadLivePhoto({ url, videoUrl, signal, build, save }: {
  url: string;
  videoUrl: string;
  signal: AbortSignal;
  build: (cover: Blob, clip: Blob, signal: AbortSignal) => Promise<Blob>;
  save: (file: Blob) => void;
}) {
  const sibling = new AbortController();
  const both = AbortSignal.any([signal, sibling.signal]);
  const fail = (error: unknown) => {
    sibling.abort(error);
    throw error;
  };
  const [cover, clip] = await Promise.all([load(url, COVER_LIMIT, both).catch(fail), load(videoUrl, CLIP_LIMIT, both).catch(fail)]);
  signal.throwIfAborted();
  const file = await build(cover, clip, signal);
  signal.throwIfAborted();
  save(file);
}
