import Markdown, { type Components } from "react-markdown";
import { getLocale, getT } from "../lib/i18n/server";
import { safeUrl } from "../lib/safe-url";
import CopyLinkButton from "./copy-link-button";

// 文章末尾的版权说明（照 Shiro 的 PostCopyright）：标题、作者、完整链接 + 复制、最后修改时间，分隔线下是配置片段 theme/yozora 的 copyright。
// copyright 一行一段，[文字](https://…) 是链接（许可协议），只放行段落、链接和强调，不渲染图片和 HTML。
const components: Components = {
  a: ({ href, children }) => {
    const url = safeUrl(href);
    return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>;
  },
};

export default async function PostCopyright({ title, author, link, modified, license }: {
  title: string;
  author: string;
  link: string;
  modified: string | null;
  license: { text: string; lang?: "zh-CN" };
}) {
  const [t, locale] = await Promise.all([getT().then((all) => all.copyright), getLocale()]);
  const time = modified
    ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(modified))
    : t.neverModified;
  let shown = link;
  // 显示给人看：decodeURI 不解码 & 这类保留字符（分类 study&think 会显示成 study%26think），复制的仍是原链接
  try { shown = decodeURIComponent(link); } catch {}
  return (
    <section id="copyright" className="post-copyright" aria-label={t.label}>
      <p>{t.title}{title}</p>
      <p>{t.author}{author}</p>
      <p>{t.link}<span className="post-copyright-url">{shown}</span> <CopyLinkButton url={link} title={title} /></p>
      <p>{t.modified}{time}</p>
      <hr />
      <div lang={license.lang}>
        {license.text.split("\n").filter((line) => line.trim()).map((line, index) => (
          <Markdown key={index} allowedElements={["p", "a", "strong", "em"]} unwrapDisallowed skipHtml components={components}>{line}</Markdown>
        ))}
      </div>
    </section>
  );
}
