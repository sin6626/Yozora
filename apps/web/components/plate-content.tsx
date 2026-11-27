import { validateDocument } from "@suzuri/editor/schema";
import { SuzuriContent } from "@suzuri/editor/static";
import "@suzuri/editor/style.css";
import "katex/dist/katex.min.css";
import type { ReactNode } from "react";
import { getT } from "../lib/i18n/server";
import CodeFrame, { canHighlight, highlight } from "./code-frame";
import ImageLightbox from "./image-lightbox";
import PlateLivePhoto from "./plate-live-photo";
import RenderFallback from "./render-fallback";
import "./plate-content.css";

const size = (value: unknown) => (typeof value === "number" && value > 0 ? value : undefined);

type PlateNode = { type?: string; text?: string; language?: string; children?: PlateNode[] };
const textOf = (node: PlateNode): string => node.text ?? (node.children ?? []).map(textOf).join("");
const codeKey = (code: string, lang?: string) => `${lang ?? ""}\u0000${code}`;

// 正文里所有代码块先一起高亮好（"use cache"），渲染时同步取用：正文里不再有要等待的子组件，
// 外层 RenderFallback 的 Suspense 不会挂起，页面不会先露出 Markdown 兜底再换成 Plate。
async function highlightCodeBlocks(nodes: PlateNode[]) {
  const blocks: { code: string; lang: string }[] = [];
  const walk = (list: PlateNode[]) => list.forEach((node) => {
    const lang = node.language?.toLowerCase();
    if (node.type === "codeBlock" && canHighlight(lang)) blocks.push({ code: textOf(node), lang });
    else if (node.children) walk(node.children);
  });
  walk(nodes);
  const entries = await Promise.all(blocks.map(async ({ code, lang }) => [codeKey(code, lang), await highlight(code, lang)] as const));
  return new Map(entries);
}

// Plate 正文（@suzuri/editor 信封）：服务端渲染。外层仍是 .article-body，标题、段落、列表、引用、表格沿用 Markdown 正文的样子，
// 目录照常读带 id 的标题；代码块走站内 Shiki 与复制按钮，图片点开放大（同一篇可左右切换），实况图用轻量播放器，
// 提示框按 data-variant 用站点颜色。信封不合法或渲染出错时退回 children（服务端渲染好的 Markdown text）。
export default async function PlateContent({ content, variant = "article", children }: { content: string; variant?: "article" | "note"; children: ReactNode }) {
  const checked = validateDocument(content, { requireEnvelope: true, fingerprintPolicy: "restamp" });
  if (!checked.ok) return children;
  const [t, highlighted] = await Promise.all([getT().then((all) => all.lightbox), highlightCodeBlocks(checked.envelope.document.children as PlateNode[])]);
  return (
    <RenderFallback fallback={children}>
      <ImageLightbox itemSelector=".plate-zoom" groupSelector=".article-plate">
        <div className={variant === "note" ? "article-body article-body-note article-plate" : "article-body article-plate"}>
          <SuzuriContent
            document={checked.envelope}
            font={variant === "note" ? "serif" : "sans"}
            renderCodeBlock={({ code, language }) => {
              const lang = language?.toLowerCase();
              return <CodeFrame code={code} lang={lang} html={highlighted.get(codeKey(code, lang))} />;
            }}
            renderImage={({ url, alt, naturalWidth, naturalHeight }) => (
              <button type="button" className="plate-zoom" aria-label={alt || t.view}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={alt ?? ""} width={size(naturalWidth)} height={size(naturalHeight)} loading="lazy" decoding="async" />
              </button>
            )}
            renderLivePhoto={({ url, videoUrl, alt, naturalWidth, naturalHeight }) => (
              <PlateLivePhoto url={url} videoUrl={videoUrl} alt={alt} width={size(naturalWidth)} height={size(naturalHeight)} />
            )}
            renderCallout={({ variant: tone, icon, children: body }) => (
              <div className="plate-callout" data-tone={tone || "note"}>
                <div className="plate-callout-heading">
                  {icon && <span aria-hidden="true">{icon}</span>}
                  <strong className="plate-callout-label">{(tone || "note").toUpperCase()}</strong>
                </div>
                <div className="plate-callout-body">{body}</div>
              </div>
            )}
          />
        </div>
      </ImageLightbox>
    </RenderFallback>
  );
}
