// 浏览器回归测试：站名是“站长名字’s Yozora”（2026-10-31 站长定）。Yozora 写在代码里，名字读后台“个人资料”，
// 页头站名、浏览器标题、首屏问候、页脚落款都要跟着后台的名字走，不能有一处还写死旧名字；页脚还要有源码仓库链接。
// 期望值从 Core 现读，站长以后在后台改名，测试照样成立。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL、API_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const api = process.env.API_URL ?? "http://127.0.0.1:2333";
const owner = (await (await fetch(`${api}/aggregate`)).json()).user?.name?.trim() || "Sin";
const expected = `${owner}’s Yozora`;
const browser = await openBrowser({ port: 9342 });

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`, 5000);
  const home = await browser.evaluate(`({
    brand: document.querySelector(".site-brand-name")?.textContent.trim(),
    hero: document.querySelector(".home-hero-name")?.textContent.trim(),
    sign: document.querySelector(".site-footer-sign")?.textContent.trim(),
    source: document.querySelector('.site-footer-links a[href="https://github.com/sin6626/Yozora"]')?.target,
  })`);
  assert.equal(home.brand, expected, "页头站名");
  assert.equal(home.hero, owner, "首屏问候里的名字");
  assert.ok(home.sign?.startsWith(`© 2026 ${owner} ·`), `页脚落款：${home.sign}`);
  assert.equal(home.source, "_blank", "页脚要有源码链接（AGPL 要求能拿到改过的 Core 源码），新标签页打开");

  await browser.goto(`${base}/posts`, 4500);
  const title = await browser.evaluate("document.title");
  assert.ok(title.endsWith(` - ${expected}`), `浏览器标题：${title}`);
  console.log(`site-name: 通过（${expected}）`);
} finally {
  browser.close();
}
