import { validateDocument } from "@suzuri/editor/schema";
import { SuzuriContent } from "@suzuri/editor/static";
import "@suzuri/editor/style.css";
import "katex/dist/katex.min.css";
import type { ReactNode } from "react";
import { getT } from "../lib/i18n/server";
import CodeFrame from "./code-frame";
import ImageLightbox from "./image-lightbox";
import PlateLivePhoto from "./plate-live-photo";
import RenderFallback from "./render-fallback";
import "./plate-content.css";

const size = (value: unknown) => (typeof value === "number" && value > 0 ? value : undefined);

// Plate 正文（@suzuri/editor 信封）：服务端渲染。外层仍是 .article-body，标题、段落、列表、引用、表格沿用 Markdown 正文的样子，
// 目录照常读带 id 的标题；代码块走站内 Shiki 与复制按钮，图片点开放大（同一篇可左右切换），实况图用轻量播放器，
// 提示框按 data-variant 用站点颜色。信封不合法或渲染出错时退回 children（服务端渲染好的 Markdown text）。
export default async function PlateContent({ content, variant = "article", children }: { content: string; variant?: "article" | "note"; children: ReactNode }) {
  const checked = validateDocument(content, { requireEnvelope: true, fingerprintPolicy: "restamp" });
  if (!checked.ok) return children;
  const t = (await getT()).lightbox;
  return (
    <RenderFallback fallback={children}>
      <ImageLightbox itemSelector=".plate-zoom" groupSelector=".article-plate">
        <div className={variant === "note" ? "article-body article-body-note article-plate" : "article-body article-plate"}>
          <SuzuriContent
            document={checked.envelope}
            font={variant === "note" ? "serif" : "sans"}
            renderCodeBlock={({ code, language }) => <CodeFrame code={code} lang={language?.toLowerCase()} />}
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
              <div className="plate-callout" data-tone={tone}>
                {icon && <span className="plate-callout-icon" aria-hidden="true">{icon}</span>}
                <div className="plate-callout-body">{body}</div>
              </div>
            )}
          />
        </div>
      </ImageLightbox>
    </RenderFallback>
  );
}
