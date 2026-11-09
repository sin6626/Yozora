"use client";

import { Popover } from "@base-ui/react/popover";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
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
import { appIconSrc } from "../lib/app-icons";
import Link, { useT } from "./locale-provider";
import { useSocket } from "./notifications";
import "lxgw-wenkai-webfont/lxgwwenkai-light.css";
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "./owner-presence.css";

// 页头头像右边的站名区（样式在 owner-presence.css）：平时是站名；站长在电脑前时（Mac 上的 Yohaku Companion 在报），
// 站名停 6 秒后向上滚成“正在用的 App 图标 + 音频条”停 14 秒（一个周期里占七成），再向上滚回站名。
// 在放歌时音频条在跳，没放歌时是几颗安静的点。鼠标移上去（或键盘聚焦、触屏点一下）弹出卡片：一句话说站长在用什么、在听什么。
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

// App 图标：认得的 App 用清晰的矢量图标（lib/app-icons.ts），否则用 Companion 传到图床的 32×32 小图（按原大小显示，不放大），
// 都没有时用 App 名的首字（写在 CSS 里，不进站名的文字）
function AppIcon({ app, className }: { app: PresenceApp; className: string }) {
  const vector = appIconSrc(app.name);
  // eslint-disable-next-line @next/next/no-img-element -- 图标是本站的 SVG 或图床上的任意地址
  if (vector) return <img className={className} src={vector} alt="" data-kind="vector" />;
  // eslint-disable-next-line @next/next/no-img-element -- 同上
  if (app.icon) return <img className={className} src={app.icon} alt="" data-kind="bitmap" />;
  const letter = JSON.stringify(Array.from(app.name)[0].toUpperCase());
  return <span className={className} data-kind="letter" style={{ "--letter": letter } as CSSProperties} />;
}

