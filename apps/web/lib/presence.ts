// 站长此刻在用的 App、在听的歌。来源是 Core 的云函数 /fn/ps/update（scripts/functions/ps-update.ts）：
// 页面打开时 GET 一次当前状态，之后听 WebSocket 广播的 fn#ps-update / fn#media-update。
// 数据从网络来，这里只认需要的字段；图标只放行 https。时间都是毫秒时间戳（服务器时间），时长和进度是秒。

export type PresenceApp = { name: string; icon?: string };
export type PresenceMedia = { title: string; artist?: string; player?: string; duration?: number; elapsed?: number; at?: number };
export type OwnerPresence = { app: PresenceApp | null; media: PresenceMedia | null };

export const emptyPresence: OwnerPresence = { app: null, media: null };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

function toApp(value: unknown): PresenceApp | null {
  const raw = (value ?? {}) as Record<string, unknown>;
  const name = text(raw.name);
  if (!name) return null;
  const app: PresenceApp = { name };
  const icon = text(raw.iconUrl);
  if (icon && /^https:\/\//i.test(icon)) app.icon = icon;
  return app;
}

function toMedia(value: unknown): PresenceMedia | null {
  const raw = (value ?? {}) as Record<string, unknown>;
  const title = text(raw.title);
  if (!title) return null;
  const media: PresenceMedia = { title };
  for (const key of ["artist", "player"] as const) {
    const value = text(raw[key]);
    if (value) media[key] = value;
  }
  for (const key of ["duration", "elapsed", "at"] as const) {
    const value = number(raw[key]);
    if (value !== undefined) media[key] = value;
  }
  return media;
}

// GET /fn/ps/update 的响应：{ processInfo, mediaInfo }
export function presenceFromSnapshot(body: unknown): OwnerPresence {
  const raw = (body ?? {}) as Record<string, unknown>;
  return { app: toApp(raw.processInfo), media: toMedia(raw.mediaInfo) };
}

// WebSocket 消息 { type, data }：是这两种广播就返回更新后的状态，别的消息返回 null
export function applyPresenceEvent(state: OwnerPresence, message: unknown): OwnerPresence | null {
  if (!message || typeof message !== "object") return null;
  const { type, data } = message as { type?: unknown; data?: unknown };
  if (type === "fn#ps-update") return { ...state, app: toApp((data as { processInfo?: unknown } | null)?.processInfo) };
  if (type === "fn#media-update") return { ...state, media: toMedia(data) };
  return null;
}

// 此刻播放到第几秒：采样时的进度加上之后过去的时间，不超过时长。
// ponytail: 直接用访客电脑的时钟和服务器时间相减，时钟差几秒进度就差几秒；差得多时再带上服务器时间校准
export function mediaPosition(media: PresenceMedia, now: number) {
  if (media.elapsed === undefined) return undefined;
  const position = media.elapsed + (media.at ? Math.max(0, now - media.at) / 1000 : 0);
  return media.duration ? Math.min(position, media.duration) : position;
}

// 0:07、3:45、1:02:03
export function formatClock(totalSeconds: number) {
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
