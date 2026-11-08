import type { MetadataRoute } from "next";

// 灰度：新前台先放在 beta 子域名上自己用，不让搜索引擎收录（内容和主域名上的旧站重复）。见 docs/deploy-beta.md。
// 部署时设 SITE_NOINDEX=1，构建和运行时都要设：robots.txt 和页面元数据会在构建时预渲染。
export const hiddenFromSearch = () => process.env.SITE_NOINDEX === "1";

// 仅在灰度部署显式指定实测链接时启用；不改与旧站共用的 Core 网站地址。
export function betaShareUrls(): URL[] {
  const list = hiddenFromSearch() && process.env.BETA_SHARE_URLS?.trim();
  if (!list) return [];
  const urls = list.split(/\s+/).map((value) => new URL(value));
  if (urls.some((url) => url.protocol !== "https:" || url.origin !== urls[0].origin || url.username || url.password || url.search || url.hash)) {
    throw new Error("BETA_SHARE_URLS 必须是同一 HTTPS 域名下的页面地址");
  }
  return urls;
}

export function robotsFor(siteUrl: string, hidden = hiddenFromSearch()): MetadataRoute.Robots {
  const previews = hidden ? betaShareUrls() : [];
  if (previews.length) return { rules: [
    { userAgent: ["Twitterbot", "Discordbot"], allow: [...previews.map((url) => url.pathname + "$"), "/api/og?"], disallow: "/" },
    { userAgent: "*", disallow: "/" },
  ] };
  return hidden
    ? { rules: { userAgent: "*", disallow: "/" } }
    : { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/debug"] }, sitemap: `${siteUrl}/sitemap.xml` };
}
