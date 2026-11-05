// 浏览器回归测试：外文页面的夜航岛文章播报（2026-11-05 AI i18n）。
// ① 新文章、修改文章的通知只带中文标题：英文页面向 Core 要这篇的英文译名，有就播译名，没有就播中文原题并标 lang="zh-CN"；书名号用词典里的写法（英文是引号）。
// ② 播报文案的译文变了以后，页面 router.refresh 拿到新译文，之后的播报用新文案（原来文案存在 ref 里，停在页面第一次打开时的那份）。
// Core 的实时连接换成页面里的假 WebSocket（按 socket.io 协议回握手、推消息）；②不改 Core 里的译文，而是在浏览器里拦下刷新时的页面数据，
// 把那句播报文案换成别的。全程只读 Core，不写日常库。
// 需先开 pnpm dev。用法：node scripts/e2e/island-broadcast-i18n.mjs
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const json = async (path, init) => (await fetch(core + path, { ...init, signal: AbortSignal.timeout(10000) })).json();

// 一篇有英文译文的文章
const posts = (await json("/posts?page=1&size=20")).data;
let translated;
for (const post of posts) {
  const response = await fetch(`${core}/ai/translations/article/${post.id}?lang=en`);
  const data = response.ok ? await response.json() : null;
  if (data?.title) {
    translated = { id: post.id, zh: post.title, en: data.title };
    break;
  }
}
assert.ok(translated, "本地要有一篇带英文译文的文章");
const { messages } = await json("/ai/i18n/en");
const quoted = (title) => messages["notifications.quoted"].replace("{title}", title);

const fakeSocket = `{
  const Native = window.WebSocket;
  window.__sockets = [];
  class Fake extends EventTarget {
    constructor(url, protocols) {
      super();
      if (!String(url).includes("/socket.io")) return new Native(url, protocols);
      this.url = String(url); this.readyState = 0; this.binaryType = "blob"; this.protocol = ""; this.extensions = "";
      window.__sockets.push(this);
      setTimeout(() => { this.readyState = 1; this.onopen?.({}); this.deliver("0" + JSON.stringify({ sid: "fake", upgrades: [], pingInterval: 600000, pingTimeout: 600000, maxPayload: 1000000 })); }, 0);
    }
    deliver(data) { this.onmessage?.({ data }); }
    send(data) {
      const connect = /^40(\\/[^,]*)?,?/.exec(String(data));
      if (connect) setTimeout(() => this.deliver("40" + (connect[1] ? connect[1] + "," : "") + JSON.stringify({ sid: "fake-nsp" })), 0);
    }
    close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: "" }); }
  }
  for (const [name, value] of [["CONNECTING", 0], ["OPEN", 1], ["CLOSING", 2], ["CLOSED", 3]]) { Fake[name] = value; Fake.prototype[name] = value; }
  window.WebSocket = Fake;
  window.__emit = (message) => window.__sockets.forEach((socket) => socket.deliver("42/web," + JSON.stringify(["message", message])));
}`;

const original = messages["notifications.POST_UPDATE.title"];
const renamed = "Post updated just now";

const browser = await openBrowser({ port: 9368 });
try {
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: fakeSocket });
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/en/notes`, 5000);
  assert.ok(await browser.evaluate("window.__sockets.length > 0"), "页面连上了假的实时连接");

  // 等岛上出现指定标题的播报，返回第二行
  const broadcast = async (title) => {
    for (let i = 0; i < 60; i++) {
      const shown = await browser.evaluate(`(() => { const text = document.querySelector(".island-activity-text"); return text && { title: text.querySelector("strong")?.textContent, detail: text.querySelector("span")?.textContent ?? null, lang: text.querySelector("span")?.getAttribute("lang") ?? null }; })()`);
      if (shown?.title === title) return shown;
      await sleep(250);
    }
    throw new Error(`岛上一直没有出现“${title}”`);
  };

  await browser.evaluate(`window.__emit(${JSON.stringify({ type: "POST_CREATE", data: { id: translated.id, title: translated.zh, isPublished: true } })})`);
  assert.deepEqual(await broadcast(messages["notifications.POST_CREATE.title"]), { title: messages["notifications.POST_CREATE.title"], detail: quoted(translated.en), lang: null }, "有英文译名时播译名");
  await sleep(5500);

  await browser.evaluate(`window.__emit(${JSON.stringify({ type: "POST_UPDATE", data: { id: "000000000000000000000000", title: "还没有译文的文章" } })})`);
  assert.deepEqual(await broadcast(original), { title: original, detail: quoted("还没有译文的文章"), lang: "zh-CN" }, "没有译名时播中文原题并标 zh-CN");
  await sleep(5500);

  // ② 刷新时把页面数据里这句的译文换掉（RSC 里 LocaleProvider 的 translations），相当于后台改了它
  const field = (text) => `"notifications.POST_UPDATE.title":${JSON.stringify(text)}`;
  let swapped = 0;
  browser.listeners.push(async (message) => {
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, responseStatusCode, responseHeaders } = message.params;
    const { result } = await browser.send("Fetch.getResponseBody", { requestId });
    const body = Buffer.from(result.body, result.base64Encoded ? "base64" : "utf8").toString("utf8");
    if (body.includes(field(original))) swapped++;
    await browser.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: responseStatusCode,
      responseHeaders: responseHeaders.filter(({ name }) => !/^(content-length|content-encoding)$/i.test(name)),
      body: Buffer.from(body.replaceAll(field(original), field(renamed))).toString("base64"),
    });
  });
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: "*_rsc=*", requestStage: "Response" }] });
  await browser.evaluate("window.next.router.refresh()");
  await sleep(3000);
  await browser.send("Fetch.disable");
  assert.ok(swapped > 0, "刷新拿到的页面数据里有这句译文");
  await browser.evaluate(`window.__emit(${JSON.stringify({ type: "POST_UPDATE", data: { id: "000000000000000000000000", title: "还没有译文的文章" } })})`);
  assert.equal((await broadcast(renamed)).title, renamed, "刷新后用新的播报文案");
  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log(`PASS 夜航岛外文播报：有译名播“${translated.en}”、没有时中文原题标 zh-CN、书名号随语言、译文变了刷新后就用新的`);
} finally {
  await browser.close();
}
