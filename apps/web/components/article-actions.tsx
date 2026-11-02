"use client";

import { ArrowUp, Bell, Heart, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useIsland } from "../lib/island-store";
import { useArticleLike } from "../lib/use-article-like";
import { useT } from "./locale-provider";
import SubscribePopover from "./subscribe-popover";
import "./article-actions.css";

type Like = { apiUrl: string; id: string; type: "post" | "note"; count: number };

// 文章目录下面的一排操作（参考 Shiro 的 PostActionAside，做了改动）：喜欢、评论（边读边聊的悬浮窗）、分享、订阅，再加一个 Shiro 没有的“回到顶部”。
// 回到顶部的按钮外面套着阅读进度环（读的是页头夜航岛同一份进度），读得越多画得越满；还在页面顶部时淡出隐藏。
// comments：评论悬浮窗（comment-chat.tsx，服务端组件，作为节点传进来）
export default function ArticleActions({ title, like, comments, subscribe }: {
  title: string;
  like: Like | null;
  comments: ReactNode;
  subscribe: { apiUrl: string; types: ("post_c" | "note_c")[] } | null;
}) {
  const t = useT().articleActions;
  const progress = useIsland((state) => state.reading?.progress ?? 0);

  return (
    <div className="article-actions" role="group" aria-label={t.group}>
      {like && <LikeButton like={like} />}
      {comments}
      <ShareButton title={title} />
      {subscribe && (
        <SubscribePopover {...subscribe} side="left" triggerClassName="article-action" triggerLabel={t.subscribe}>
          <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        </SubscribePopover>
      )}
      <BackToTop progress={progress} />
    </div>
  );
}

function LikeButton({ like }: { like: Like }) {
  const t = useT().articleActions;
  const { liked, likes, thumbsUp } = useArticleLike({ apiUrl: like.apiUrl, id: like.id, type: like.type, like: like.count });
  return (
    <button
      type="button"
      className="article-action is-like"
      onClick={thumbsUp}
      aria-pressed={liked}
      aria-label={liked ? t.liked(likes) : t.like(likes)}
      title={liked ? t.thanks : t.likeTitle}
    >
      <Heart size={18} strokeWidth={1.75} aria-hidden="true" />
      {likes > 0 && <span className="article-action-count">{likes}</span>}
    </button>
  );
}

// 和 Shiro 一样用 Web Share API 调起系统分享面板（macOS 上有隔空投送、信息、备忘录、拷贝等，选项由系统提供）；
// 浏览器不支持（如 Firefox 桌面版）或调用失败时退回复制链接，并在页头夜航岛上播报。用户取消分享（AbortError）什么都不做。
function ShareButton({ title }: { title: string }) {
  const t = useT().articleActions;
  const push = useIsland((state) => state.push);
  async function share() {
    const url = window.location.href.split("#")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      push({ icon: "link", title: t.copied, detail: title, duration: 2600 });
    } catch {
      push({ icon: "info", title: t.copyFailed, detail: t.copyFailedDetail, duration: 3200 });
    }
  }
  return (
    <button type="button" className="article-action" onClick={share} aria-label={t.share} title={t.shareTitle}>
      <Share2 size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

function BackToTop({ progress }: { progress: number }) {
  const t = useT().articleActions;
  const radius = 17;
  const length = 2 * Math.PI * radius;
  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <button
      type="button"
      className="article-action is-top"
      data-visible={progress > 0.03 ? "" : undefined}
      onClick={toTop}
      aria-label={t.top(Math.round(progress * 100))}
      title={t.topTitle}
    >
      <svg className="article-action-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} className="article-action-ring-track" />
        <circle cx="20" cy="20" r={radius} className="article-action-ring-bar" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />
      </svg>
      <ArrowUp size={16} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
