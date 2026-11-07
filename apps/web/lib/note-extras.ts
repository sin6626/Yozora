// 手记详情的头图、横幅（后台手记“日记设置”里的封面图与附加字段 banner，存在 meta 里）的解析。
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