// 四根音频条：在放歌时上下跳，没放歌时缩成几颗安静的点
// 换 App 时图标“向下滚”换过去（2026-11-09 站长要求，原来是瞬间替换）：新图标从上方滑进来，旧的往下滑出去，
// 两个叠在同一格里、格子裁掉滑出去的部分；减少动态效果时直接换（e2e presence-switch.mjs）
// Motion 的 useReducedMotion 只在挂载时读一次，打开页面后再改系统设置不生效，这里跟着媒体查询走
const slide = { duration: 0.42, ease: [0.65, 0, 0.35, 1] } as const;
const appSlide = {
  enter: (reduce: boolean) => ({ y: reduce ? 0 : "-100%" }),
  center: { y: 0 },
  exit: (reduce: boolean) => (reduce ? { y: 0, transition: { duration: 0 } } : { y: "100%" }),
};
const reduceQuery = "(prefers-reduced-motion: reduce)";
const watchReduce = (onChange: () => void) => {
  const query = matchMedia(reduceQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
function AppSlot({ app }: { app: PresenceApp | null }) {
  const reduce = useSyncExternalStore(watchReduce, () => matchMedia(reduceQuery).matches, () => false);
  if (!app) return null;
  return (
    <span className="brand-ticker-apps">
      {/* custom 让正在滑出去的旧图标也拿到最新的“减少动态效果”（它保留的是自己最后一次渲染时的属性） */}
      <AnimatePresence initial={false} custom={reduce}>
        <motion.span
          key={app.name}
          className="brand-ticker-app"
          data-app={app.name}
          custom={reduce}
          variants={appSlide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={slide}
        >
          <AppIcon app={app} className="brand-ticker-icon" />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

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

// 一句话里的名字：{owner}、{app}（带图标）、{title}、{artist}；App 名和歌名加重
function Sentence({ template, owner, app, media }: { template: string; owner: string; app: PresenceApp | null; media: Presence["media"] }) {
  return template.split(/(\{(?:owner|app|title|artist)\})/).map((part, index) => {
    if (part === "{owner}") return <span key={index}>{owner}</span>;
    if (part === "{app}" && app)
      return (
        <strong key={index} className="presence-note-app">
          <AppIcon app={app} className="presence-note-icon" />
          {app.name}
        </strong>
      );
    if (part === "{title}" && media) return <strong key={index}>{media.title}</strong>;
    if (part === "{artist}" && media?.artist) return <span key={index}>{media.artist}</span>;
    return part;
  });
}

// 悬停卡片：用首屏的霞鹜文楷写一句话（“Sin 正开着 Chrome，耳机里是颜人中的《晚安》。”），像随手留的一张字条；
// 在放歌时下面一行：放歌软件的图标（认不得时是一张很小的、在转的唱片）+ 进度线 + 时间
function PresenceCard({ owner, app, media }: Presence & { owner: string }) {
  const t = useT().header.presence;
  const now = useNow(1000);
  const position = media ? mediaPosition(media, now) : undefined;
  const progress = media?.duration && position !== undefined ? position / media.duration : undefined;
  const template = media ? (app ? (media.artist ? t.noteAppMediaArtist : t.noteAppMedia) : media.artist ? t.noteMediaArtist : t.noteMedia) : t.noteApp;
  const playerIcon = media?.player ? appIconSrc(media.player) : undefined;
  // eslint-disable-next-line @next/next/no-img-element -- 本站的 SVG 图标
  const player = (inline: boolean) => playerIcon ? <img className={`presence-note-player${inline ? " presence-note-inline" : ""}`} src={playerIcon} alt="" aria-hidden="true" /> : <span className={`presence-disc${inline ? " presence-note-inline" : ""}`} aria-hidden="true" />;
  return (
    <div className="presence-note">
      <p className="presence-note-text">
        <Sentence template={template} owner={owner} app={app} media={media} />
        {/* 播放器没给进度时，图标跟在句子后面 */}
        {media && progress === undefined && player(true)}
      </p>
      {media && progress !== undefined && position !== undefined && media.duration && (
        <div className="presence-note-track" style={{ "--progress": progress } as CSSProperties}>
          {player(false)}
          <span className="presence-note-line" aria-hidden="true">
            <span />
          </span>
          <span className="presence-note-time">
            {formatClock(position)} / {formatClock(media.duration)}
          </span>
        </div>
      )}
    </div>
  );
}

// name：站名；owner：站长名字（卡片那句话的主语）
export default function OwnerPresence({ apiUrl, name, owner, preview }: { apiUrl: string; name: string; owner: string; preview?: Presence }) {
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

  // 卡片挂在岛上：岛一开始变形（换状态，或收拢、播报前先淡出内容），卡片就跟着在原地淡出（0.09 秒，和岛内容淡出一样快）。
  // 不能等图标被藏起来才关：那时浏览器不补发“离开”，淡出途中 Base UI 还按藏起来的图标（算在左上角）重新定位，卡片会一路飞走。
  // 万一图标先被藏起来，卡片立刻隐藏（anchorHidden），并清掉悬停、聚焦，免得滚动一直停着（e2e owner-presence.mjs 逐帧检查）
  const [anchorHidden, setAnchorHidden] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const header = element.closest(".site-header");
    const mutations = new MutationObserver(() => setCardOpen(false));
    if (header) mutations.observe(header, { attributes: true, attributeFilter: ["data-mode", "data-fading"] });
    const sizes = new ResizeObserver(() => {
      const visible = element.checkVisibility();
      setAnchorHidden(!visible);
      if (visible) return;
      setCardOpen(false);
      setHovered(false);
      setFocused(false);
    });
    sizes.observe(element);
    return () => {
      mutations.disconnect();
      sizes.disconnect();
    };
  }, []);

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

  const parts = [app && t.using(app.name), media && (media.artist ? t.listeningBy(media.title, media.artist) : t.listening(media.title))].filter(Boolean).join(" · ");
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
                <AppSlot app={app} />
                <Bars playing={Boolean(media)} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className="presence-card-positioner" side="bottom" align="start" sideOffset={14}>
                  <Popover.Popup className="presence-card" data-anchor-hidden={anchorHidden ? "" : undefined}>
                    <PresenceCard owner={owner} app={app} media={media} />
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
