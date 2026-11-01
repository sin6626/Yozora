// 站长此刻在用的 App、在听的歌。来源是 Core 的云函数 /fn/ps/update（scripts/functions/ps-update.ts）：
// 页面打开时 GET 一次当前状态，之后听 WebSocket 广播的 fn#ps-update / fn#media-update。
// 数据从网络来，这里只认需要的字段；图标只放行 https。

export type OwnerPresence = {
  app: { name: string; icon?: string } | null;
  media: { title: string; artist?: string } | null;
};

export const emptyPresence: OwnerPresence = { app: null, media: null };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

function toApp(value: unknown): OwnerPresence["app"] {
  const raw = (value ?? {}) as Record<string, unknown>;
  const name = text(raw.name);
  if (!name) return null;
  const icon = text(raw.iconUrl);
  return icon && /^https:\/\//i.test(icon) ? { name, icon } : { name };
}

function toMedia(value: unknown): OwnerPresence["media"] {
  const raw = (value ?? {}) as Record<string, unknown>;
  const title = text(raw.title);
  if (!title) return null;
  const artist = text(raw.artist);
  return artist ? { title, artist } : { title };
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
