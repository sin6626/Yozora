import { getFeedItems, getSiteSettings } from "@/lib/blog-data";
import { cdata, escapeXml as escape, markdownToFeedHtml } from "@/lib/feed";

// RSS 2.0：最新 10 条文章与手记，带描述（摘要）和 content:encoded 全文 HTML。只有中文版。
export async function GET() {
  const [{ siteUrl: site, name: siteName, description: siteDescription }, items] = await Promise.all([getSiteSettings(), getFeedItems()]);
  const link = (...segments: string[]) => `${site}/${segments.map(encodeURIComponent).join("/")}`;
  const bodies = await Promise.all(items.map((item) => markdownToFeedHtml(item.text, link(...item.path))));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>${escape(siteName)}</title>
<link>${escape(site)}</link>
<description>${escape(siteDescription)}</description>
<language>zh-CN</language>
<atom:link href="${escape(link("feed.xml"))}" rel="self" type="application/rss+xml"/>
${items.length ? `<lastBuildDate>${new Date(items[0].created).toUTCString()}</lastBuildDate>\n` : ""}${items.map((item, index) => {
    const url = link(...item.path);
    return `<item>
<title>${escape(item.title)}</title>
<link>${escape(url)}</link>
<guid isPermaLink="true">${escape(url)}</guid>
<pubDate>${new Date(item.created).toUTCString()}</pubDate>
<category>${escape(item.category)}</category>
${item.description ? `<description>${escape(item.description)}</description>\n` : ""}<content:encoded>${cdata(bodies[index])}</content:encoded>
</item>`;
  }).join("\n")}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
