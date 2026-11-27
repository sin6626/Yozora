"use client";

import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

// 富文本渲染出错时显示兜底内容（服务端渲染好的 Markdown），不让整页报错。
export default function RenderFallback({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>;
}
