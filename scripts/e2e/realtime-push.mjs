// 浏览器回归测试：实时推送补齐（docs/shiro-gaps.md 第 6 项，2026-11-07）。
// ① 正在看的手记被修改：夜航岛播报“手记有更新”，页面不整页刷新就换成新内容（刷新时在浏览器里拦下页面数据，把标题换成别的，相当于后台改了标题）；
// ② 阅读数跟着 Core 的广播实时变，别的那篇的广播不影响；③ 正在看的手记被删除：播报后跳回手记列表；
// ④ 新手记、新思考在别的页面上播报并带“去看看”；在一言页收到新一言只播报、不带“去看看”（改为刷新列表）。
// Core 的实时连接换成页面里的假 WebSocket（helpers.mjs 的 fakeSocket），全程只读 Core，不写日常库。
// 需先开 pnpm dev。用法：node scripts/e2e/realtime-push.mjs
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";
import { clickNav, fakeSocket } from "./helpers.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const json = async (path) => (await fetch(core + path, { signal: AbortSignal.timeout(10000) })).json();
// 词典 notifications 里的中文原文（apps/web/lib/i18n/messages/zh.ts）
const zh = {
  NOTE_UPDATE: { title: "手记有更新", description: "已换成最新内容。" },
  NOTE_DELETE: { title: "这篇手记已移除" },
  NOTE_CREATE: { title: "有新手记了" },
  RECENTLY_CREATE: { title: "写下了一条新思考" },
  SAY_CREATE: { title: "收录了一句新的一言" },
};

const [note, other] = (await json("/notes?page=1&size=2")).data;
assert.ok(note && other, "本地要有两篇公开手记");
// 换成 UTF-8 字节数相同的新标题：RSC 数据里长文本带字节长度前缀，长度一变整份数据就解析不了
const renamed = [...note.title].map((char) => ({ 1: "x", 2: "é", 3: "新" })[Buffer.byteLength(char)] ?? char).join("");
assert.notEqual(renamed, note.title);

