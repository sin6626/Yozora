"use server";

import { updateTag } from "next/cache";

// 访客在浏览器里直接写 Core（发评论、赞/踩）后调用，让列表立即显示自己刚写的内容（Next 的 read-your-own-writes）；
// 收到实时推送“新思考 / 新一言”而读者正在那份列表上时也调用（notifications.tsx）。
// 只放行这几类公开内容的标签；最坏情况是有人反复调用让下次渲染多请求一次 Core，不涉及数据本身。
const allowed = { comments: "blog:comments", recently: "blog:recently", says: "blog:says" } as const;

export async function refreshAfterWrite(kinds: (keyof typeof allowed)[]) {
  for (const kind of new Set(kinds)) {
    if (Object.hasOwn(allowed, kind)) updateTag(allowed[kind]);
  }
}

// 刷新这一篇文章/手记/页面的缓存（标签 blog:<type>:<id>，见 blog-data）：点赞后，以及实时推送说这篇改了、译文更新时
// （ai 为真时连这篇的 AI 摘要与译文 blog:ai:<id> 一起）。加密、未公开的内容 Core 不会推，标签也只是让下次渲染重新向 Core 读。
export async function refreshArticle(type: "post" | "note" | "page", id: string, ai = false) {
  if (!["post", "note", "page"].includes(type) || !/^[a-f\d]{24}$/i.test(id)) return;
  updateTag(`blog:${type}:${id}`);
  if (ai) updateTag(`blog:ai:${id}`);
}
