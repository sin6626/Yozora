"use client";

import { Popover } from "@base-ui/react/popover";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useIsland } from "../lib/island-store";
import {
  applyPresenceEvent,
  emptyPresence,
  formatClock,
  mediaPosition,
  presenceFromSnapshot,
  type OwnerPresence as Presence,
  type PresenceApp,
} from "../lib/presence";
import Link, { useT } from "./locale-provider";
import { useSocket } from "./notifications";
import "./owner-presence.css";

// 页头头像右边的站名区（样式在 owner-presence.css）：平时是站名；站长在电脑前时（Mac 上的 Yohaku Companion 在报），
// 站名停 6 秒后向上滚成“正在用的 App 图标 + 音频条”停 14 秒（一个周期里占七成），再向上滚回站名。
// 在放歌时音频条在跳，没放歌时是几颗安静的点。鼠标移上去（或键盘聚焦、触屏点一下）弹出卡片：左边在用的 App，右边在听的歌。
// 站名一直占着位置（滚走时只是移开、变透明），所以这一格始终是站名的宽度，导航不会跟着挪。这一格在头像的首页链接外面，
// 悬停它不会点亮头像。数据见 lib/presence.ts：打开页面时从浏览器 GET Core 的 /fn/ps/update，之后听 WebSocket 广播；
// Core 那边两分钟过期但不广播，所以标签页可见时每分钟再读一次。preview 给调试页用，不读网络。
const refreshMs = 60_000;
// 每格停多久。只算看得见、没被打断的时间：读文章收成小胶囊、播报、标签页在后台、鼠标停在上面、聚焦、卡片或导航面板开着时都不走
const dwellMs = { name: 6000, live: 14000 };
const tickMs = 250;
const spring = { type: "spring", bounce: 0, duration: 0.5 } as const;
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

// 卡片开着时每秒刷新一次（播放进度、用了多久）
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function AppIcon({ app, className }: { app: PresenceApp; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- App 图标由 Companion 传到图床，任意地址
  if (app.icon) return <img className={className} src={app.icon} alt="" />;
  // 没有图标时用 App 名的首字（写在 CSS 里，不进站名的文字）
  const letter = JSON.stringify(Array.from(app.name)[0].toUpperCase());
  return <span className={`${className} presence-monogram`} style={{ "--letter": letter } as CSSProperties} />;
}

// 四根音频条：在放歌时上下跳，没放歌时缩成几颗安静的点
function Bars({ playing }: { playing: boolean }) {
  return (
    <span className="presence-bars" data-playing={playing ? "" : undefined} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function PresenceCard({ app, media }: Presence) {
  const t = useT().header.presence;
  const now = useNow(1000);
  const position = media ? mediaPosition(media, now) : undefined;
  const progress = media?.duration && position !== undefined ? position / media.duration : undefined;
  return (
    <div className="presence-card-body" data-columns={app ? 2 : 1}>
      {app && (
        <section className="presence-card-column">
          <p className="presence-card-eyebrow">
            <span className="presence-card-live" aria-hidden="true" />
            {t.usingLabel}
          </p>
          <div className="presence-card-main">
            <AppIcon app={app} className="presence-card-icon" />
            <div className="presence-card-text">
              <strong>{app.name}</strong>
              {app.since && <span>{t.forTime(Math.floor((now - app.since) / 60_000))}</span>}
            </div>
          </div>
        </section>
      )}
      {app && <span className="presence-card-divider" aria-hidden="true" />}
      <section className="presence-card-column">
        <p className="presence-card-eyebrow">{t.listeningLabel}</p>
        {media ? (
          <>
            <div className="presence-card-main">
              <span className="presence-vinyl" aria-hidden="true" />
              <div className="presence-card-text">
                <strong className="presence-card-title">{media.title}</strong>
                {(media.artist || media.player) && <span>{[media.artist, media.player && t.on(media.player)].filter(Boolean).join(" · ")}</span>}
              </div>
            </div>
            {progress !== undefined && position !== undefined && media.duration && (
              <div className="presence-progress" style={{ "--progress": progress } as CSSProperties}>
                <span className="presence-progress-track" aria-hidden="true">
                  <span className="presence-progress-fill" />
                </span>
                <span className="presence-progress-time">
                  <span>{formatClock(position)}</span>
                  <span>{formatClock(media.duration)}</span>
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="presence-card-main presence-card-quiet">
            <Bars playing={false} />
            <span>{t.quiet}</span>
          </div>
        )}
      </section>
    </div>
  );
}

export default function OwnerPresence({ apiUrl, name, preview }: { apiUrl: string; name: string; preview?: Presence }) {
  const t = useT().header.presence;
  const presence = usePresence(apiUrl, preview);
  const { app, media } = presence;
  const live = Boolean(app || media);
  const [slot, setSlot] = useState<"name" | "live">("name");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const navOpen = useIsland((state) => state.navOpen);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = live ? slot : "name";
  const paused = hovered || focused || cardOpen || navOpen;

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
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <motion.span className="brand-ticker-name" initial={false} animate={shown === "name" ? shownState : hiddenState} transition={spring} inert={shown !== "name"}>
          {/* 头像旁边已经有一个首页链接（读屏和 Tab 走那个），这里只给鼠标点 */}
          <Link href="/" tabIndex={-1} aria-hidden="true">
            {name}
          </Link>
        </motion.span>
        <motion.span className="brand-ticker-live" initial={false} animate={shown === "live" ? shownState : hiddenState} transition={spring} inert={shown !== "live"}>
          {live && (
            <Popover.Root open={cardOpen} onOpenChange={setCardOpen}>
              <Popover.Trigger openOnHover delay={120} closeDelay={160} className="brand-ticker-trigger" aria-label={t.label}>
                {app && <AppIcon app={app} className="brand-ticker-icon" />}
                <Bars playing={Boolean(media)} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className="presence-card-positioner" side="bottom" align="start" sideOffset={14}>
                  <Popover.Popup className="presence-card">
                    <PresenceCard app={app} media={media} />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
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
