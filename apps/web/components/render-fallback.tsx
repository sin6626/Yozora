"use client";

import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

// 富文本渲染出错时显示兜底内容（服务端渲染好的 Markdown），不让整页报错。
// 服务端渲染（含 Server Component 抛错）不认错误边界，错误会冒到最近的 Suspense：没有这一层时整篇详情连同页面其他部分都换成外层的读取中；
// 有了它，出错的只是正文这一段，浏览器接手后重新渲染，由 ErrorBoundary 换成 Markdown。
// Suspense 的占位故意是空的：正文里有 Client Component，流式渲染时这一段总会先挂起一下，占位若是 Markdown，
// 每次打开都会先露出 Markdown 再换成 Plate（e2e plate-content.mjs 检查服务端 HTML 里不出现 Markdown 正文）。
export default function RenderFallback({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>
    </Suspense>
  );
}
