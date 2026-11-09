"use client";

import { useState, useSyncExternalStore } from "react";
import OwnerPresence from "@/components/owner-presence";
import "./brand-ticker.css";

// 调试页“页头站名滚动”：用真实组件和写死的示例数据（不读 Core）。站名停 6 秒后滚到“App 图标 + 音频条”，14 秒后滚回；
// 鼠标移到图标上弹出卡片。播放进度按打开页面的时刻算（歌放到 1:12）。e2e owner-presence.mjs 用这三个示例。
// 当前时间只在浏览器里读：预渲染时读时间会被 Next 当成阻塞（blocking-prerender-current-time-client），卡片也只在浏览器里出现
const openedAt = typeof window === "undefined" ? 0 : Date.now();
const subscribe = () => () => {};
export default function BrandTickerPreview({ avatar }: { avatar: string }) {
  const now = useSyncExternalStore(subscribe, () => openedAt, () => 0);
  // “换个应用”：轮流换三个 App，看图标向下滚的切换动画（e2e presence-switch.mjs）
  const switchApps = [{ name: "Google Chrome" }, { name: "Visual Studio Code" }, { name: "ghostty-nightly" }];
  const [appIndex, setAppIndex] = useState(0);
  const samples = [
    {
      id: "both",
      note: "在用认得的 App（清晰的矢量图标）+ 在听歌",
      preview: { app: { name: "Google Chrome", icon: avatar }, media: { title: "晚安", artist: "颜人中", player: "NetEaseMusic", duration: 289, elapsed: 72, at: now } },
    },
    { id: "app", note: "只在用认不得的 App（Companion 的小图标），没放歌时是安静的点", preview: { app: { name: "UU远程", icon: avatar }, media: null } },
    { id: "letter", note: "认不得又没有图标时显示首字", preview: { app: { name: "ghostty-nightly" }, media: null } },
    { id: "media", note: "只在听歌", preview: { app: null, media: { title: "下一个天亮", artist: "郭静" } } },
    { id: "switch", note: "换 App 时图标向下滚", preview: { app: switchApps[appIndex % switchApps.length], media: null } },
  ];
  return (
    <ul className="debug-brand-tickers">
      {samples.map((sample) => (
        <li key={sample.id} id={`debug-brand-ticker-${sample.id}`}>
          <span className="island-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- 示例头像 */}
            <img className="site-brand-avatar" src={avatar} alt="" width={32} height={32} />
            <OwnerPresence apiUrl="" name="Sin’s Yozora" owner="Sin" preview={sample.preview} />
          </span>
          <p className="post-meta">{sample.note}</p>
          {sample.id === "switch" && (
            <button type="button" className="btn btn-sm debug-switch-app" onClick={() => setAppIndex((index) => index + 1)}>换个应用</button>
          )}
        </li>
      ))}
    </ul>
  );
}
