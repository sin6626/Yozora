"use client";

import { Hourglass } from "lucide-react";
import { useSyncExternalStore } from "react";
import { outdatedDays } from "../lib/date";
import { useT } from "./locale-provider";

const noSubscribe = () => () => {};

// 文章过期提示：最后修改（没改过看发布）超过 60 天时显示在正文前。
// “现在几点”只在浏览器里读（服务端快照恒为 null）：服务端组件里直接 new Date() 会让预渲染报 current-time，详情页缓存也会把天数冻住。
export default function PostOutdated({ modified, created }: { modified: string | null; created: string }) {
  const t = useT().posts;
  const days = useSyncExternalStore(noSubscribe, () => outdatedDays(modified, created, Date.now()), () => null);
  if (days === null) return null;
  return (
    <p className="post-outdated" role="note">
      <Hourglass size={14} aria-hidden="true" />
      <span>{t.outdated(days)}</span>
    </p>
  );
}
