// 浏览器回归测试：页头头像右边的站名区滚动（components/owner-presence.tsx）。
// 一、调试页的三个写死示例：站名停 6 秒后向上滚成“App 图标 + 音频条”，4 秒后滚回；宽度不变（导航不挪）；没图标时是首字方块；
//     只在听歌时只有音频条；不写歌名，歌名只在提示框里；鼠标停在上面时暂停；减少动态效果时音频条不跳。
// 二、真实页头：浏览器里拦截 GET /fn/ps/update 换成测试数据，并让 Core 的 WebSocket 连不上（站长自己的 Companion 正在实时上报，
//     不能让它的广播干扰测试，也不往 Core 写东西）：有数据时滚动且导航不挪、读屏描述、阅读胶囊里头像光圈呼吸；没数据时只有站名。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9372 });
const waitFor = async (expression, message, timeout = 9000) => {
  for (let waited = 0; waited < timeout; waited += 200) {
    if (await browser.evaluate(expression)) return;
    await sleep(200);
  }
  assert.fail(message);
};
const tickers = (scope) => browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)} + " .brand-ticker")].map((el) => {
  const live = el.querySelector(".brand-ticker-live");
  const monogram = el.querySelector(".brand-ticker-monogram");
  return {
    slot: el.dataset.slot,
    width: Math.round(el.getBoundingClientRect().width),
    text: el.textContent,
    liveText: live.innerText.trim(),
    title: live.title,
    icon: Boolean(el.querySelector("img.brand-ticker-icon")),
    letter: monogram ? getComputedStyle(monogram, "::before").content : null,
    bars: el.querySelectorAll(".brand-ticker-bars i").length,
    barAnimation: el.querySelector(".brand-ticker-bars i") ? getComputedStyle(el.querySelector(".brand-ticker-bars i")).animationName : null,
  };
})`);

let fake = { processInfo: { name: "E2E 测试 App" }, mediaInfo: { title: "测试歌", artist: "测试歌手" } };
try {
  await browser.setViewport(1280, 800);

  // 一、调试页示例
  await browser.goto(`${base}/debug`);
  await browser.evaluate(`document.querySelector("#debug-brand-ticker").scrollIntoView({ block: "center" })`);
  const scope = "#debug-brand-ticker";
  const before = await tickers(scope);
  assert.deepEqual(before.map((t) => t.slot), ["name", "name", "name"], "一开始显示站名");
  assert.ok(before.every((t) => t.text === "Sin’s Yozora"), "站名元素的文字只有站名（首字写在 CSS 里）");
  await waitFor(`[...document.querySelectorAll("${scope} .brand-ticker")].every((el) => el.dataset.slot === "live")`, "约 6 秒后滚到 App 图标 + 音频条");
  await sleep(700);
  const [both, appOnly, mediaOnly] = await tickers(scope);
  assert.deepEqual([both.width, appOnly.width, mediaOnly.width], before.map((t) => t.width), "滚动前后宽度不变（导航不会挪）");
  assert.ok(both.icon && both.bars === 4, "在用 App 有图标时显示图标，在听歌时显示四根音频条");
  assert.equal(both.liveText, "", "不写 App 名和歌名");
  assert.equal(both.title, "在用 Microsoft Edge · 在听 小孩 – 罗燕涛", "App 名和歌名只在提示框里");
  assert.ok(!appOnly.icon && appOnly.letter === '"G"' && appOnly.bars === 0, "没有图标时是首字方块，没在听歌时没有音频条");
  assert.ok(!mediaOnly.icon && mediaOnly.letter === null && mediaOnly.bars === 4, "只在听歌时只有音频条");
  assert.notEqual(both.barAnimation, "none", "音频条在跳");
  await waitFor(`[...document.querySelectorAll("${scope} .brand-ticker")].every((el) => el.dataset.slot === "name")`, "约 4 秒后滚回站名", 6000);

  const box = await browser.evaluate(`(() => { const r = document.querySelector("${scope} .brand-ticker").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await sleep(7500);
  assert.equal((await tickers(scope))[0].slot, "name", "鼠标停在上面时不滚");
  assert.equal((await tickers(scope))[1].slot, "live", "其他示例照常滚动");
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  await waitFor(`document.querySelector("${scope} .brand-ticker").dataset.slot === "live"`, "鼠标移开后继续滚");

  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal((await tickers(scope))[0].barAnimation, "none", "减少动态效果时音频条不跳");
  await browser.send("Emulation.setEmulatedMedia", { features: [] });

  // 二、真实页头
  await browser.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `{ const Native = window.WebSocket; window.WebSocket = class extends Native { constructor(url, protocols) { super(String(url).includes("/socket.io") ? "ws://127.0.0.1:9/" : url, protocols); } }; }`,
  });
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: "*/fn/ps/update*" }] });
  browser.listeners.push((m) => {
    if (m.method !== "Fetch.requestPaused") return;
    browser.send("Fetch.fulfillRequest", {
      requestId: m.params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }],
      body: Buffer.from(JSON.stringify(fake)).toString("base64"),
    });
  });
  const header = (scopeSelector = ".site-header") => browser.evaluate(`(() => {
    const ticker = document.querySelector("${scopeSelector} .brand-ticker");
    const nav = document.querySelector(".island-nav .navigation-List")?.getBoundingClientRect();
    return { live: ticker.hasAttribute("data-live"), slot: ticker.dataset.slot, width: Math.round(ticker.getBoundingClientRect().width), navX: nav && Math.round(nav.x), described: document.getElementById(document.querySelector(".site-brand").getAttribute("aria-describedby"))?.textContent ?? null, mode: document.querySelector(".site-header").dataset.mode, breathing: getComputedStyle(document.querySelector(".site-brand-avatar")).animationName };
  })()`);

  await browser.goto(`${base}/posts`);
  await waitFor(`document.querySelector(".site-header .brand-ticker").hasAttribute("data-live")`, "读到站长状态后进入滚动");
  const top = await header();
  assert.equal(top.slot, "name");
  assert.equal(top.described, "站长此刻：在用 E2E 测试 App · 在听 测试歌 – 测试歌手", "读屏把状态作为首页链接的描述念出来");
  await waitFor(`document.querySelector(".site-header .brand-ticker").dataset.slot === "live"`, "页头站名区滚到 App + 音频条");
  await sleep(700);
  const rolled = await header();
  assert.equal(rolled.width, top.width, "页头这一格宽度不变");
  assert.equal(rolled.navX, top.navX, "导航没有左右挪");

  const article = await browser.evaluate(`[...document.querySelectorAll('a[href*="/posts/"]')].map((a) => a.getAttribute("href")).find((href) => href.split("/").length >= 4)`);
  assert.ok(article, "文章列表里有文章链接");
  await browser.goto(`${base}${article}`);
  await browser.evaluate("window.scrollTo(0, 900)");
  await waitFor(`document.querySelector(".site-header").dataset.mode === "compact"`, "往下读收成阅读胶囊");
  assert.equal((await header()).breathing, "brand-avatar-breathe", "阅读胶囊里头像光圈在呼吸（站长在电脑前）");

  fake = { processInfo: null, mediaInfo: null };
  await browser.evaluate(`document.dispatchEvent(new Event("visibilitychange"))`);
  await waitFor(`!document.querySelector(".site-header .brand-ticker").hasAttribute("data-live")`, "站长离开后停止滚动");
  const away = await header();
  assert.equal(away.breathing, "none", "站长不在时光圈不呼吸");
  assert.equal(away.described, null, "没有状态描述");

  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log("PASS 站名区滚动：示例按 6/4 秒滚动、宽度不变、图标/首字/音频条、不写歌名、悬停暂停、减少动态效果；页头读状态滚动、导航不挪、读屏描述、阅读胶囊光圈呼吸、离开后停止");
} finally {
  await browser.close();
}
