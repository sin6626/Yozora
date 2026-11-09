"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Toast } from "@base-ui/react/toast";
import { io, type Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import { useIsland } from "../lib/island-store";
import { notificationSettings } from "../lib/notification-copy";
import { localizeHref, splitLocale } from "../lib/i18n/config";
import { realtimeActions, type ArticleKind, type RealtimeAction, type RealtimeContext } from "../lib/realtime";
import { refreshArticle } from "./cache-actions";
import { useLocale, useLocales, useT } from "./locale-provider";
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
async function localTitle(apiUrl: string, id: string | undefined, locale: string, title: string): Promise<{ text: string; lang?: string }> {
  if (locale === "zh" || !id) return { text: title, lang: locale === "zh" ? undefined : "zh-CN" };
  try {
    const response = await fetch(`${apiUrl}/ai/translations/article/${encodeURIComponent(id)}?lang=${locale}`, { signal: AbortSignal.timeout(3000) });
    const data = response.ok ? await response.json() : null;
    if (typeof data?.title === "string" && data.title.trim()) return { text: data.title };
  } catch {}
  return { text: title, lang: "zh-CN" };
}

// 正在看的文章/手记/页面（详情页的 ArticleNotifications 登记、离开时清掉），实时消息据此判断“是不是这篇”
let currentArticle: RealtimeContext["article"] = null;
// 正在看的那篇的最新阅读数（Core 广播 ARTICLE_READ_COUNT_UPDATE），ReadCount 读它
const useReadCounts = create<Record<string, number>>(() => ({}));
// 修改后等一下再刷新：Webhook 让 Core 的接口缓存失效与这条消息几乎同时出发，稍等确保读到的是新内容
const refreshDelay = 1000;
// 删除后先让读者看清播报再跳回列表
const leaveDelay = 1500;

function Connection({ url, apiUrl, children }: { url: string; apiUrl: string; children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const router = useRouter();
  // 播报文案按当前语言取；放进 ref，连接不用因为文案对象变化而重建。router.refresh 后译文可能更新了，每次渲染后跟上
  const t = useT().notifications;
  const copy = useRef(t);
  const locale = useRef(useLocale());
  const locales = useRef(useLocales());
  useEffect(() => {
    copy.current = t;
  }, [t]);
  useEffect(() => {
    const connection = io(url, { transports: ["websocket"], autoConnect: false });
    // 消息 → 要做的事由 lib/realtime.ts 决定；播报都在页头夜航岛上
    const onMessage = (message: unknown) => {
      const context = { path: splitLocale(location.pathname, locales.current).path, article: currentArticle };
      for (const action of realtimeActions(message, context)) void run(action);
    };
    const run = async (action: RealtimeAction) => {
      switch (action.type) {
        case "online": return setOnline(action.count);
        case "reads": return useReadCounts.setState({ [action.id]: action.count });
        case "refresh-article":
          await new Promise((resolve) => setTimeout(resolve, refreshDelay));
          await refreshArticle(action.kind, action.id);
          // 等待期间读者可能已经去了别的页面，那就只让缓存失效、不刷新当前页
          return currentArticle?.id === action.id ? router.refresh() : undefined;
        case "refresh-list":
          await new Promise((resolve) => setTimeout(resolve, refreshDelay));
          return router.refresh();
        case "leave":
          await new Promise((resolve) => setTimeout(resolve, leaveDelay));
          // 等待期间读者自己离开了被删的那篇，就不要再把他拉回列表
          return currentArticle?.id === action.id ? router.replace(localizeHref(action.href, locale.current)) : undefined;
        case "announce": {
          // 文字按类型从当前语言的文案里取；新文章/手记第二行是标题（书名号也在文案里，英文是引号），思考、一言是正文开头（原样中文）
          const text = copy.current[action.copy];
          const title = action.title ? await localTitle(apiUrl, action.titleId, locale.current, action.title) : null;
          const detail = title ? { text: copy.current.quoted(title.text), lang: title.lang } : action.text ? { text: action.text, lang: locale.current === "zh" ? undefined : "zh-CN" } : { text: text.description };
          useIsland.getState().push({ icon: action.icon, title: text.title, detail: detail.text, detailLang: detail.lang, href: action.href, duration: 5000 });
        }
      }
    };
    connection.on("message", onMessage);
    connection.on("connect", () => setSocket(connection));
    connection.connect();
    return () => {
      connection.off("message", onMessage);
      connection.disconnect();
    };
  }, [url, apiUrl, router]);
  return <SocketContext value={socket}><OnlineContext value={online}>{children}</OnlineContext></SocketContext>;
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

// 详情页挂一个：加入这篇的房间（Core 只把修改、删除、译文推给房间里的人），并登记成“正在看的这篇”
export function ArticleNotifications({ id, kind }: { id: string; kind: ArticleKind }) {
  const socket = useContext(SocketContext);
  useEffect(() => {
    const article = { id, kind };
    currentArticle = article;
    return () => {
      if (currentArticle === article) currentArticle = null;
    };
  }, [id, kind]);
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

// 详情页的阅读数：先用页面读到的数，有人读这篇时跟着 Core 的广播实时变
export function ReadCount({ id, count }: { id: string; count: number }) {
  const live = useReadCounts((state) => state[id]);
  const t = useT().list;
  return <span className="read-count">{t.reads(Math.max(live ?? 0, count))}</span>;
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
