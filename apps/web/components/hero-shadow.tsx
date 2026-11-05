"use client";

import { useState, type ReactNode } from "react";
import Link from "./locale-provider";

// 首屏头像后面的“影子”：站长的设定角色久遠 真（docs/persona-shin.md）。
// 她的圆形头像藏在站长头像后面，只在左下露一点边（月光从右上来，影子落左下）；
// 鼠标移上、Tab 到她时由 CSS 滑出来。触屏没有悬停，点一下站长头像切换 data-open，再点她才跳到人设页。
export default function HeroShadow({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="home-portrait"
      data-open={open || undefined}
      onPointerUp={(event) => {
        if (event.pointerType === "touch" && !(event.target as Element).closest(".home-shadow")) setOpen((value) => !value);
      }}
    >
      <Link href="/shin" className="home-shadow" aria-label={label}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 300px 圆形小图，不需要 Next 图片优化 */}
        <img src="/persona/shin-avatar.webp" alt="" width={300} height={300} />
      </Link>
      {children}
    </div>
  );
}
