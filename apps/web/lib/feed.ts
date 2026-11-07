import { createElement } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

// RSS 全文：把文章/手记的 Markdown 正文转成 HTML 放进 content:encoded。
// 不开 rehype-raw，正文里的原始 HTML（<script>、<iframe> 等）只会变成文字；javascript: 等危险地址由 defaultUrlTransform 去掉；
// 相对地址按条目自己的链接补成绝对地址（阅读器里没有站点上下文）。
// react-dom/server 要动态引入：静态 import 会被 Next 拦下（“You're importing a component that imports react-dom/server”），Shiro 也是这样做的。

// XML 1.0 不允许的控制字符（保留 \t \n \r），留着会让整份 feed 解析失败
const invalidXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export const escapeXml = (value: string) =>
  value.replace(invalidXml, "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

// CDATA 里不能出现 ]]>：拆成两段 CDATA 拼接
export const cdata = (value: string) => `<![CDATA[${value.replace(invalidXml, "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

export async function markdownToFeedHtml(markdown: string, link: string) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(createElement(Markdown, {
    remarkPlugins: [remarkGfm],
    urlTransform: (url) => {
      const safe = defaultUrlTransform(url);
      try {
        return safe ? new URL(safe, link).href : safe;
      } catch {
        return "";
      }
    },
  }, markdown));
}
