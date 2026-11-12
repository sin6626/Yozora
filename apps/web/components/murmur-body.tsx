import Markdown, { type Components } from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";
import { murmurImageWidth } from "../lib/murmur";
import { safeUrl } from "../lib/safe-url";
import { getT } from "../lib/i18n/server";
import type { Messages } from "../lib/i18n/messages/zh";

// 碎碎念正文：Markdown 只放行段落级元素（不渲染标题），图片按后台拖好的宽度显示（占气泡宽度的百分比）。
// 正文里写的 HTML（常是在聊 <head>、<b> 这些标签）原样显示成文字：不开 skipHtml，react-markdown 会把它转成纯文本，不会变成元素。
const componentsFor = (t: Messages["murmurs"]): Components => ({
  img: ({ src, alt, title }) => {
    const href = safeUrl(typeof src === "string" ? src : undefined);
    if (!href) return null;
    // 包成按钮：点击（或键盘回车）由外层 ImageLightbox 放大查看
    return (
      <button type="button" className="murmur-zoom" aria-label={alt ? t.zoomOf(alt) : t.zoom} style={{ width: `${murmurImageWidth(title)}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 图床上的图片，尺寸由站长在后台拖定，不走 next/image */}
        <img className="murmur-image" src={href} alt={alt ?? ""} loading="lazy" />
      </button>
    );
  },
  a: ({ href, children }) => {
    const url = safeUrl(href);
    return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>;
  },
});

export default async function MurmurBody({ content }: { content: string }) {
  const components = componentsFor((await getT()).murmurs);
  return (
    // 站长自己的话，不翻译，外文页面上标明是中文
    <div className="murmur-body" lang="zh-CN">
      <Markdown remarkPlugins={[remarkGfm, remarkCjkFriendly]} components={components} allowedElements={["p", "a", "img", "strong", "em", "del", "code", "pre", "ul", "ol", "li", "blockquote", "br"]} unwrapDisallowed>
        {content}
      </Markdown>
    </div>
  );
}
