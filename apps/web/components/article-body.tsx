import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { LanguageIcon } from "@haklex/rich-renderer-codeblock/icons";
import { bundledLanguages, codeToHtml } from "shiki";
import { getApiUrl } from "../lib/config";
import CodeCopy from "./code-copy";
import RichContent from "./rich-content";
import "./post-detail.css";

// 服务端用 Shiki 高亮，结果按代码与语言缓存；浅色/深色两套颜色由 post-detail.css 的 light-dark() 切换。
async function highlight(code: string, lang: string) {
  "use cache";
  cacheLife("max");
  return codeToHtml(code, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
}

type HastNode = NonNullable<ExtraProps["node"]>["children"][number];
const textOf = (node: HastNode): string => node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "";

async function HighlightedCode({ code, lang }: { code: string; lang: string }) {
  const html = await highlight(code, lang);
  return <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />;
}

// 代码块：```lang 且 Shiki 支持该语言时高亮，否则保持原样（Shiki 遇到未知语言会报错）。
// 本身保持同步，只有需要高亮时才交给异步的 HighlightedCode（服务端组件）。外面包一层带复制按钮的框，和富文本代码块一样；
// 写了语言的右下角放 Haklex 富文本同一个语言图标（material-icon-theme，认不得的语言是通用代码图标），没写语言的不放。
function CodeBlock({ node, children }: { children?: ReactNode } & ExtraProps) {
  const code = node?.children[0];
  if (code?.type !== "element" || code.tagName !== "code") return <pre>{children}</pre>;
  const text = textOf(code).replace(/\n$/, "");
  const className = code.properties.className;
  const lang = (Array.isArray(className) ? className : []).map(String).find((name) => name.startsWith("language-"))?.slice("language-".length).toLowerCase();
  return (
    <div className="code-frame">
      {lang && lang in bundledLanguages ? <HighlightedCode code={text} lang={lang} /> : <pre>{children}</pre>}
      <CodeCopy code={text} />
      {lang && lang !== "text" && (
        <div className="code-lang" aria-hidden="true">
          <LanguageIcon language={lang} size={14} className="code-lang-icon" />
        </div>
      )}
    </div>
  );
}

// 标题锚点：给 Markdown 标题生成与 GitHub 类似的 slug（保留中文，去标点，空格变 -），同一篇里重名依次加 -1、-2。
// 右栏目录（article-toc.tsx）读取渲染后的标题 id；Lexical 标题的 id 由同版 Haklex 渲染器生成。
export function createSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s+/g, "-") || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

// 每次渲染新建计数器，保证同一篇文章内唯一且不同文章互不影响。
function createComponents(): Components {
  const slug = createSlugger();
  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
    function Heading({ node, children }: { children?: ReactNode } & ExtraProps) {
      return <Tag id={node ? slug(textOf(node)) : undefined}>{children}</Tag>;
    };
  return { pre: CodeBlock, h1: heading("h1"), h2: heading("h2"), h3: heading("h3"), h4: heading("h4"), h5: heading("h5"), h6: heading("h6") };
}

// 文章、手记、页面共用的正文：Lexical 用同版富文本渲染器，Markdown（以及富文本的兜底）用 react-markdown。
export default function ArticleBody({ text, contentFormat, content, emptyText, variant = "article" }: {
  text?: string;
  contentFormat?: string;
  content?: string;
  emptyText: string;
  variant?: "article" | "note";
}) {
  const markdown = typeof text === "string" ? (
    <div className={variant === "note" ? "article-body article-body-note" : "article-body"}>
      <Markdown remarkPlugins={[remarkGfm]} components={createComponents()} skipHtml>{text}</Markdown>
    </div>
  ) : <p role="status">{emptyText}</p>;
  if (contentFormat !== "lexical" || !content) return markdown;
  return <RichContent content={content} apiUrl={getApiUrl()} variant={variant}>{markdown}</RichContent>;
}
