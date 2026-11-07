"use client";

import { CloudMoon } from "lucide-react";
import LocaleLink, { useT } from "@/components/locale-provider";

// 页面渲染出错时的站内错误页：在根布局 [locale]/layout.tsx 之内，页头导航和页脚都还在，样式和 not-found.tsx 一样用 .empty-state。
// Next 16 的错误组件收 { error, retry, reset }：retry 重新向服务端取一次再渲染（服务端组件出错时要它），reset 只清掉出错状态。
// 不加 role="alert"：globals.css 把它整块染成报错红，这里是一整页，标题已经说明了。
// 生产环境服务端组件的报错只带 digest（不带原文），把它显示出来方便对服务端日志。
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT().error;
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <section className="empty-state error-page" aria-labelledby="error-heading">
      <CloudMoon className="empty-state-code" size={72} strokeWidth={1.25} aria-hidden="true" />
      <h1 id="error-heading">{t.heading}</h1>
      <p>{t.body}</p>
      <div className="empty-state-actions">
        <button type="button" className="btn btn-primary" onClick={retry}>{t.retry}</button>
        <LocaleLink className="btn" href="/">{t.home}</LocaleLink>
      </div>
      {digest && <p className="error-page-digest">{t.digest(digest)}</p>}
    </section>
  );
}
