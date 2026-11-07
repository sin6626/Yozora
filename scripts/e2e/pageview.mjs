// 浏览器回归测试：前台每打开一页向 Core 报一次访问（GET /pageview?path=&ref=，2026-11-07）。
// Yozora 在服务器上渲染页面，读者看页面时浏览器不直接请求 Core，后台“数据”里的访问记录就记不到；
// 现在整页打开、站内跳转都报一次，路径是读者看的页面（含语言前缀），来源是上一页或 document.referrer，同一页不重复报。
// 本机访问 Core 会被 Core 当成本机跳过，所以这里只检查浏览器发出的请求，不检查库里的记录（Core 端见 apps/core 的 pageview.e2e-spec.ts）。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";
import { clickNav } from "./helpers.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9355 });
const sent = [];
browser.listeners.push((m) => {
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/pageview")) {
    const url = new URL(m.params.request.url);
    sent.push({ path: url.searchParams.get("path"), ref: url.searchParams.get("ref") });
  }
});
try {
  await browser.send("Network.enable");
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`);
  await sleep(500);
  assert.deepEqual(sent.map((item) => item.path), ["/"], `整页打开首页应报一次：${JSON.stringify(sent)}`);

  assert.equal(await browser.evaluate(clickNav("/timeline")), "/timeline");
  await sleep(500);
  assert.deepEqual(sent.map((item) => item.path), ["/", "/timeline"], `站内跳转也要报：${JSON.stringify(sent)}`);
  assert.equal(sent[1].ref, `${base}/`, "站内跳转的来源是上一页");

  await browser.goto(`${base}/en/posts`);
  await sleep(500);
  assert.equal(sent.at(-1).path, "/en/posts", "外文页面带语言前缀");
  assert.equal(sent.filter((item) => item.path === "/en/posts").length, 1, "同一页不重复报");
  console.log("pageview: 通过");
} finally {
  await browser.close();
}
