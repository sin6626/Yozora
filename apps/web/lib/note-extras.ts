// 手记详情的头图、横幅（后台手记“日记设置”里的封面图与附加字段 banner，存在 meta 里）和左侧时间线的纯函数。
// banner 的格式照 Mix Space 内置预设（Core meta-preset.service.ts）：字符串，或 { type: info|warning|error|success|secondary, message, className? }；
// className 是 Shiro 用的 Tailwind 类名，这里不认（站点没有 Tailwind，也不放行后台写的任意类名）。
import { safeUrl } from "./safe-url";

export const bannerTypes = ["info", "warning", "error", "success", "secondary"] as const;
export type BannerType = (typeof bannerTypes)[number];
export type NoteBanner = { type: BannerType; message: string };
export type NoteMeta = { cover: string | null; banner: NoteBanner | null };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseNoteMeta(meta: unknown): NoteMeta {
  if (!isRecord(meta)) return { cover: null, banner: null };
  const cover = typeof meta.cover === "string" ? safeUrl(meta.cover.trim()) ?? null : null;
  const raw = typeof meta.banner === "string" ? { message: meta.banner } : meta.banner;
  let banner: NoteBanner | null = null;
  if (isRecord(raw) && typeof raw.message === "string" && raw.message.trim()) {
    const type = bannerTypes.find((item) => item === raw.type) ?? "info";
    banner = { type, message: raw.message.trim() };
  }
  return { cover, banner };
}

// 时间线里当前这篇前后各 n 篇（列表按时间倒序，靠边时那一侧少几篇）；当前这篇不在列表里（加密、定时）时返回空。
export function aroundCurrent<T extends { id: string }>(items: T[], id: string, n = 10): T[] {
  const index = items.findIndex((item) => item.id === id);
  return index < 0 ? [] : items.slice(Math.max(0, index - n), index + n + 1);
}
