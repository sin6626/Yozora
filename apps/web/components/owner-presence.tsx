"use client";

import { AnimatePresence, motion } from "motion/react";
import { Music2 } from "lucide-react";
import { useEffect, useState } from "react";
import { applyPresenceEvent, emptyPresence, presenceFromSnapshot } from "../lib/presence";
import { useT } from "./locale-provider";
import { useSocket } from "./notifications";

// 站长此刻在用的 App、在听的歌，显示在页头站名下面（样式在 site-header.css）。数据见 lib/presence.ts：
// 打开页面时从浏览器直接 GET Core 的 /fn/ps/update，之后听 WebSocket 广播即时更新。
// Mac 睡眠或断网后 Core 那边两分钟过期但不会广播，所以标签页可见时每分钟再读一次，切回标签页时也读一次。
const refreshMs = 60_000;

export default function OwnerPresence({ apiUrl }: { apiUrl: string }) {
  const t = useT().header.presence;
  const socket = useSocket();
  const [presence, setPresence] = useState(emptyPresence);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`${apiUrl}/fn/ps/update`, { credentials: "omit" });
        const body = response.ok ? await response.json() : null;
        if (!stopped) setPresence(presenceFromSnapshot(body));
      } catch {}
    };
    load();
    const timer = setInterval(load, refreshMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [apiUrl]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (message: unknown) => setPresence((state) => applyPresenceEvent(state, message) ?? state);
    socket.on("message", onMessage);
    return () => {
      socket.off("message", onMessage);
    };
  }, [socket]);

  const { app, media } = presence;
  const parts = [app && t.using(app.name), media && t.listening(media.title, media.artist)].filter(Boolean).join(" · ");
  return (
    <AnimatePresence initial={false}>
      {parts && (
        <motion.p
          key="presence"
          className="owner-presence"
          title={parts}
          initial={{ opacity: 0, y: -3, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(3px)" }}
          transition={{ duration: 0.3 }}
        >
          <span className="sr-only">{t.prefix}</span>
          {app && (
            <span className="owner-presence-app">
              {/* eslint-disable-next-line @next/next/no-img-element -- App 图标来自 Companion 配置的图床，任意地址 */}
              {app.icon ? <img src={app.icon} alt="" width={14} height={14} /> : <span className="owner-presence-dot" aria-hidden="true" />}
              {t.using(app.name)}
            </span>
          )}
          {app && media && <span aria-hidden="true"> · </span>}
          {media && (
            <span className="owner-presence-media">
              <Music2 aria-hidden="true" />
              {t.listening(media.title, media.artist)}
            </span>
          )}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
