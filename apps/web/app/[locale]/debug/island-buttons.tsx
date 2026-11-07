"use client";

import { useIsland } from "@/lib/island-store";

// 在页头夜航岛上播报几条示例活动（只在本页触发，不走 WebSocket）。
const samples = [
  { icon: "info", title: "一条示例活动", detail: "岛会临时变形播报，几秒后缩回" },
  { icon: "post", title: "有新文章了", detail: "《Plate V1 和 V2对比》", href: "/posts", duration: 5000 },
  { icon: "update", title: "文章有更新", detail: "已换成最新内容。" },
  { icon: "remove", title: "这篇文章已移除", detail: "带你回到文章列表。" },
  { icon: "note", title: "有新手记了", detail: "《今天的月亮很圆》", href: "/notes", duration: 5000 },
  { icon: "thinking", title: "写下了一条新思考", detail: "读到一句话，想了很久", href: "/thinking", duration: 5000 },
  { icon: "say", title: "收录了一句新的一言", detail: "月色真美", href: "/says", duration: 5000 },
  { icon: "link", title: "链接已复制", detail: "富文本组件对照：后台编辑器与博客前台" },
  { icon: "comment", title: "评论已发送", detail: "站长开启审核时，通过后才会显示" },
] as const;

export default function IslandButtons() {
  const push = useIsland((state) => state.push);
  return (
    <div className="post-categories">
      {samples.map((sample) => (
        <button key={sample.title} className="notification-close" type="button" onClick={() => push(sample)}>
          {sample.title}
        </button>
      ))}
    </div>
  );
}
