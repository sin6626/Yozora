"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useT } from "./locale-provider";
import "./article-toc.css";

// 文章目录：读取正文里实际渲染出来的标题。
// Lexical 标题的 id 由同版 Haklex 渲染器生成（整篇唯一 slug），Markdown 标题的 id 由 article-body.tsx 生成，
// 直接读 DOM 可以保证锚点与正文一致，不必在这里重复实现两套 slug 规则。
type Entry = { id: string; text: string; level: number };

const headingSelector = ".article-rich :is(h1, h2, h3, h4), .article-body :is(h1, h2, h3, h4)";
// 滚动到距视口顶部这么近时，视为进入该章节。
const activeOffset = 120;

let cached: { key: string; entries: Entry[] } = { key: "", entries: [] };

function headings() {
  const main = document.querySelector("main");
  if (!main) return [];
  // Next 会把上一个页面隐藏保留在 DOM 里，只取当前可见的标题。
  // 嵌在正文里的组件可能自带只给读屏的标题（白板 Excalidraw 的 “Canvas actions” 被裁成 1×1 像素），checkVisibility 挡不住，按大小排除
  return [...main.querySelectorAll<HTMLHeadingElement>(headingSelector)].filter((heading) => {
    if (!heading.id || !heading.checkVisibility()) return false;
    const { width, height } = heading.getBoundingClientRect();
    return width > 1 && height > 1;
  });
}

function getEntries() {
  const entries = headings().map((heading) => ({ id: heading.id, text: heading.textContent?.trim() ?? "", level: Number(heading.tagName[1]) }));
  const key = JSON.stringify(entries);
  if (key !== cached.key) cached = { key, entries };
  return cached.entries;
}

// 正文流式渲染、富文本在客户端渲染，内容变化时重新收集标题。
function subscribeContent(onChange: () => void) {
  const main = document.querySelector("main");
  const observer = new MutationObserver(onChange);
  if (main) observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["id", "hidden", "style"] });
  return () => observer.disconnect();
}

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getActiveId() {
  const list = headings();
  // 最后几节太短时标题到不了顶部，滚到底就直接算最后一节。
  if (list.length && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) return list.at(-1)!.id;
  let active: string | null = null;
  for (const heading of list) {
    if (heading.getBoundingClientRect().top > activeOffset) break;
    active = heading.id;
  }
  return active;
}

// 点目录平滑滚到该章节（开了“减少动态效果”时直接跳），地址栏换成章节锚点但不新增历史记录；
// 标题停的位置由 globals.css 里 html 的 scroll-padding-top 让开页头夜航岛。按住修饰键（新标签打开等）时交给浏览器。
function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const heading = document.getElementById(id);
  if (!heading || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  heading.scrollIntoView({ behavior, block: "start" });
  // 带上现有的 history.state（里面有 Next 的 __NA 标记）：Next 改写过 replaceState，state 不带标记时会当成路由更新，
  // 在 startTransition 里同步路由，整页跑一遍换页视图过渡（目录消失再出现、连点时页面上下抖）
  history.replaceState(history.state, "", `#${encodeURIComponent(id)}`);
}

// 正文里的标题；服务端拿不到正文 DOM，返回 null。窄屏的目录按钮（article-actions.tsx）用它判断这篇有没有目录。
export function useTocEntries() {
  return useSyncExternalStore<Entry[] | null>(subscribeContent, getEntries, () => null);
}

// children 是没有标题时显示的默认右栏内容；onJump 是点了某一节之后（窄屏目录浮层用它收起浮层）。
export default function ArticleToc({ children = null, onJump }: { children?: ReactNode; onJump?: () => void }) {
  // 服务端拿不到正文 DOM，先不渲染，避免先闪默认内容再变成目录。
  const entries = useTocEntries();
  // 窄屏浮层打开时侧栏那份目录也还在 DOM 里，标题 id 不能重复
  const headingId = useId();
  const activeId = useSyncExternalStore(subscribeScroll, getActiveId, () => null);
  const nav = useRef<HTMLElement>(null);
  const t = useT().article;
  // 目录比屏幕长时自己滚动（article-actions.css），当前章节保持在目录可见范围里；只滚目录，不动整页
  useEffect(() => {
    const box = nav.current;
    const link = box?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!box || !link || box.scrollHeight <= box.clientHeight) return;
    const top = link.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 40 || top > box.scrollTop + box.clientHeight - 60) box.scrollTo({ top: top - box.clientHeight / 3 });
  }, [activeId]);
  if (entries === null) return null;
  if (!entries.length) return children;
  const minLevel = Math.min(...entries.map((entry) => entry.level));
  return (
    <nav ref={nav} className="article-toc" aria-labelledby={headingId}>
      <h2 id={headingId}>{t.toc}</h2>
      <ol>
        {entries.map((entry) => (
          <li key={entry.id} data-depth={Math.min(entry.level - minLevel, 3)}>
            <a href={`#${encodeURIComponent(entry.id)}`} onClick={(event) => { jump(event, entry.id); onJump?.(); }} aria-current={entry.id === activeId ? "location" : undefined}>
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
