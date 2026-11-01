"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useIsland } from "../lib/island-store";
import { applyPresenceEvent, emptyPresence, presenceFromSnapshot, type OwnerPresence as Presence } from "../lib/presence";
import { useT } from "./locale-provider";
import { useSocket } from "./notifications";

// 页头头像右边的站名区（样式在 site-header.css 的 .brand-ticker）：平时是站名；站长在电脑前时（Mac 上的 Yohaku Companion 在报），
// 每隔几秒向上滚一格，换成“正在用的 App 图标 + 跳动的音频条”，再向上滚回站名。站名一直占着位置（滚走时只是移开、变透明），
// 所以这一格始终是站名的宽度，导航不会跟着左右挪。
// 数据见 lib/presence.ts：打开页面时从浏览器 GET Core 的 /fn/ps/update，之后听 WebSocket 广播；Core 那边两分钟过期但不广播，
// 所以标签页可见时每分钟再读一次。preview 给调试页用，不读网络。
const refreshMs = 60_000;
// 每格停多久。只算看得见、没被打断的时间：读文章收成小胶囊、播报、标签页在后台、鼠标停在上面、导航面板开着时都不走
const dwellMs = { name: 6000, live: 4000 };
const tickMs = 250;
const spring = { type: "spring", stiffness: 260, damping: 28 } as const;
// 进场从下面滚上来，离场往上滚走
const shownState = { y: ["100%", "0%"], opacity: [0, 1] };
const hiddenState = { y: "-100%", opacity: 0 };

function usePresence(apiUrl: string, preview?: Presence) {
  const socket = useSocket();
  const [presence, setPresence] = useState(emptyPresence);

  useEffect(() => {
    if (preview) return;
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
  }, [apiUrl, preview]);

  useEffect(() => {
    if (preview || !socket) return;
    const onMessage = (message: unknown) => setPresence((state) => applyPresenceEvent(state, message) ?? state);
    socket.on("message", onMessage);
    return () => {
      socket.off("message", onMessage);
    };
  }, [socket, preview]);

  return preview ?? presence;
}

export default function OwnerPresence({ apiUrl, name, preview }: { apiUrl: string; name: string; preview?: Presence }) {
  const t = useT().header.presence;
  const { app, media } = usePresence(apiUrl, preview);
  const live = Boolean(app || media);
  const [slot, setSlot] = useState<"name" | "live">("name");
  const [hovered, setHovered] = useState(false);
  const navOpen = useIsland((state) => state.navOpen);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = live ? slot : "name";
  const paused = hovered || navOpen;

  useEffect(() => {
    if (!live || paused) return;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (document.hidden || !ref.current?.checkVisibility()) return;
      elapsed += tickMs;
      if (elapsed >= dwellMs[shown]) setSlot(shown === "name" ? "live" : "name");
    }, tickMs);
    return () => clearInterval(timer);
  }, [live, paused, shown]);

  const parts = [app && t.using(app.name), media && t.listening(media.title, media.artist)].filter(Boolean).join(" · ");
  return (
    <>
      <span
        ref={ref}
        className="site-brand-name brand-ticker"
        data-live={live ? "" : undefined}
        data-slot={shown}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <motion.span className="brand-ticker-name" initial={false} animate={shown === "name" ? shownState : hiddenState} transition={spring}>
          {name}
        </motion.span>
        <motion.span
          className="brand-ticker-live"
          aria-hidden="true"
          title={parts || undefined}
          initial={false}
          animate={shown === "live" ? shownState : hiddenState}
          transition={spring}
        >
          {app &&
            (app.icon ? (
              // eslint-disable-next-line @next/next/no-img-element -- App 图标由 Companion 传到图床，任意地址
              <img className="brand-ticker-icon" src={app.icon} alt="" width={18} height={18} />
            ) : (
              // 没有图标时用 App 名的首字（写在 CSS 里，不进站名的文字）
              <span className="brand-ticker-icon brand-ticker-monogram" style={{ "--letter": JSON.stringify(Array.from(app.name)[0].toUpperCase()) } as CSSProperties} />
            ))}
          {media && (
            <span className="brand-ticker-bars">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </motion.span>
      </span>
      {live && !preview && (
        <span id="owner-presence" className="sr-only">
          {t.prefix}
          {parts}
        </span>
      )}
    </>
  );
}
