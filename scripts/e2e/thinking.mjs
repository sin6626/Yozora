// 浏览器回归测试：思考页的“星图注记”（2026-11-12）。原来每条是一个大方框，带“赞 0 / 踩 0”胶囊和浏览器默认的“▶ 评论 0”三角，
// 引用只有一行“引用：xxx”。现在：星座线上每条一颗小星，看法用文楷，引用的书、题目、仓库、网页、音乐、影视、论文、站内文章像票根挂在下面，
// 赞踩评论是小图标（数字为 0 只有图标），点评论才展开评论区。主要用 /debug 的示例数据（本地库的思考都是纯文字），再看一眼真实的 /thinking。
// 投票在页面里拦下 fetch 换成假响应，不写库。截图存 .local/previews/thinking/。
// 需要先运行 pnpm dev。用法：node scripts/e2e/thinking.mjs
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const shots = new URL("../../.local/previews/thinking/", import.meta.url);
mkdirSync(shots, { recursive: true });
const shot = async (browser, name) => {
  const { result } = await browser.send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
  writeFileSync(new URL(`${name}.jpg`, shots), Buffer.from(result.data, "base64"));
};
const waitFor = async (browser, expression, ms = 10000) => {
  for (let t = 0; t < ms; t += 200) { if (await browser.evaluate(expression)) return true; await sleep(200); }
  return false;
};
const log = `document.querySelector("#debug-thinking .thinking-log:not(.is-empty)")`;

