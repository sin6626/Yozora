// 浏览器回归测试：配置片段 theme/yozora 的 custom（统计脚本、补充样式，lib/theme-config.ts 的 parseCustomCode）插进每个页面的 <head>。
// ① css、js、styles、scripts 四种都生效；css 排在站点样式后面；脚本的 data-* 属性带上（Shiro 的 dataWebsiteId 写法），
//    onload 这类事件属性和 javascript: 地址被丢掉；
// ② 统计脚本像 Umami 一样包住 history、或像 Cloudflare 一样听 navigate 事件按地址变化记访问：站内跳转时地址栏动画（lib/address-typing.ts）的中间帧 /p /po… 不能被它记成页面，
//    同时动画本身照播（用包在 History.prototype 上的记录器确认中间帧确实写过）。
// 测试时把 custom 临时写进本地库的片段（Core 发 SNIPPET_UPDATE，Webhook 让前台缓存失效），跑完写回原样；
// 外部地址 https://stats.e2e.test/ 在浏览器里拦下、返回假的统计脚本和样式表，不连外网。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：node scripts/e2e/custom-code.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openBrowser, sleep } from "../headless-browser.mjs";
import { coreUrl } from "../lib/core-url.mjs";
import { clickNav } from "./helpers.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const local = JSON.parse(readFileSync(".local/publish.json", "utf8")).local;
const request = async (path, init = {}) => {
  const response = await fetch(coreUrl(local.api, path), { ...init, headers: { "x-api-key": local.token, "content-type": "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}：HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const snippet = ((await request("/snippets/group/theme")).data ?? []).find((item) => item.name === "yozora");
assert.ok(snippet, "本地库要有配置片段 theme/yozora");
const original = snippet.raw;
const save = (raw, baseRaw) => request(`/snippets/${snippet.id}`, {
  method: "PUT",
  body: JSON.stringify({ type: snippet.type, reference: snippet.reference, name: snippet.name, private: snippet.private, comment: snippet.comment, raw, baseRaw }),
});

const custom = {
  css: [":root { --e2e-custom-css: 1 }", "  "],
  js: ["window.__customJs = (window.__customJs || 0) + 1"],
  styles: ["https://stats.e2e.test/extra.css", "javascript:alert(1)"],
  scripts: [
    { src: "https://stats.e2e.test/tracker.js", defer: true, dataWebsiteId: "e2e-site", "data-domains": "127.0.0.1", onload: "window.__bad = 1" },
    { src: "javascript:alert(1)" },
  ],
};
// 统计脚本发现站内跳转的两种办法都模拟上：像 Umami 包住 pushState / replaceState（views），
// 像 Cloudflare Web Analytics 监听 Navigation API 的 navigate 事件（navigates），地址变了就记一次访问
const tracker = `(() => {
  const me = document.currentScript;
  const t = window.__tracker = { site: me && me.dataset.websiteId, current: location.pathname, views: [location.pathname], navigates: [location.pathname] };
  navigation.addEventListener("navigate", (e) => {
    const path = decodeURIComponent(new URL(e.destination.url).pathname);
    if (e.destination.url !== location.href) t.navigates.push(path);
  });
  for (const kind of ["pushState", "replaceState"]) {
    const original = history[kind];
    history[kind] = function (state, unused, url) {
      if (url != null) {
        const path = decodeURIComponent(new URL(url, location.href).pathname);
        if (path !== t.current) { t.current = path; t.views.push(path); }
      }
      return original.apply(this, arguments);
    };
  }
})();`;
// 记下每一次真正写进历史的地址（包在原型上，原生调用也看得到）：确认动画照播
const recorder = `{
  window.__frames = [];
  const native = History.prototype.replaceState;
  History.prototype.replaceState = function (state, unused, url) {
    if (url != null) window.__frames.push(decodeURIComponent(new URL(url, location.href).pathname));
    return native.apply(this, arguments);
  };
}`;

const browser = await openBrowser({ port: 9491 });
try {
  await save(JSON.stringify({ ...JSON.parse(original), custom }, null, 2), original);
  await browser.setViewport(1920, 991);
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: recorder });
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: "https://stats.e2e.test/*" }] });
  browser.listeners.push((m) => {
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request: req } = m.params;
    const css = req.url.endsWith(".css");
    browser.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: "content-type", value: css ? "text/css" : "text/javascript" }],
      body: Buffer.from(css ? ":root { --e2e-custom-style: 2 }" : tracker).toString("base64"),
    });
  });

  // Webhook 让前台的片段缓存失效，最多等十几秒
  let injected = false;
  for (let i = 0; i < 8 && !injected; i++) {
    await browser.goto(`${base}/`);
    injected = await browser.evaluate(`!!document.getElementById("yozora-custom-css")`);
    if (!injected) await sleep(1500);
  }
  assert.ok(injected, "改了片段后页面里应有 custom 的样式");

  // ① 四种都生效
  const head = await browser.evaluate(`(() => {
    const root = getComputedStyle(document.documentElement);
    const sheets = [...document.head.querySelectorAll('link[rel="stylesheet"], style')];
    const script = document.querySelector('script[src="https://stats.e2e.test/tracker.js"]');
    return {
      css: root.getPropertyValue("--e2e-custom-css").trim(),
      style: root.getPropertyValue("--e2e-custom-style").trim(),
      js: window.__customJs,
      site: window.__tracker && window.__tracker.site,
      attrs: script && Object.fromEntries([...script.attributes].map((a) => [a.name, a.value])),
      javascript: document.querySelectorAll('[src^="javascript:"], [href^="javascript:"]').length,
      cssAfterSite: sheets.indexOf(document.getElementById("yozora-custom-css")) > Math.max(...sheets.map((s, i) => (s.href || "").includes("/_next/") ? i : -1)),
      siteSheets: sheets.filter((s) => (s.href || "").includes("/_next/")).length,
    };
  })()`);
  assert.equal(head.css, "1", "内联 css 生效");
  assert.equal(head.style, "2", "外部样式表生效");
  assert.equal(head.js, 1, "内联 js 执行一次");
  assert.equal(head.site, "e2e-site", "统计脚本读得到 data-website-id");
  assert.ok(head.attrs, "统计脚本在 <head> 里");
  assert.equal(head.attrs["data-domains"], "127.0.0.1", "data-* 原样带上");
  assert.ok("defer" in head.attrs, "defer 带上");
  assert.ok(!("onload" in head.attrs), `事件属性要丢掉：${JSON.stringify(head.attrs)}`);
  assert.equal(head.javascript, 0, "javascript: 地址要丢掉");
  assert.ok(head.siteSheets > 0 && head.cssAfterSite, "custom 的样式排在站点样式后面");

  // ② 站内跳转：动画照播，统计只记真实页面
  await browser.evaluate("window.__frames.splice(0)");
  assert.equal(await browser.evaluate(clickNav("/posts")), "/posts");
  const frames = await browser.evaluate("window.__frames");
  assert.ok(["/p", "/po", "/pos", "/post"].every((frame) => frames.includes(frame)), `地址栏动画应照播：${JSON.stringify(frames)}`);
  const { views, navigates } = await browser.evaluate("window.__tracker");
  assert.deepEqual(views, ["/", "/posts"], `包住 history 的统计只应记到真实页面，不能有中间帧：${JSON.stringify(views)}`);
  assert.deepEqual(navigates, ["/", "/posts"], `听 navigate 事件的统计只应记到真实页面，不能有中间帧：${JSON.stringify(navigates)}`);

  assert.deepEqual(browser.errors, [], "不应有页面报错");
  console.log("PASS 配置片段 custom：css/js/styles/scripts 生效、属性过滤、样式排在站点样式后；统计脚本不记地址栏动画的中间帧");
} finally {
  await browser.close();
  // 写回原样（以库里现在的为底，免得盖掉测试期间别处的改动时报 409）
  const now = ((await request("/snippets/group/theme")).data ?? []).find((item) => item.name === "yozora");
  if (now && now.raw !== original) await save(original, now.raw);
}
