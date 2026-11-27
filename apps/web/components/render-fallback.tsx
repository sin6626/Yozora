"use client";

import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

// 富文本渲染出错时显示兜底内容（服务端渲染好的 Markdown），不让整页报错。
// 服务端渲染（含 Server Component 抛错）不认错误边界，错误会冒到最近的 Suspense：没有这一层时整篇详情连同页面其他部分都换成外层的读取中，
// 有了它只有正文换成 Markdown；浏览器接手后再渲染一次，出错由 ErrorBoundary 换成同一份 Markdown。代价是正文还在流式送达时也先显示这份 Markdown。
export default function RenderFallback({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>
    </Suspense>
  );
}
