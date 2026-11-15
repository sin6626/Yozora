"use client";

import { ArrowLeft } from "lucide-react";
import { useSyncExternalStore } from "react";
import { realHref } from "../lib/address-typing";
import { splitLocale } from "../lib/i18n/config";
import type { Messages } from "../lib/i18n/messages";
import { useLocales, useT } from "./locale-provider";
import "./back-link.css";

// 详情页“返回来时的那一页”（2026-11-15 站长：点进文章后只能用浏览器后退）。从站内别的页面点进来时，标题上方面包屑左边有一个
// “← 返回首页 / 时间线 / 搜索结果……”，写明回哪去，点了走浏览器后退（回去停在原来看到的位置）；窄屏的阅读工具条最前面也有一个（article-actions.tsx）。
// 去处读浏览器自己的历史：Navigation API 的 navigation.entries() 只列这个标签页里同一网站、连在一起的记录，当前记录的上一条就是后退会去的那一页，
// 所以写的和去的一定一致。从别的网站来（上一条不在列表里）、上一条只差锚点、或浏览器没有 Navigation API 时都不显示，面包屑照常用。

type NavigationApi = {
  currentEntry: { index: number } | null;
  entries(): { url: string | null }[];
  addEventListener(type: "currententrychange", listener: () => void): void;
  removeEventListener(type: "currententrychange", listener: () => void): void;
};
const navigationApi = () => (window as unknown as { navigation?: NavigationApi }).navigation;

// Next 在 useInsertionEffect 里 pushState，浏览器当场发 currententrychange；这时让 React 更新会报
// “useInsertionEffect must not schedule updates”（详情页到详情页跳转时，旧页的返回链接还订阅着），所以挪到下一个微任务
function subscribe(onChange: () => void) {
  const navigation = navigationApi();
  const listener = () => queueMicrotask(onChange);
  navigation?.addEventListener("currententrychange", listener);
  return () => navigation?.removeEventListener("currententrychange", listener);
}

// 后退会去的那一页（完整地址）；没有就是空字符串。当前页用 realHref()：地址栏“删旧打新”的动画期间 location 是中间帧
function previousHref() {
  const navigation = navigationApi();
  const index = navigation?.currentEntry?.index ?? 0;
  const url = index > 0 ? navigation?.entries()[index - 1]?.url : null;
  if (!url) return "";
  const target = new URL(url);
  return target.origin === location.origin && target.pathname !== new URL(realHref()).pathname ? url : "";
}

// 去处的名字：列表页写名字（分类页、话题筛选算文章、手记），带关键词的写“搜索结果”，文章、手记详情和其余页面写“上一页”
function placeOf(url: URL, locales: readonly string[], t: Messages) {
  if (url.searchParams.has("q")) return t.list.backSearch;
  const [section = "", detail] = splitLocale(url.pathname, locales).path.split("/").filter(Boolean);
  if ((section === "posts" || section === "notes") && detail) return t.list.backPrevious;
  const more = t.nav.moreLinks;
  const names: Record<string, string> = {
    "": t.nav.home, posts: t.nav.posts, categories: t.nav.posts, notes: t.nav.notes, timeline: t.nav.timeline, murmurs: t.nav.murmurs,
    projects: more.projects.label, friends: more.friends.label, says: more.says.label, thinking: more.thinking.label,
  };
  return names[section] ?? t.list.backPrevious;
}

export function useBackTarget() {
  const href = useSyncExternalStore(subscribe, previousHref, () => "");
  const t = useT();
  const locales = useLocales();
  if (!href) return null;
  return { href, label: t.list.backTo(placeOf(new URL(href), locales, t)) };
}

export default function BackLink() {
  const target = useBackTarget();
  if (!target) return null;
  return (
    <a
      className="detail-back"
      href={target.href}
      onClick={(event) => {
        // 按着修饰键或中键：照常在新标签页打开那一页
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        history.back();
      }}
    >
      <ArrowLeft aria-hidden="true" size={14} strokeWidth={1.75} />
      {target.label}
    </a>
  );
}
