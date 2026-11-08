"use client";

// 来自 ShrioRenovation 的 ArticleContent（9b8a48a 同版渲染器、27eeade 白板冷加载样式）。
// Haklex 0.0.85 与 Lexical 0.41.0 和后台同版本，工作区的 rich-static-renderer 补丁自动生效
// （表格 tbody、合并单元格、段落缩进方向、标题唯一 slug）。
import { ExcalidrawConfigProvider } from "@haklex/rich-kit-shiro/excalidraw";
import { LivePhotoNode } from "@yozora/live-photo/haklex";
import "@yozora/live-photo/style.css";
import { ShiroRenderer } from "@haklex/rich-kit-shiro/renderer";
import { EmbedRendererProvider } from "@haklex/rich-kit-shiro/renderers";
import type { ElementFormatType, SerializedEditorState, SerializedLexicalNode } from "lexical";
import { useMemo, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { normalizeEditorState } from "../lib/lexical-normalize";
import { TweetEmbed } from "./tweet";
import { useResolvedTheme } from "./use-resolved-theme";
import "@haklex/rich-kit-shiro/style-renderer.css";
import "@excalidraw/excalidraw/index.css";

// 链接卡片用节点里保存的静态信息渲染，不依赖历史 source 插件识别。
const rendererConfig = { LinkCard: undefined };
const extraNodes = [LivePhotoNode];
const embedRenderers = { tweet: TweetEmbed };

function isNode(value: unknown): value is SerializedLexicalNode {
  return (
    typeof value === "object" && value !== null &&
    "type" in value && typeof value.type === "string" &&
    "version" in value && typeof value.version === "number" &&
    (!("children" in value) || (Array.isArray(value.children) && value.children.every(isNode)))
  );
}

function isFormat(value: unknown): value is ElementFormatType {
  return value === "" || value === "left" || value === "start" || value === "center" || value === "right" || value === "end" || value === "justify";
}

// 校验后台保存的 Lexical JSON，结构不对就返回 null，由外层退回 Markdown。
function parseContent(content: string): SerializedEditorState | null {
  try {
    const value: unknown = JSON.parse(content);
    if (typeof value !== "object" || value === null || !("root" in value)) return null;
    const root = value.root;
    if (
      !isNode(root) || root.type !== "root" ||
      !("children" in root) || !Array.isArray(root.children) ||
      !("format" in root) || !isFormat(root.format) ||
      !("indent" in root) || typeof root.indent !== "number" ||
      !("direction" in root) || (root.direction !== null && root.direction !== "ltr" && root.direction !== "rtl")
    ) return null;
    // 段落里混入块级节点的历史内容在这里整理，避免 <p> 里出现块级元素导致水合错误。
    const state: SerializedEditorState = { root: { ...root, children: root.children, format: root.format, indent: root.indent, direction: root.direction } };
    return normalizeEditorState(state);
  } catch {
    return null;
  }
}

// children 是服务端渲染好的 Markdown（来自 text），JSON 无效或渲染出错时显示它。
// variant：文章用无衬线（article），手记用 Haklex 的衬线手记主题（note），和后台编辑器一致。
export default function RichContent({ content, apiUrl, variant = "article", children }: { content: string; apiUrl: string; variant?: "article" | "note"; children: ReactNode }) {
  const theme = useResolvedTheme();
  const value = useMemo(() => parseContent(content), [content]);
  if (!value) return children;
  return (
    <ErrorBoundary fallback={children} resetKeys={[content]}>
      <div className="article-rich">
        <ExcalidrawConfigProvider apiUrl={apiUrl}>
          <EmbedRendererProvider value={embedRenderers}>
            <ShiroRenderer extraNodes={extraNodes} rendererConfig={rendererConfig} value={value} theme={theme} variant={variant} />
          </EmbedRendererProvider>
        </ExcalidrawConfigProvider>
      </div>
    </ErrorBoundary>
  );
}
