import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

// 评论正文（文末评论列表与“边读边聊”消息流共用，服务端渲染）：常见的 GFM 都显示——标题、列表、引用、代码、表格、删除线、图片。
// 原始 HTML 不渲染成元素：不开 skipHtml，react-markdown 把它当纯文字显示（读者常在聊 <div> 这类标签，整段吞掉反而读不懂）。
// 图片只放行 http(s)，懒加载、不带来源页地址，包成按钮交给外层 ImageLightbox 放大；链接只放行 http(s) 与 mailto，一律新标签页、nofollow ugc。
export const commentElements = [
  "p", "br", "hr", "a", "strong", "em", "del", "code", "pre", "blockquote", "ul", "ol", "li", "img",
  "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td",
];

const isHttp = (url: string) => /^https?:\/\//i.test(url);
export function commentUrl(url: string, key: string) {
  if (key === "src") return isHttp(url) ? url : "";
  return isHttp(url) || /^mailto:/i.test(url) ? url : "";
}

// 评论在“评论”(h2) 之下，读者写的标题整体降两级（h1 → h3），不打乱页面的标题层级，也不会被文章目录收进去（目录只收带 id 的）
const Heading = (level: number) =>
  function CommentHeading({ children }: { children?: ReactNode }) {
    const Tag = `h${Math.min(6, level + 2)}` as "h3";
    return <Tag className="comment-heading">{children}</Tag>;
  };

const componentsFor = (zoom: (alt: string) => string): Components => ({
  img: ({ src, alt }) => {
    if (typeof src !== "string" || !src) return null;
    return (
      <button type="button" className="comment-zoom" aria-label={zoom(alt ?? "")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 评论里的外链图片，地址不固定，不走 next/image */}
        <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </button>
    );
  },
  a: ({ href, children }) => (href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{children}</a> : <>{children}</>),
  table: ({ children }) => <div className="comment-table"><table>{children}</table></div>,
  h1: Heading(1), h2: Heading(2), h3: Heading(3), h4: Heading(4), h5: Heading(4), h6: Heading(4),
});

// zoom：放大按钮的读屏文字（有替代文字时带上它）
export default function CommentMarkdown({ text, zoom }: { text: string; zoom: (alt: string) => string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} allowedElements={commentElements} unwrapDisallowed urlTransform={commentUrl} components={componentsFor(zoom)}>
      {text}
    </Markdown>
  );
}