const browser = await openBrowser({ port: 9460 });
try {
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: fakeSocket });
  await browser.setViewport(1920, 991);
  const emit = (type, data) => browser.evaluate(`window.__emit(${JSON.stringify({ type, data })})`);
  const island = () => browser.evaluate(`(() => { const box = document.querySelector(".island-activity"); const text = box?.querySelector(".island-activity-text"); return box && { title: text.querySelector("strong")?.textContent, detail: text.querySelector("span")?.textContent ?? null, link: box.querySelector(".island-activity-link")?.getAttribute("href") ?? null, tone: box.dataset.tone }; })()`);
  const waitFor = async (what, check, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const value = await check();
      if (value) return value;
      await sleep(250);
    }
    throw new Error(`一直没有等到：${what}`);
  };
  const broadcast = (title) => waitFor(`岛上播报“${title}”`, async () => { const shown = await island(); return shown?.title === title && shown; });
  const visible = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.checkVisibility())`;

  await browser.goto(`${base}/notes/${note.nid}`, 5000);
  await waitFor("加入这篇的房间", () => browser.evaluate(`window.__sent.some((packet) => packet.includes("article-${note.id}"))`));
  await browser.evaluate("window.__marker = 1");

  // ② 阅读数
  const reads = () => browser.evaluate(`${visible(".read-count")}?.textContent`);
  assert.match(await reads(), new RegExp(String(note.count.read)), "先显示页面读到的阅读数");
  await emit("ARTICLE_READ_COUNT_UPDATE", { id: other.id, count: 98765, type: "note" });
  await sleep(500);
  assert.doesNotMatch(await reads(), /98765/, "别的那篇的阅读数不影响这篇");
  await emit("ARTICLE_READ_COUNT_UPDATE", { id: note.id, count: 98765, type: "note" });
  await waitFor("阅读数变成 98765", async () => /98765/.test(await reads()));

  // ① 修改：拦下修改后刷新拿到的页面数据（服务端函数的响应和 router.refresh 的 RSC），把标题换掉
  let swapped = 0;
  let interceptError;
  browser.listeners.push(async (message) => {
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, responseStatusCode, responseHeaders } = message.params;
    try {
      const { result, error } = await browser.send("Fetch.getResponseBody", { requestId });
      if (error) throw new Error(`取不到刷新的响应：${error.message}`);
      const body = Buffer.from(result.body, result.base64Encoded ? "base64" : "utf8").toString("utf8");
      if (body.includes(note.title)) swapped++;
      await browser.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: responseStatusCode,
        responseHeaders: responseHeaders.filter(({ name }) => !/^(content-length|content-encoding)$/i.test(name)),
        body: Buffer.from(body.replaceAll(note.title, renamed)).toString("base64"),
      });
    } catch (error) {
      interceptError ??= error;
      await browser.send("Fetch.continueRequest", { requestId });
    }
  });
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: `*/notes/${note.nid}*`, resourceType: "Fetch", requestStage: "Response" }] });
  await emit("NOTE_UPDATE", { id: other.id, title: "别的手记" });
  await sleep(500);
  assert.equal(await island(), null, "别的手记改了不播报");
  await emit("NOTE_UPDATE", { id: note.id, nid: note.nid, title: note.title });
  assert.deepEqual(await broadcast(zh.NOTE_UPDATE.title), { title: zh.NOTE_UPDATE.title, detail: zh.NOTE_UPDATE.description, link: null, tone: "update" }, "播报手记有更新");
  await waitFor("标题换成新内容", () => browser.evaluate(`${visible("h1")}?.textContent === ${JSON.stringify(renamed)}`), 40);
  await browser.send("Fetch.disable");
  if (interceptError) throw interceptError;
  assert.ok(swapped > 0, "修改后重新向服务端要了这篇的页面数据");
  assert.equal(await browser.evaluate("window.__marker"), 1, "没有整页刷新");
  await sleep(5500);

  // ③ 删除：载荷是 id 字符串
  await emit("NOTE_DELETE", other.id);
  await sleep(500);
  assert.equal(await island(), null, "别的手记删了不管");
  await emit("NOTE_DELETE", note.id);
  assert.equal((await broadcast(zh.NOTE_DELETE.title)).tone, "remove", "播报手记已移除");
  assert.equal(await browser.evaluate("location.pathname"), `/notes/${note.nid}`, "先让读者看清播报");
  await waitFor("跳回手记列表", async () => (await browser.evaluate("location.pathname")) === "/notes", 20);
  assert.equal(await browser.evaluate("window.__marker"), 1, "站内跳转，不整页刷新");
  await sleep(5500);

  // ③b 收到删除后读者马上自己去了别的页面：等待结束后不能再把他拉回列表（Codex 复查发现）
  await browser.evaluate(`(async () => { document.querySelector('a[href="/notes/${note.nid}"]').click(); for (let i = 0; i < 100 && location.pathname !== "/notes/${note.nid}"; i++) await new Promise((r) => setTimeout(r, 50)); await new Promise((r) => setTimeout(r, 1500)); })()`);
  assert.equal(await browser.evaluate("location.pathname"), `/notes/${note.nid}`, "回到这篇手记");
  await emit("NOTE_DELETE", note.id);
  assert.equal(await browser.evaluate(clickNav("/timeline", 300)), "/timeline", "读者自己去了时间线");
  await sleep(2500);
  assert.equal(await browser.evaluate("location.pathname"), "/timeline", "离开了被删的那篇，就不再跳回手记列表");
  await sleep(5500);

  // ④ 新手记、新思考：别的页面上播报，带“去看看”
  await emit("NOTE_CREATE", { id: "000000000000000000000000", nid: 999, title: "测试用新手记", isPublished: true });
  assert.deepEqual(await broadcast(zh.NOTE_CREATE.title), { title: zh.NOTE_CREATE.title, detail: "《测试用新手记》", link: "/notes/999", tone: "note" });
  await sleep(5500);
  await emit("NOTE_CREATE", { id: "000000000000000000000000", nid: 998, title: "没发布的手记", isPublished: false });
  await sleep(800);
  assert.equal(await island(), null, "没发布的手记不播");
  await emit("RECENTLY_CREATE", { id: "000000000000000000000000", content: "读到一句话，想了很久" });
  assert.deepEqual(await broadcast(zh.RECENTLY_CREATE.title), { title: zh.RECENTLY_CREATE.title, detail: "读到一句话，想了很久", link: "/thinking", tone: "thinking" });
  await sleep(5500);

  await browser.goto(`${base}/says`, 5000);
  await emit("SAY_CREATE", { id: "000000000000000000000000", text: "月色真美" });
  assert.deepEqual(await broadcast(zh.SAY_CREATE.title), { title: zh.SAY_CREATE.title, detail: "月色真美", link: null, tone: "say" }, "一言页上不带“去看看”");
  await sleep(2500);
  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log(`PASS 实时推送：手记修改后不整页刷新换上新内容、阅读数实时变、删除后播报并跳回列表、新手记/新思考播报带“去看看”、一言页收到新一言只播报`);
} finally {
  await browser.close();
}
