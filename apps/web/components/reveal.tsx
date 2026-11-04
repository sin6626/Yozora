"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import "./reveal.css";

// “进入页面播一次”（Motion 里 whileInView + once 的意思）：带 data-reveal 的块一插进页面就由 CSS 播一次上浮淡入（reveal.css），
// 首屏里的不等脚本，整页打开时也不会先露出来再藏起来重播。挂载时还在视野下方的先标成 waiting 藏起来，
// 第一次进入视野时改成 shown 再播，之后不再重播；同一批、同一列表里一起进来的重新从 0 数序号，不会越往下等得越久。
// 标记在自己的 effect 里加：effect 只在这个元素水合之后才跑，流式插进来、还没水合的元素不会被提前改属性（否则水合报错）。
// 离开页面时 Next 用 Activity 藏起整页、清理 effect，标记去掉；回来时首屏重播，下方重新等滚到。
// index：同一列表里的序号，一条比一条晚 60 毫秒。kind：不用通用的整块上浮、自己编排里面动画的块（如时间线的一个月），
// 这时 Reveal 只管“现在播还是滚到再播”，动画写在各自的 CSS 里（看 [data-reveal="kind"] 和 data-reveal-state）。
let observer: IntersectionObserver | null = null;

function revealVisible(entries: IntersectionObserverEntry[]) {
  const counts = new Map<ParentNode | string | null, number>();
  const targets = entries
    .filter((entry) => entry.isIntersecting)
    .map((entry) => entry.target as HTMLElement)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const target of targets) {
    // 普通块按同一列表一条一条数；带 data-reveal-weight 的（时间线的一个月）整批按条数累加，上一个月画完下一个月接着画
    const key = target.dataset.revealWeight ? "weighted" : target.parentNode;
    const order = counts.get(key) ?? 0;
    counts.set(key, order + Number(target.dataset.revealWeight ?? 1));
    target.style.setProperty("--reveal-i", String(order));
    target.dataset.revealState = "shown";
    observer?.unobserve(target);
  }
}

type RevealProps = {
  as?: "div" | "li" | "section";
  index?: number;
  kind?: string;
  className?: string;
  "aria-labelledby"?: string;
  children: ReactNode;
  [attribute: `data-${string}`]: string | undefined;
};

export default function Reveal({ as: Tag = "div", index = 0, kind = "", children, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement & HTMLLIElement & HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    observer ??= new IntersectionObserver(revealVisible, { rootMargin: "0px 0px -8% 0px" });
    element.dataset.revealState = "waiting";
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      delete element.dataset.revealState;
    };
  }, []);
  return <Tag ref={ref} {...props} data-reveal={kind} style={{ "--reveal-i": index } as CSSProperties}>{children}</Tag>;
}
