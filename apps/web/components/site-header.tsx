"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link, { useT } from "./locale-provider";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useIsland, type IslandActivityIcon } from "../lib/island-store";
import LanguageMenu from "./language-menu";
import ThemeToggle from "./theme-switcher";
import "./site-header.css";

// 页头“夜航岛”：同一个元素在四种状态之间用弹簧变形（Motion 的 layout 动画），像 iPhone 的灵动岛。
// - bar：页面顶部，铺开成整条页头（站点标识 | 星座导航 | 工具），透明；
// - expanded：往下滚以后，列表等普通页面一直是这枚深色导航条（导航随时可点）；阅读页在鼠标移上胶囊、
//   键盘聚焦或导航面板开着时也展开成它；
// - compact：只在阅读页（文章/手记/页面详情，由 IslandReading 登记）往下读时，收成“头像 + 标题 + 阅读进度环”的小胶囊，
//   少挡正文；（2026-10-29 用户定：普通页面不收拢，收拢只属于“正在读”）
// - activity：有实时活动（新文章发布、文章修改删除……）时临时变形播报，几秒后缩回去。活动由 lib/island-store.ts 排队。
// 导航（nav）始终渲染、只用 CSS 按状态显隐，避免面板和手机菜单反复卸载。

// 弹簧约 0.4 秒到位，带一点点回弹（阻尼比约 0.8），手感比硬切更软，接近灵动岛
const spring = { type: "spring", stiffness: 260, damping: 26, mass: 1 } as const;
// 从有导航的状态（bar / expanded）变成小胶囊时，先在原来的大小里把导航淡出这么久，再收拢
const fadeOutMs = 90;
const fullModes = new Set(["bar", "expanded"]);

// 状态分两步换：目标状态变了以后，如果是“从有导航变成没有导航”（收拢、播报），先标记 fading 让旧内容淡出，
// 过 fadeOutMs 再真正切换，外框才开始变形——不会先闪出一条空着的长黑条。其余方向立即切换，新内容在变形中淡入。
function useStagedMode(target: string) {
  const [shown, setShown] = useState(target);
  const deferred = target !== shown && fullModes.has(shown) && !fullModes.has(target);
  // 其余方向在渲染时直接跟上目标（渲染期调整状态，不用 effect）
  if (target !== shown && !deferred) setShown(target);
  useEffect(() => {
    if (!deferred) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setShown(target), reduce ? 0 : fadeOutMs);
    return () => clearTimeout(timer);
  }, [deferred, target]);
  return [deferred ? shown : target, deferred] as const;
}
const scrollThreshold = 80;

// 换页时调用 onNavigate（松开“钉住”的展开状态）
function NavigateListener({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  useEffect(() => onNavigate(), [pathname, onNavigate]);
  return null;
}


// 阅读进度环：一圈淡轨道，强调色按进度画满
function ProgressRing({ progress }: { progress: number }) {
  const radius = 7;
  const length = 2 * Math.PI * radius;
  return (
    <svg className="island-ring" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <circle cx="9" cy="9" r={radius} className="island-ring-track" />
      <circle cx="9" cy="9" r={radius} className="island-ring-bar" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />
    </svg>
  );
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > scrollThreshold);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return scrolled;
}

