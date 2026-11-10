"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { typeAddress } from "../lib/address-typing";

// 地址栏路径“删旧打新”（lib/address-typing.ts）。用布局 effect：和 Next 写新地址在同一次提交里同步接手，
// 中间不会插进上一段动画的定时器；别的组件在普通 effect 里读 realHref() 时已经是这一页的真实地址。
export default function AddressTyping() {
  const pathname = usePathname();
  useLayoutEffect(() => typeAddress(), [pathname]);
  return null;
}
