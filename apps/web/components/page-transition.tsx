"use client";

import { ViewTransition as Transition, type ReactNode } from "react";
import { realHref } from "../lib/address-typing";

// 整页换页过渡（globals.css 的 page-leave / page-enter）。React 在这一层里任何内容变化时都会跑过渡，
// 包括流式内容晚到（首屏底部“喜欢本站 / 订阅”）和 router.refresh()：整页又失焦淡出、浮上来一遍，像首屏动画重播（2026-11-10 站长录屏）。
// 所以过渡就绪时看一眼地址：和上一次播的时候一样就是没换页，直接跳过这次过渡（内容立刻换上，不闪）。
const pageOf = () => realHref().split("#")[0];
let shown = typeof window === "undefined" ? "" : pageOf();

function onUpdate() {
  const page = pageOf();
  if (page !== shown) {
    shown = page;
    return;
  }
  // ponytail: 没有 document.activeViewTransition 的浏览器（Chrome 142 以前等）照旧会再过渡一遍
  (document as Document & { activeViewTransition?: ViewTransition | null }).activeViewTransition?.skipTransition();
}

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <Transition default="page-switch" onUpdate={onUpdate}>
      {children}
    </Transition>
  );
}
