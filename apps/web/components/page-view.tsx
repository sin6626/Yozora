"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { realHref } from "../lib/address-typing";

// 每打开一页（整页打开和站内跳转）向 Core 报一次访问：GET /pageview?path=<页面路径>&ref=<来源>。
// 页面在服务器上渲染，读者的浏览器不直接请求 Core，不报的话后台“数据”里的访问记录就记不到读者看了哪页。
// 带上 Cookie：Core 和以前一样不记已登录的站长；本机、爬虫也由 Core 跳过，所以本地开发时报了也不会记。
// 来源：第一页是 document.referrer，之后是上一页的地址。同一页不重复报（开发模式的严格模式会把 effect 跑两遍）。
export default function PageView({ apiUrl }: { apiUrl: string }) {
  const pathname = usePathname();
  const last = useRef<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (last.current?.path === pathname) return;
    const ref = last.current?.url ?? document.referrer;
    last.current = { path: pathname, url: realHref() };
    const query = new URLSearchParams({ path: pathname, ...(ref && { ref }) });
    void fetch(`${apiUrl}/pageview?${query}`, { credentials: "include", keepalive: true }).catch(() => {});
  }, [apiUrl, pathname]);
  return null;
}