// account：读者登录入口（header-account.tsx），放在主题按钮左边
// activityIcons：播报用的图标（island-icons.tsx，服务端渲染好传进来）
// search：⌘K 搜索（header-search.tsx），放在最左边
// presence：站长此刻在用的 App、在听的歌（owner-presence.tsx），挂在站名下面
export default function SiteHeader({ brand, nav, search, account, presence, activityIcons }: { brand: ReactNode; nav: ReactNode; search?: ReactNode; account?: ReactNode; presence?: ReactNode; activityIcons: Record<IslandActivityIcon, ReactNode> }) {
  const t = useT().header;
  const scrolled = useScrolled();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // 触屏没有悬停：点一下收拢的胶囊就“钉住”展开，点别处或换页后松开
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!pinned) return;
    const release = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest(".site-header, .navigation-Positioner")) setPinned(false);
    };
    document.addEventListener("pointerdown", release);
    return () => document.removeEventListener("pointerdown", release);
  }, [pinned]);
  // 鼠标悬停按“鼠标最后的位置是否在胶囊或下拉面板范围内”来算，而不是靠进入 / 离开事件：
  // 岛会变形、面板会被移除、鼠标会移出窗口，这些时候浏览器不一定补发“离开”，悬停状态会卡住，岛就一直展开。
  // 鼠标移动、页面滚动、岛变形结束时都重新判断一次；窗口失去焦点或鼠标移出窗口时清掉。
  const islandRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const recheckHover = useCallback(() => {
    const point = pointer.current;
    const island = islandRef.current;
    if (!point || !island) return setHovered(false);
    const inside = (element: Element | null) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    };
    setHovered(inside(island) || inside(document.querySelector(".navigation-Positioner")));
  }, []);
  // 键盘聚焦只认 Tab 键：鼠标点过链接后切到别的软件再切回，浏览器会把焦点还给那个链接，
  // 而且因为最后一次操作是键盘（⌘+Tab），这次聚焦也算 :focus-visible，不能因此展开
  const lastTab = useRef(0);
  useEffect(() => {
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.current = { x: event.clientX, y: event.clientY };
      recheckHover();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; recheckHover(); });
    };
    const onLeaveWindow = (event: MouseEvent) => {
      if (event.relatedTarget) return;
      pointer.current = null;
      setHovered(false);
    };
    const onWindowBlur = () => {
      pointer.current = null;
      setHovered(false);
      setFocused(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Tab") lastTab.current = Date.now(); };
    document.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseout", onLeaveWindow);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onLeaveWindow);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [recheckHover]);
  const navOpen = useIsland((state) => state.navOpen);
  const reading = useIsland((state) => state.reading);
  const activity = useIsland((state) => state.activities[0]);
  const shift = useIsland((state) => state.shift);

  // 每条活动播完自动换下一条
  useEffect(() => {
    if (!activity) return;
    const timer = setTimeout(shift, activity.duration);
    return () => clearTimeout(timer);
  }, [activity, shift]);

  const unpin = useCallback(() => setPinned(false), []);
  const collapsible = reading !== null && !(hovered || focused || pinned || navOpen);
  const target = activity ? "activity" : !scrolled ? "bar" : collapsible ? "compact" : "expanded";
  const [mode, fading] = useStagedMode(target);
  // 岛变形（弹簧约 0.4 秒）结束后，按鼠标位置重新判断一次悬停
  useEffect(() => {
    const timer = setTimeout(recheckHover, 450);
    return () => clearTimeout(timer);
  }, [mode, recheckHover]);
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <MotionConfig reducedMotion="user">
      <header className="site-header" data-mode={mode} data-fading={fading ? "" : undefined}>
        <Suspense fallback={null}><NavigateListener onNavigate={unpin} /></Suspense>
        <motion.div
          layout
          transition={spring}
          className="site-header-inner island"
          ref={islandRef}
          style={{ borderRadius: mode === "activity" ? 26 : 999 }}
          // 变形期间裁掉露出胶囊的内容（平时不裁，免得切掉头像的光晕）
          onLayoutAnimationStart={() => { if (islandRef.current) islandRef.current.dataset.animating = ""; }}
          onLayoutAnimationComplete={() => { if (islandRef.current) delete islandRef.current.dataset.animating; }}
          // 只有用 Tab 键聚焦进来才展开：鼠标点过导航链接或主题按钮后焦点会留在页头，切走再切回时焦点也会回来，
          // 这两种都不算，否则往下读文章时岛会一直展开、不收成标题 + 进度环（回归测试 site-header-island.mjs）
          onFocus={(event) => {
            if ((event.target as Element).matches(":focus-visible") && Date.now() - lastTab.current < 1000) setFocused(true);
          }}
          onBlur={onBlur}
        >
          <motion.div layout="position" transition={spring} className="island-brand">
            <Link className="site-brand" href="/" aria-label={t.home}>{brand}</Link>
            {presence}
          </motion.div>

          <motion.div layout="position" transition={spring} className="island-nav">{nav}</motion.div>

          <AnimatePresence initial={false} mode="popLayout">
            {mode === "compact" && reading && (
              <motion.button
                key="context"
                // layout：外框靠缩放变形时给内容做反向校正，标题不会被跟着拉伸
                layout="position"
                type="button"
                className="island-context"
                onClick={() => setPinned(true)}
                initial={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                transition={{ duration: 0.22, delay: 0.06 }}
                aria-label={t.reading(t.kinds[reading.kind], reading.title, Math.round(reading.progress * 100))}
              >
                <span className="island-section">{t.kinds[reading.kind]}</span>
                <span className="island-title">{reading.title}</span>
                {reading.date && <time className="island-date">{reading.date.slice(5)}</time>}
                <span className="island-progress">
                  <ProgressRing progress={reading.progress} />
                  <span className="island-percent">{Math.round(reading.progress * 100)}%</span>
                </span>
              </motion.button>
            )}
            {activity && (
              <motion.div
                key={activity.id}
                layout="position"
                className="island-activity"
                data-tone={activity.icon}
                role="status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.2 }}
              >
                {/* 岛变形到位后图标先弹出来，文字随后淡入 */}
                <motion.span
                  className="island-activity-icon"
                  aria-hidden="true"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.26 }}
                >
                  {activityIcons[activity.icon]}
                </motion.span>
                <motion.span
                  className="island-activity-text"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: 0.32 }}
                >
                  <strong>{activity.title}</strong>
                  {activity.detail && <span>{activity.detail}</span>}
                </motion.span>
                {activity.href && <Link className="island-activity-link" href={activity.href}>{t.goSee}</Link>}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout="position" transition={spring} className="site-header-tools island-tools">
            {search}
            {account}
            <LanguageMenu host />
            <ThemeToggle />
          </motion.div>
        </motion.div>
      </header>
    </MotionConfig>
  );
}
