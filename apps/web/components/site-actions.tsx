"use client";

import { Toast } from "@base-ui/react/toast";
import { Bell, Heart } from "lucide-react";
import { useState } from "react";
import { useLocale, useT } from "./locale-provider";
import SubscribePopover from "./subscribe-popover";
import "./site-actions.css";

type Props = { apiUrl: string; likes: number | null; subscribeTypes: ("post_c" | "note_c")[] | null };
type FloatingHeart = { id: number; x: number; rise: number; rotate: number; size: number; delay: number };

const likedKey = "site-liked-on";
const today = () => new Date().toLocaleDateString("sv");

// 一次点击飘出一串大小、方向、快慢都不同的爱心；第二次以后少一些。编号自增，连点时也不会重复。
let heartId = 0;
function makeHearts(count: number): FloatingHeart[] {
  return Array.from({ length: count }, () => ({
    id: ++heartId,
    x: Math.round((Math.random() - 0.5) * 120),
    rise: Math.round(70 + Math.random() * 60),
    rotate: Math.round((Math.random() - 0.5) * 50),
    size: Math.round(12 + Math.random() * 12),
    delay: Math.round(Math.random() * 180),
  }));
}

// 首屏底部的“喜欢本站”和“订阅”（同 Shiro 首页底部的两个按钮）。
// 喜欢：浏览器直接 POST Core 的 /like_this（按访客 IP 每天一次，经 Next 转发会变成所有人共用服务器 IP）。
// 点一下飘出一串爱心，按钮上方弹出一条 Base UI Toast，两秒后自己消失；多点几次会叠起来（同 Base UI 的叠放），
// 但鼠标悬停不展开。第一次是“谢谢你的喜欢！”，今天已经点过（本机记过，或 Core 回“一天一次就够啦”）就只提示，不再请求。
// 这套 Toast 和全站通知分开（自己的 Provider），只显示在按钮上方。
// 订阅：点按钮才浮出订阅表单；后台没开订阅时不显示这个按钮。
export default function SiteActions(props: Props) {
  return (
    <Toast.Provider timeout={2000} limit={3}>
      <Actions {...props} />
    </Toast.Provider>
  );
}

function LikeToasts() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast} className="like-toast" swipeDirection={[]}>
      <Toast.Content className="like-toast-content">
        <Toast.Title className="like-toast-title" />
      </Toast.Content>
    </Toast.Root>
  ));
}

function Actions({ apiUrl, likes, subscribeTypes }: Props) {
  const t = useT().siteActions;
  const locale = useLocale();
  const [count, setCount] = useState(likes);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [pending, setPending] = useState(false);
  const toast = Toast.useToastManager();

  function celebrate(text: string, heartCount: number) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && heartCount) {
      const burst = makeHearts(heartCount);
      setHearts((current) => [...current, ...burst]);
      setTimeout(() => setHearts((current) => current.filter((heart) => !burst.includes(heart))), 1600);
    }
    toast.add({ title: text });
  }

  async function like() {
    if (pending) return;
    let likedToday = false;
    try {
      likedToday = localStorage.getItem(likedKey) === today();
    } catch {}
    if (likedToday) return celebrate(t.oncePerDay, 4);
    setPending(true);
    try {
      const response = await fetch(`${apiUrl}/like_this`, { method: "POST" });
      try {
        localStorage.setItem(likedKey, today());
      } catch {}
      if (response.ok) {
        setCount((value) => (value ?? 0) + 1);
        celebrate(t.thanks, 10);
      } else {
        // Core 拒绝（今天点过）时返回中文说明，只有中文页面直接用它
        const body = await response.json().catch(() => null) as { message?: string } | null;
        celebrate((locale === "zh" && body?.message) || t.oncePerDay, 4);
      }
    } catch {
      celebrate(t.network, 0);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="site-actions">
      <div className="site-like">
        <button className="site-action is-like" type="button" onClick={like}>
          {t.like}
          <Heart size={16} aria-hidden="true" />
          {count !== null && <span className="site-action-count">{count}</span>}
        </button>
        <div className="site-like-hearts" aria-hidden="true">
          {hearts.map((heart) => (
            <span
              key={heart.id}
              style={{
                "--heart-x": `${heart.x}px`,
                "--heart-rise": `${heart.rise}px`,
                "--heart-rotate": `${heart.rotate}deg`,
                "--heart-delay": `${heart.delay}ms`,
                fontSize: `${heart.size}px`,
              } as React.CSSProperties}
            >
              <Heart size="1em" />
            </span>
          ))}
        </div>
        <Toast.Viewport className="like-toast-viewport" aria-label={t.toastLabel}>
          <LikeToasts />
        </Toast.Viewport>
      </div>
      {subscribeTypes && (
        <SubscribePopover apiUrl={apiUrl} types={subscribeTypes} triggerClassName="site-action is-subscribe">
          {t.subscribe}
          <Bell size={16} aria-hidden="true" />
        </SubscribePopover>
      )}
    </div>
  );
}
