"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// 首页下半部分“滚到才出现”（Motion 里 whileInView + once 的意思）：先标成 waiting（几乎透明、略低），
// 第一次进入视野时改成 shown，由 CSS 播一次上浮淡入（home-hero.css），之后不再重播。
// 标记在自己的 effect 里加：effect 只在这个元素水合之后才跑，流式插进来、还没水合的元素不会被提前改属性（否则水合报错）。
// 离开首页时 Next 用 Activity 藏起整页、清理 effect，标记去掉；回到首页再重新开始。没跑脚本时什么都不藏。
// index：同一列表里的序号，一条比一条晚 60 毫秒。
let observer: IntersectionObserver | null = null;

function revealVisible(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    (entry.target as HTMLElement).dataset.revealState = "shown";
    observer?.unobserve(entry.target);
  }
}

type RevealProps = { as?: "div" | "li"; index?: number; className?: string; children: ReactNode; [attribute: `data-${string}`]: string | undefined };

export default function Reveal({ as: Tag = "div", index = 0, children, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    observer ??= new IntersectionObserver(revealVisible, { rootMargin: "0px 0px -8% 0px" });
    element.dataset.revealState = "waiting";
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      delete element.dataset.revealState;
    };
  }, []);
  return <Tag ref={ref} {...props} data-reveal="" style={{ "--reveal-i": index } as CSSProperties}>{children}</Tag>;
}
