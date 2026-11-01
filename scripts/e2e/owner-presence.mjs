// 浏览器回归测试：页头头像右边的站名区（components/owner-presence.tsx）。
// 一、调试页的写死示例：站名停 6 秒后向上滚成“App 图标 + 音频条”，再停 14 秒（一个周期七成）滚回；宽度不变（导航不挪）；
//     没图标时是首字方块；放歌时音频条在跳，没放歌时是安静的点；悬停图标弹出卡片：用霞鹜文楷写的一句话（App 带清晰图标、
//     不写用了多久），放歌时下面是在转的小唱片和进度线，没进度时小唱片跟在句尾，没放歌时“此刻很安静”且不从中间断行；
//     悬停期间不滚；悬停右边不会点亮左边的头像；减少动态效果时音频条不跳。
// 二、真实页头：浏览器里拦截 GET /fn/ps/update 换成测试数据，并让 Core 的 WebSocket 连不上（站长自己的 Companion 正在实时上报，
//     不能让它的广播干扰测试，也不往 Core 写东西）：滚动且导航不挪、读屏描述、头像和站名区分开、卡片、阅读胶囊里头像光圈呼吸、离开后停止。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9372 });
const waitFor = async (expression, message, timeout = 9000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await browser.evaluate(expression)) return Date.now();
    await sleep(100);
  }
  assert.fail(message);
};
const slotOf = (selector) => `document.querySelector(${JSON.stringify(selector)} + " .brand-ticker")?.dataset.slot`;
const ticker = (selector) => browser.evaluate(`(() => {
  const root = document.querySelector(${JSON.stringify(selector)});
  const el = root.querySelector(".brand-ticker");
  const bar = el.querySelector(".presence-bars i");
  const monogram = el.querySelector('.brand-ticker-icon[data-kind="letter"]');
  return {
    slot: el.dataset.slot,
    width: Math.round(el.getBoundingClientRect().width),
    text: el.textContent,
    liveText: el.querySelector(".brand-ticker-live").innerText.trim(),
    icon: Boolean(el.querySelector("img.brand-ticker-icon")),
    letter: monogram ? getComputedStyle(monogram, "::before").content : null,
    playing: el.querySelector(".presence-bars")?.hasAttribute("data-playing") ?? null,
    barAnimation: bar ? getComputedStyle(bar).animationName : null,
    avatarShadow: getComputedStyle(root.querySelector(".site-brand-avatar")).boxShadow,
    hiddenInert: el.querySelector(el.dataset.slot === "name" ? ".brand-ticker-live" : ".brand-ticker-name").inert,
  };
})()`);
const hover = async (selector) => {
  const box = await browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await sleep(900);
};
const leave = async () => {
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 795 });
  await sleep(600);
};
const card = () => browser.evaluate(`(async () => {
  const el = document.querySelector(".presence-card");
  if (!el || !el.checkVisibility()) return null;
  const text = el.querySelector(".presence-note-text");
  const disc = el.querySelector(".presence-disc");
  const first = disc && getComputedStyle(disc).rotate;
  await new Promise((r) => setTimeout(r, 400));
  const icon = el.querySelector(".presence-note-icon");
  const fill = el.querySelector(".presence-note-line > span");
  // “此刻很安静。”这几个字在不在同一行（中文只在标点处换行）
  const quietLines = (() => {
    const node = [...text.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes("此刻很安静"));
    if (!node) return null;
    const range = document.createRange();
    const start = node.textContent.indexOf("此刻很安静");
    range.setStart(node, start);
    range.setEnd(node, start + "此刻很安静。".length);
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
  })();
  return {
    text: el.innerText.replace(/\\s+/g, " ").trim(),
    font: getComputedStyle(text).fontFamily.split(",")[0].replaceAll('"', ""),
    icon: icon && { kind: icon.dataset.kind, src: icon.getAttribute("src"), loaded: icon.tagName === "IMG" ? icon.naturalWidth > 0 : null },
    disc: Boolean(disc),
    spinning: Boolean(disc) && getComputedStyle(disc).rotate !== first,
    progress: fill ? fill.getBoundingClientRect().width : null,
    quietLines,
  };
})()`);

