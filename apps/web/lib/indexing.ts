import type { MetadataRoute } from "next";

// 灰度：新前台先放在 beta 子域名上自己用，不让搜索引擎收录（内容和主域名上的旧站重复）。见 docs/deploy-beta.md。
// 部署时设 SITE_NOINDEX=1，构建和运行时都要设：robots.txt 和页面元数据会在构建时预渲染。
export const hiddenFromSearch = () => process.env.SITE_NOINDEX === "1";

export function robotsFor(siteUrl: string, hidden = hiddenFromSearch()): MetadataRoute.Robots {
  return hidden
    ? { rules: { userAgent: "*", disallow: "/" } }
    : { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/debug"] }, sitemap: `${siteUrl}/sitemap.xml` };
}
