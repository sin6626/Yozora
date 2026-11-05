"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Toast } from "@base-ui/react/toast";
import { io, type Socket } from "socket.io-client";
import { useIsland, type IslandActivityIcon } from "../lib/island-store";
import { getNotification, notificationSettings } from "../lib/notification-copy";
import { useLocale, useT } from "./locale-provider";
import "./notifications.css";

const SocketContext = createContext<Socket | null>(null);
// 全站在线人数：Core 在有人上线、下线时广播 VISITOR_ONLINE / VISITOR_OFFLINE，载荷带当前人数。
const OnlineContext = createContext<number | null>(null);

// url：Core 的实时连接（/web）；apiUrl：外文页面向 Core 要新文章标题的译文
export default function Notifications({ url, apiUrl, children }: { url: string; apiUrl: string; children: React.ReactNode }) {
  const t = useT().notifications;
  return (
    <Toast.Provider timeout={notificationSettings.timeout} limit={notificationSettings.limit}>
      <Connection url={url} apiUrl={apiUrl}>{children}</Connection>
      <Toast.Portal>
        <Toast.Viewport className="notification-viewport" aria-label={t.viewport}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

// 外文页面播报文章标题：向 Core 要这种语言的 AI 译文（GET /ai/translations/article/:id?lang=）；
// 刚发布时 AI 还没翻好、或读不到，就用 Core 推来的中文原题并标 zh-CN
async function localTitle(apiUrl: string, id: unknown, locale: string, title: string): Promise<{ text: string; lang?: string }> {
  if (locale === "zh" || typeof id !== "string") return { text: title, lang: locale === "zh" ? undefined : "zh-CN" };
  try {
    const response = await fetch(`${apiUrl}/ai/translations/article/${encodeURIComponent(id)}?lang=${locale}`, { signal: AbortSignal.timeout(3000) });
    const data = response.ok ? await response.json() : null;
    if (typeof data?.title === "string" && data.title.trim()) return { text: data.title };
  } catch {}
  return { text: title, lang: "zh-CN" };
}

function Connection({ url, apiUrl, children }: { url: string; apiUrl: string; children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  // 播报文案按当前语言取；放进 ref，连接不用因为文案对象变化而重建。router.refresh 后译文可能更新了，每次渲染后跟上
  const t = useT().notifications;
  const copy = useRef(t);
  const locale = useRef(useLocale());
  useEffect(() => {
    copy.current = t;
  }, [t]);
  useEffect(() => {
    const connection = io(url, { transports: ["websocket"], autoConnect: false });
    // 文章发布、修改、删除改由页头夜航岛播报（原来是右下角 Toast）；新文章带上标题
    const onMessage = async (message: unknown) => {
      const count = onlineCount(message);
      if (count !== null) setOnline(count);
      const notification = getNotification(message);
      if (!notification) return;
      const type = (message as { type: string }).type;
      const icons: Record<string, IslandActivityIcon> = { POST_CREATE: "post", POST_UPDATE: "update", POST_DELETE: "remove" };
      const data = (message as { data?: { id?: unknown; title?: unknown } }).data;
      const title = typeof data?.title === "string" && data.title.trim() ? await localTitle(apiUrl, type === "POST_DELETE" ? null : data.id, locale.current, data.title) : null;
      // getNotification（lib/notification-copy.ts）只决定播不播，文字按类型从当前语言的文案里取；书名号也在文案里（英文是引号）
      const text = copy.current[type as "POST_CREATE" | "POST_UPDATE" | "POST_DELETE"] ?? notification;
      useIsland.getState().push({ icon: icons[type] ?? "info", title: text.title, detail: title ? copy.current.quoted(title.text) : text.description, detailLang: title?.lang, duration: 5000 });
    };
    connection.on("message", onMessage);
    connection.on("connect", () => setSocket(connection));
    connection.connect();
    return () => {
      connection.off("message", onMessage);
      connection.disconnect();
    };
  }, [url, apiUrl]);
  return <SocketContext value={socket}><OnlineContext value={online}>{children}</OnlineContext></SocketContext>;
}

function onlineCount(message: unknown) {
  if (!message || typeof message !== "object" || !("type" in message) || !("data" in message)) return null;
  if (message.type !== "VISITOR_ONLINE" && message.type !== "VISITOR_OFFLINE") return null;
  const data = message.data as { online?: unknown } | null;
  return typeof data?.online === "number" ? data.online : null;
}

// 连上以后才有值；其他组件要听 Core 的广播时用它（如站长“正在用 / 在听”）
export const useSocket = () => useContext(SocketContext);

export function OnlineCount() {
  const online = useContext(OnlineContext);
  const t = useT().footer;
  return online === null ? null : <p className="site-online"><span className="site-online-dot" aria-hidden="true" />{t.online(online)}</p>;
}

// 正在阅读：每篇文章/手记一个房间（article-<id>，由 ArticleNotifications 加入），人数读 Core 的 /activity/online-count。
// 只在标签页可见时每 30 秒刷新一次；数据都在 Core 内存里，不写库。
export function ReadingCount({ apiUrl, id }: { apiUrl: string; id: string }) {
  const socket = useContext(SocketContext);
  const [count, setCount] = useState<number | null>(null);
  const t = useT().notifications;
  useEffect(() => {
    if (!socket) return;
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`${apiUrl}/activity/online-count`);
        const body = response.ok ? await response.json() as { rooms?: Record<string, number> } : null;
        // Core 的响应会把对象键转成下划线命名，房间名 article-<id> 在这里变成 article_<id>。
        if (!stopped && body) setCount(body.rooms?.[`article_${id}`] ?? body.rooms?.[`article-${id}`] ?? 0);
      } catch {}
    };
    // 稍等加入房间的消息先到 Core。
    const first = setTimeout(load, 1000);
    const timer = setInterval(load, 30000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [socket, apiUrl, id]);
  return count ? <span className="site-online"><span className="site-online-dot" aria-hidden="true" />{t.readingNow(count)}</span> : null;
}

export function ArticleNotifications({ id }: { id: string }) {
  const socket = useContext(SocketContext);
  useEffect(() => {
    if (!socket) return;
    const roomName = `article-${id}`;
    const join = () => socket.emit("message", { type: "join", payload: { roomName } });
    socket.on("connect", join);
    if (socket.connected) join();
    return () => {
      socket.off("connect", join);
      if (socket.connected) socket.emit("message", { type: "leave", payload: { roomName } });
    };
  }, [socket, id]);
  return null;
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  const t = useT().notifications;
  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast} className="notification-toast">
      <Toast.Content className="notification-content">
        <div className="notification-text">
          <Toast.Title className="notification-title" />
          <Toast.Description className="notification-description" />
        </div>
        <Toast.Close className="notification-close">{t.close}</Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