let fake = {
  processInfo: { name: "E2E 测试 App" },
  mediaInfo: { title: "测试歌", artist: "测试歌手", player: "Music", duration: 200, elapsed: 50, at: Date.now() },
};
try {
  await browser.setViewport(1280, 800);

  // 一、调试页示例
  await browser.goto(`${base}/debug`);
  await browser.evaluate(`window.scrollTo(0, document.querySelector("#debug-brand-ticker").getBoundingClientRect().top + scrollY - 120)`);
  const ids = ["#debug-brand-ticker-both", "#debug-brand-ticker-app", "#debug-brand-ticker-media"];
  for (const [path, status] of [["/api/app-icon/chrome", 200], ["/api/app-icon/nope", 404]]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, status, `${path} 应当是 ${status}`);
    if (status === 200) assert.match(response.headers.get("content-type"), /image\/svg\+xml/);
  }
  const before = await Promise.all(ids.map(ticker));
  assert.deepEqual(before.map((t) => t.slot), ["name", "name", "name"], "一开始显示站名");
  assert.ok(before.every((t) => t.text === "Sin’s Yozora"), "站名元素的文字只有站名（首字写在 CSS 里）");
  assert.ok(before.every((t) => t.hiddenInert), "看不见的那一格不能被聚焦或点到");
  const liveAt = await waitFor(ids.map((id) => `${slotOf(id)} === "live"`).join(" && "), "约 6 秒后滚到 App 图标 + 音频条");
  await sleep(700);
  const [both, appOnly, mediaOnly] = await Promise.all(ids.map(ticker));
  assert.deepEqual([both.width, appOnly.width, mediaOnly.width], before.map((t) => t.width), "滚动前后宽度不变（导航不会挪）");
  assert.ok(both.icon && both.playing && both.barAnimation === "presence-bar", "有图标时显示图标，放歌时音频条在跳");
  assert.equal(both.liveText, "", "不写 App 名和歌名");
  assert.ok(appOnly.icon, "认不得的 App 用 Companion 的小图标");
  assert.ok(appOnly.playing === false && appOnly.barAnimation === "presence-rest", "没放歌时是几颗安静的点（只亮暗起伏）");
  assert.ok(!mediaOnly.icon && mediaOnly.letter === null && mediaOnly.playing, "只在听歌时只有音频条");
  assert.equal((await ticker("#debug-brand-ticker-letter")).letter, '"G"', "认不得又没有图标时是首字方块");

  await hover(`${ids[0]} .brand-ticker-trigger`);
  const hovered = await ticker(ids[0]);
  assert.equal(hovered.avatarShadow, both.avatarShadow, "悬停右边的图标不会点亮左边的头像");
  const full = await card();
  assert.ok(full, "悬停弹出卡片");
  assert.match(full.text, /^Sin 正开着 Google Chrome，耳机里是颜人中的《晚安》。 1:1\d \/ 4:49$/, "一句话说在用的 App 和在听的歌，下面是进度");
  assert.ok(!/分钟|刚刚/.test(full.text), "不显示用了多久");
  assert.equal(full.font, "LXGW WenKai", "用首屏的霞鹜文楷");
  assert.ok(full.icon.kind === "vector" && full.icon.src.startsWith("/api/app-icon/chrome") && full.icon.loaded, "认得的 App 用清晰的矢量图标");
  assert.ok(full.spinning && full.progress > 0, "小唱片在转（角度在变），进度线有长度");
  await sleep(2500);
  assert.equal(await browser.evaluate(slotOf(ids[0])), "live", "卡片开着时不滚");
  await leave();
  assert.equal(await card(), null, "移开后卡片收起");

  await hover(`${ids[1]} .brand-ticker-trigger`);
  const quiet = await card();
  assert.equal(quiet.text, "Sin 正开着 UU远程，此刻很安静。", "没放歌时说“此刻很安静”");
  assert.ok(!quiet.disc && quiet.progress === null, "没放歌时没有唱片和进度");
  assert.ok(quiet.icon.kind === "bitmap" && quiet.icon.loaded, "认不得的 App 用 Companion 的小图标（缩小显示，不拉大）");
  await leave();

  const nameAt = await waitFor(`${slotOf(ids[2])} === "name"`, "约 14 秒后滚回站名", 17000);
  const liveSeconds = (nameAt - liveAt) / 1000;
  assert.ok(liveSeconds > 12.5 && liveSeconds < 16, `App 那一格停约 14 秒（实际 ${liveSeconds.toFixed(1)} 秒）`);
  assert.equal(await browser.evaluate(slotOf(ids[0])), "live", "悬停过的示例从移开后重新计时，还没滚回");

  await waitFor(`${slotOf("#debug-brand-ticker-letter")} === "live" && ${slotOf(ids[2])} === "live"`, "没碰过的示例再次滚到图标", 8000);
  await sleep(700); // 等滚动动画走完再移鼠标
  await hover("#debug-brand-ticker-letter .brand-ticker-trigger");
  const letter = await card();
  assert.equal(letter.icon.kind, "letter", "认不得又没有图标时显示首字");
  assert.equal(letter.quietLines, 1, "“此刻很安静。”不被拆到两行（中文只在标点处换行）");
  await leave();

  await hover(`${ids[2]} .brand-ticker-trigger`);
  const music = await card();
  assert.equal(music.text, "Sin 的耳机里是郭静的《下一个天亮》。", "只在听歌");
  assert.ok(music.spinning && music.progress === null, "没有进度时小唱片跟在句子后面转");
  await leave();


  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal((await ticker(ids[0])).barAnimation, "none", "减少动态效果时音频条不跳");
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
  const header = () => browser.evaluate(`(() => {
    const ticker = document.querySelector(".site-header .brand-ticker");
    const nav = document.querySelector(".island-nav .navigation-List")?.getBoundingClientRect();
    return {
      live: ticker.hasAttribute("data-live"),
      width: Math.round(ticker.getBoundingClientRect().width),
      navX: nav && Math.round(nav.x),
      described: document.getElementById(document.querySelector(".site-brand").getAttribute("aria-describedby"))?.textContent ?? null,
      separate: !document.querySelector(".site-brand").contains(ticker),
      nameTab: ticker.querySelector(".brand-ticker-name a").tabIndex,
      breathing: getComputedStyle(document.querySelector(".site-header .site-brand-avatar")).animationName,
    };
  })()`);

  await browser.goto(`${base}/posts`);
  await waitFor(`document.querySelector(".site-header .brand-ticker").hasAttribute("data-live")`, "读到站长状态后进入滚动");
  const top = await header();
  assert.equal(top.described, "站长此刻：在用 E2E 测试 App · 在听 测试歌 – 测试歌手", "读屏把状态作为首页链接的描述念出来");
  assert.ok(top.separate && top.nameTab === -1, "头像是首页链接，站名区在链接外面；站名里的链接不进 Tab 顺序");
  await waitFor(`${slotOf(".site-header")} === "live"`, "页头站名区滚到 App + 音频条");
  await sleep(700);
  const rolled = await header();
  assert.deepEqual([rolled.width, rolled.navX], [top.width, top.navX], "页头这一格宽度不变、导航没有挪");
  await hover(".site-header .brand-ticker-trigger");
  const headerCard = await card();
  assert.match(headerCard?.text ?? "", /^Sin 正开着 E2E 测试 App，耳机里是测试歌手的《测试歌》。/, "页头悬停弹出卡片，主语是后台个人资料里的站长名字");
  assert.equal(headerCard.icon.kind, "letter", "认不得又没有图标时显示首字");
  await leave();

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
  console.log(`PASS 站名区：示例 6 秒站名、${liveSeconds.toFixed(1)} 秒 App 与音频条，宽度不变，图标/首字/跳动音频条/安静的点，悬停卡片（一句话、文楷、矢量图标、小唱片和进度、此刻很安静不断行）且不点亮头像、卡片开着不滚、减少动态效果；页头读状态、导航不挪、读屏描述、头像与站名区分开、阅读胶囊光圈呼吸、离开后停止`);
} finally {
  await browser.close();
}
