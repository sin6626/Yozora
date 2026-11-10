// 浏览器回归测试：站名读后台“SEO → 网站标题”，站长名字读“个人资料”（2026-11-04 站长定）。页头站名、浏览器标题跟着网站标题走，
// 首页标题像 Shiro 一样是“站名 - 网站描述”；首屏问候、页脚落款跟着个人资料的名字走；页脚还要有源码仓库链接和萌备链接。
// 期望值从 Core 现读，站长以后在后台改名，测试照样成立。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL、API_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const api = process.env.API_URL ?? "http://127.0.0.1:2333";
const aggregate = await (await fetch(`${api}/aggregate`)).json();
const owner = aggregate.user?.name?.trim() || "Sin";
const expected = aggregate.seo?.title?.trim() || "Sin’s Yozora";
const description = aggregate.seo?.description?.trim() || "夜深里也有月亮和星星陪我作伴";
const browser = await openBrowser({ port: 9342 });

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`, 5000);
  const home = await browser.evaluate(`({
    brand: document.querySelector(".site-brand-name")?.textContent.trim(),
    hero: document.querySelector(".home-hero-name")?.textContent.trim(),
    sign: document.querySelector(".site-footer-sign")?.textContent.trim(),
    source: document.querySelector('.site-footer-links a[href="https://github.com/sin6626/Yozora"]')?.target,
    credit: (() => {
      const line = document.querySelector(".site-footer-credit");
      const link = (href) => { const a = line?.querySelector(\`a[href="\${href}"]\`); return a && [a.textContent.trim(), a.target, a.rel.includes("noopener")].join(" "); };
      return line && { text: line.textContent.replace(/\\s+/g, " ").trim(), innei: link("https://github.com/Innei"), mixSpace: link("https://github.com/mx-space"), visible: line.checkVisibility() };
    })(),
    title: document.title,
  })`);
  assert.equal(home.brand, expected, "页头站名");
  assert.equal(home.title, `${expected} - ${description}`, "首页浏览器标题是“站名 - 网站描述”");
  assert.equal(home.hero, owner, "首屏问候里的名字");
  assert.ok(home.sign?.startsWith(`© 2026 ${owner} ·`), `页脚落款：${home.sign}`);
  assert.equal(home.source, "_blank", "页脚要有源码链接（AGPL 要求能拿到改过的 Core 源码），新标签页打开");
  // 2026-11-10 站长要求：页脚写明本站基于 Innei 的 Mix Space 构建，两个名字各链到 GitHub
  assert.deepEqual(home.credit, { text: "基于 Innei 的 Mix Space 构建", innei: "Innei _blank true", mixSpace: "Mix Space _blank true", visible: true }, `页脚 Mix Space 署名：${JSON.stringify(home.credit)}`);

  await browser.goto(`${base}/posts`, 4500);
  const title = await browser.evaluate("document.title");
  assert.ok(title.endsWith(` - ${expected}`), `浏览器标题：${title}`);

  // 萌备（2026-11-01 申请）：审核要求页脚有这个链接，电脑和手机都要看得见
  const icp = () => browser.evaluate(`(() => {
    const link = document.querySelector('.site-footer a[href="https://icp.gov.moe/?keyword=20265334"]');
    if (!link) return null;
    link.scrollIntoView({ block: "center" });
    const r = link.getBoundingClientRect();
    return { text: link.textContent.trim(), target: link.target, visible: link.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && r.width > 0 && r.right <= innerWidth && r.left >= 0 };
  })()`);
  for (const [width, height, label] of [[1920, 991, "电脑"], [375, 812, "手机"]]) {
    await browser.setViewport(width, height);
    await browser.goto(`${base}/`, 4500);
    assert.deepEqual(await icp(), { text: "萌ICP备20265334号", target: "_blank", visible: true }, `${label}页脚有萌备链接`);
  }
  console.log(`site-name: 通过（${expected}）`);
} finally {
  browser.close();
}
