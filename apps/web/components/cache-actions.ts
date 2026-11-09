"use server";

import { updateTag } from "next/cache";

// 实时推送说这篇文章/手记/页面改了、译文更新时调用：正文每次向 Core 现取，不用失效；
// 这篇的 AI 摘要与译文在 Next 缓存里（blog:ai:<id>，见 blog-data），让它失效后刷新页面。
// 加密、未公开的内容 Core 不会推，标签也只是让下次渲染重新向 Core 读。
export async function refreshArticle(type: "post" | "note" | "page", id: string) {
  if (!["post", "note", "page"].includes(type) || !/^[a-f\d]{24}$/i.test(id)) return;
  updateTag(`blog:ai:${id}`);
}
