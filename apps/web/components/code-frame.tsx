import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import { LanguageIcon } from "@haklex/rich-renderer-codeblock/icons";
import { bundledLanguages, codeToHtml } from "shiki";
import CodeCopy from "./code-copy";
import "./post-detail.css";

// 服务端用 Shiki 高亮，结果按代码与语言缓存；浅色/深色两套颜色由 post-detail.css 的 light-dark() 切换。
export async function highlight(code: string, lang: string) {
  "use cache";
  cacheLife("max");
  return codeToHtml(code, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
}

async function HighlightedCode({ code, lang }: { code: string; lang: string }) {
  const html = await highlight(code, lang);
  return <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />;
}

export const canHighlight = (lang?: string): lang is string => !!lang && lang in bundledLanguages;

// 带复制按钮和语言图标的代码框；Markdown 代码块和 Suzuri 富文本（renderCodeBlock）共用。
// 传了 html（事先高亮好的结果）就同步输出，不再挂起；Plate 正文这样用，免得正文因为等高亮先露出 Markdown 兜底。
export default function CodeFrame({ code, lang, html, children }: { code: string; lang?: string; html?: string; children?: ReactNode }) {
  return (
    <div className="code-frame">
      {html !== undefined ? <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />
        : canHighlight(lang) ? <HighlightedCode code={code} lang={lang} /> : <pre>{children ?? <code>{code}</code>}</pre>}
      <CodeCopy code={code} />
      {lang && lang !== "text" && (
        <div className="code-lang" aria-hidden="true">
          <LanguageIcon language={lang} size={14} className="code-lang-icon" />
        </div>
      )}
    </div>
  );
}
