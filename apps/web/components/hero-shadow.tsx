"use client";

import { useState, type ReactNode } from "react";
import Link from "./locale-provider";

// 首屏头像后面的“影子”：配置片段 theme/yozora 的 hero.shadow（图片 + 后台页面 slug），没配就只有站长头像。
// 她的圆形头像藏在站长头像后面，只在左下露一点边（月光从右上来，影子落左下）；
// 鼠标移上、Tab 到她时由 CSS 滑出来。触屏没有悬停，点一下站长头像切换 data-open，再点她才跳到那个页面。
export type Shadow = { image: string; href: string; label: string };

export default function HeroShadow({ shadow, children }: { shadow?: Shadow; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="home-portrait"
      data-open={open || undefined}
      onPointerUp={(event) => {
        if (event.pointerType === "touch" && !(event.target as Element).closest(".home-shadow")) setOpen((value) => !value);
      }}
    >
      {shadow && (
        <Link href={shadow.href} className="home-shadow" aria-label={shadow.label}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 图片来自后台任意地址，不走 Next 图片优化 */}
          <img src={shadow.image} alt="" width={300} height={300} />
        </Link>
      )}
      {children}
    </div>
  );
}
