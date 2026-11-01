"use client";

import { useSyncExternalStore } from "react";
import OwnerPresence from "@/components/owner-presence";
import "./brand-ticker.css";

// 调试页“页头站名滚动”：用真实组件和写死的示例数据（不读 Core）。站名停 6 秒后滚到“App 图标 + 音频条”，14 秒后滚回；
// 鼠标移到图标上弹出卡片。时间按打开页面的时刻算（App 用了 23 分钟、歌放到 1:12）。e2e owner-presence.mjs 用这三个示例。
// 当前时间只在浏览器里读：预渲染时读时间会被 Next 当成阻塞（blocking-prerender-current-time-client），卡片也只在浏览器里出现
const openedAt = typeof window === "undefined" ? 0 : Date.now();
const subscribe = () => () => {};
export default function BrandTickerPreview({ avatar }: { avatar: string }) {
  const now = useSyncExternalStore(subscribe, () => openedAt, () => 0);
  const samples = [
    {
      id: "both",
      note: "在用 App（有图标）+ 在听歌",
      preview: { app: { name: "Microsoft Edge", icon: avatar, since: now - 23 * 60_000 }, media: { title: "小孩", artist: "罗燕涛", player: "网易云音乐", duration: 245, elapsed: 72, at: now } },
    },
    { id: "app", note: "只在用 App，没有图标时显示首字，没放歌时是安静的点", preview: { app: { name: "ghostty", since: now - 95 * 60_000 }, media: null } },
    { id: "media", note: "只在听歌", preview: { app: null, media: { title: "下一个天亮", artist: "郭静" } } },
  ];
  return (
    <ul className="debug-brand-tickers">
      {samples.map((sample) => (
        <li key={sample.id} id={`debug-brand-ticker-${sample.id}`}>
          <span className="island-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- 示例头像 */}
            <img className="site-brand-avatar" src={avatar} alt="" width={32} height={32} />
            <OwnerPresence apiUrl="" name="Sin’s Yozora" preview={sample.preview} />
          </span>
          <p className="post-meta">{sample.note}</p>
        </li>
      ))}
    </ul>
  );
}