const browser = await openBrowser({ port: 9490 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/debug`, 5000);
  await browser.evaluate(`document.querySelector("#debug-thinking").scrollIntoView()`);
  await sleep(600);

  const page = await browser.evaluate(`(() => {
    const log = ${log};
    const entries = [...log.querySelectorAll(":scope > .thinking-entry")];
    const lineX = log.getBoundingClientRect().left + parseFloat(getComputedStyle(log).getPropertyValue("--node-x")) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const quotes = [...log.querySelectorAll(".thinking-quote")];
    const coverTitle = log.querySelector(".thinking-cover-title");
    return {
      entries: entries.length,
      stars: entries.map((li) => { const r = li.querySelector(".thinking-star").getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - lineX); }),
      types: quotes.map((q) => q.dataset.type).sort(),
      external: quotes.filter((q) => q.dataset.type !== "ref").every((q) => q.target === "_blank" && q.rel.includes("noopener") && /^https?:/.test(q.href)),
      ref: (() => { const q = log.querySelector('.thinking-quote[data-type="ref"]'); return { tag: q.tagName, target: q.target, href: q.getAttribute("href") }; })(),
      coverWidth: coverTitle.getBoundingClientRect().width, coverFont: parseFloat(getComputedStyle(coverTitle).fontSize),
      font: getComputedStyle(log.querySelector(".thinking-text .article-body")).fontFamily,
      oldStyles: log.querySelectorAll(".toggle-chip, details, .thinking-card").length,
      quoteText: log.innerText.includes("引用："),
      first: (() => { const buttons = [...entries[0].querySelectorAll(".thinking-action")]; return buttons.map((b) => ({ label: b.getAttribute("aria-label"), text: b.textContent })); })(),
      noComments: entries.slice(1).every((li) => !li.querySelector("[aria-expanded]")),
      safeLangColor: getComputedStyle(log.querySelector(".thinking-lang")).getPropertyValue("--lang").trim(),
    };
  })()`);
  assert.equal(page.entries, 9, "示例有 9 条");
  assert.ok(page.stars.every((d) => d < 1.5), `每颗小星都在星座线上：${page.stars}`);
  assert.deepEqual(page.types, ["academic", "book", "code", "github", "link", "media", "music", "ref"], "八种引用卡片都在");
  assert.ok(page.external, "外部引用新标签页打开、带 noopener、只有 http(s)");
  assert.deepEqual(page.ref, { tag: "A", target: "", href: "/posts/debug/shiro-to-yozora" }, "站内文章走站内链接");
  assert.ok(page.coverWidth < page.coverFont * 1.8, `画出来的书名只占一列（${page.coverWidth}px）`);
  assert.match(page.font, /LXGW WenKai/, "看法用文楷");
  assert.equal(page.oldStyles, 0, "没有旧的胶囊、details 和方框");
  assert.equal(page.quoteText, false, "没有旧的“引用：xxx”");
  assert.deepEqual(page.first, [{ label: "赞 3", text: "3" }, { label: "踩 0", text: "" }, { label: "评论 0", text: "" }], "数字为 0 时只有图标");
  assert.ok(page.noComments, "关了评论又没有评论的条目没有评论按钮");
  assert.equal(page.safeLangColor, "#3178c6");

  // 评论：点了才展开，再点收起
  const comments = `${log}.querySelector(".thinking-comments")`;
  assert.equal(await browser.evaluate(`${comments}.checkVisibility()`), false, "评论区默认收起");
  await browser.evaluate(`${log}.querySelector("[aria-expanded]").click()`);
  await sleep(300);
  const opened = await browser.evaluate(`({ expanded: ${log}.querySelector("[aria-expanded]").getAttribute("aria-expanded"), visible: ${comments}.checkVisibility(), form: Boolean(${comments}.querySelector("form")) })`);
  assert.deepEqual(opened, { expanded: "true", visible: true, form: true }, "点评论展开评论区和表单");
  await browser.evaluate(`${log}.querySelector("[aria-expanded]").click()`);
  await sleep(200);
  assert.equal(await browser.evaluate(`${comments}.checkVisibility()`), false, "再点收起");

  // 赞：拦下请求换成“已投”，按钮亮起、数字加一（不写库）
  await browser.evaluate(`(() => {
    const real = window.fetch;
    window.__attitude = [];
    window.fetch = (input, init) => {
      const url = String(input);
      if (url.includes("/recently/attitude/")) { window.__attitude.push(url); return Promise.resolve(new Response(JSON.stringify({ code: 1 }), { headers: { "content-type": "application/json" } })); }
      return real(input, init);
    };
  })()`);
  const id1 = "000000000000000000000001";
  await browser.evaluate(`localStorage.removeItem("attitude:${id1}")`);
  await browser.evaluate(`${log}.querySelector(".thinking-action").click()`);
  assert.ok(await waitFor(browser, `${log}.querySelector(".thinking-action").getAttribute("aria-pressed") === "true"`), "点赞后按钮亮起");
  const voted = await browser.evaluate(`({ text: ${log}.querySelector(".thinking-action").textContent, sent: window.__attitude, color: getComputedStyle(${log}.querySelector(".thinking-action")).color, primary: getComputedStyle(document.documentElement).getPropertyValue("--primary") })`);
  assert.equal(voted.text, "4");
  assert.deepEqual(voted.sent.map((u) => new URL(u).pathname + new URL(u).search), [`/recently/attitude/${id1}?attitude=0`]);
  await browser.evaluate(`localStorage.removeItem("attitude:${id1}")`);

  // 空列表：一颗空心的星和一句话
  const empty = await browser.evaluate(`(() => { const e = document.querySelector("#debug-thinking .thinking-log.is-empty"); const s = getComputedStyle(e.querySelector(".thinking-star")); return { text: e.innerText.trim(), shadow: s.boxShadow, border: s.borderTopWidth }; })()`);
  assert.equal(empty.text, "还没有思考。读到好东西的时候，会记在这里。");
  assert.equal(empty.shadow, "none");
  assert.equal(empty.border, "1px");
  await shot(browser, "e2e-debug-1920");

  // 手机：票根不超出屏幕
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/debug`, 5000);
  await browser.evaluate(`document.querySelector("#debug-thinking").scrollIntoView()`);
  await sleep(500);
  const phone = await browser.evaluate(`[...${log}.querySelectorAll(".thinking-quote")].map((q) => q.getBoundingClientRect().right)`);
  assert.ok(phone.every((right) => right <= 390 - 8), `手机上票根都在屏幕内：${phone}`);
  await shot(browser, "e2e-debug-390");

  // 真实的思考页：条数和 Core 一致，都是星图注记
  const recent = await (await fetch(`${core}/recently?size=20`)).json();
  const count = (recent.data ?? recent).length;
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/thinking`, 5000);
  assert.ok(await waitFor(browser, `Boolean(document.querySelector(".thinking-log"))`), "思考页渲染出星图注记");
  const real = await browser.evaluate(`({ entries: document.querySelectorAll(".thinking-log:not(.is-empty) > .thinking-entry").length, empty: Boolean(document.querySelector(".thinking-log.is-empty")) })`);
  assert.deepEqual(real, count ? { entries: count, empty: false } : { entries: 0, empty: true });
  await shot(browser, "e2e-page-1920");

  // 开发模式下凡是实时向 Core 取数据的页面都会报 Date.now()（AGENTS.md 2026-11-12，线上没有），这里不算
  assert.deepEqual(browser.errors.filter((e) => !/Transition was skipped|unstable value `Date.now\(\)`/.test(e)), [], "页面不能报错");
  console.log("thinking: 通过");
} finally {
  await browser.close();
}
