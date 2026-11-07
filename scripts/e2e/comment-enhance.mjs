// 浏览器回归测试：评论增强（docs/shiro-gaps.md 第 7 项）。
// ① 表情：文末评论表单和“边读边聊”悬浮窗都有表情按钮；打开后焦点在第一个表情，方向键移动、回车选中，表情插到输入框光标处，
//    面板收起、光标回到输入框表情后面；鼠标点选同样插入，悬浮窗不会因此关掉。
// ② 完整 Markdown：调试页的评论列表与悬浮窗消息流里，标题、引用、删除线、表格、图片都显示；javascript: 图片不出现；
//    原始 HTML 只显示成文字；图片懒加载、悬浮窗里更矮；点图片放大，放大后悬浮窗不关。
// 只在输入框里打字，不提交，不写日常库。需要先运行 pnpm dev（WEB_URL 可改地址）。
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9470 });
// 不在屏幕里才滚过去，再等两帧量位置（悬浮窗跟着按钮定位，页面一滚它下一帧才挪过去）
const point = (selector) => browser.evaluate(`(async () => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.checkVisibility()); if (!el) return null; el.scrollIntoView({ block: "nearest" }); for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
const click = async (selector) => {
  const at = await point(selector);
  assert.ok(at, `找不到 ${selector}`);
  const [x, y] = at;
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
};
const keyCodes = { ArrowRight: 39, ArrowDown: 40, Enter: 13 };
const press = async (key) => {
  const extra = key === "Enter" ? { text: "\r" } : {};
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: keyCodes[key], ...extra });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: keyCodes[key] });
};
// 往 selector 对应的输入框里输入 text，再把光标放到第 caret 个字符处
const typeInto = async (selector, text, caret) => {
  await click(selector);
  await browser.send("Input.insertText", { text });
  await browser.evaluate(`(() => { const ta = document.activeElement; ta.setSelectionRange(${caret}, ${caret}); })()`);
};
const textareaState = (selector) => browser.evaluate(`(() => { const ta = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.checkVisibility()); return { value: ta.value, caret: ta.selectionStart, focused: document.activeElement === ta }; })()`);

try {
  await browser.setViewport(1920, 991);

  // —— ① 文末评论表单：键盘选表情 ——
  await browser.goto(`${base}/timeline/posts`, 3000);
  const post = await browser.evaluate(`document.querySelector(".timeline-list a").getAttribute("href")`);
  await browser.goto(base + post);
  const bottom = "#comments > .comment-form textarea";
  assert.ok(await point(bottom), "文末应当有评论表单（这篇文章需开放评论）");
  assert.ok(await point("#comments > .comment-form .comment-markdown-hint"), "文末表单应当有“支持 Markdown”提示");
  await typeInto(bottom, "ab", 1);
  await click("#comments > .comment-form .emoji-trigger");
  await sleep(400);
  const opened = await browser.evaluate(`({ open: !!document.querySelector(".emoji-popup"), focus: document.activeElement?.className, first: document.querySelector(".emoji-cell")?.textContent, groups: document.querySelectorAll(".emoji-popup [role=group]").length })`);
  assert.ok(opened.open, "点表情按钮应当弹出表情面板");
  assert.equal(opened.focus, "emoji-cell", `打开后焦点应当在第一个表情上：${opened.focus}`);
  assert.ok(opened.groups >= 5, `表情应当按组排：${opened.groups} 组`);
  const second = await browser.evaluate(`document.querySelectorAll(".emoji-cell")[1].textContent`);
  await press("ArrowRight");
  await sleep(100);
  assert.equal(await browser.evaluate("document.activeElement.textContent"), second, "→ 应当移到下一个表情");
  await press("Enter");
  await sleep(500);
  const afterKey = await textareaState(bottom);
  assert.equal(afterKey.value, `a${second}b`, `表情应当插到光标处：${afterKey.value}`);
  assert.ok(afterKey.focused, "选完表情焦点应当回到输入框");
  assert.equal(afterKey.caret, 1 + second.length, `光标应当在插入的表情后面：${afterKey.caret}`);
  assert.equal(await browser.evaluate(`!!document.querySelector(".emoji-popup")`), false, "选完表情面板应当收起");
  // ↓ 跳到下一行同一列
  await click("#comments > .comment-form .emoji-trigger");
  await sleep(400);
  await press("ArrowDown");
  const below = await browser.evaluate(`(() => { const cells = [...document.querySelectorAll(".emoji-cell")]; const a = cells[0].getBoundingClientRect(), b = document.activeElement.getBoundingClientRect(); return { dx: Math.abs(a.left - b.left), dy: b.top - a.top }; })()`);
  assert.ok(below.dx < 2 && below.dy > 10, `↓ 应当移到下一行同一列：${JSON.stringify(below)}`);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(400);
  assert.equal(await browser.evaluate(`!!document.querySelector(".emoji-popup")`), false, "Esc 应当收起表情面板");

  // —— ① 悬浮窗：鼠标点选表情，悬浮窗不关 ——
  await browser.goto(`${base}/debug`);
  await click(".debug-chat .article-action");
  await sleep(600);
  const chat = ".chat-popup textarea";
  await typeInto(chat, "晚安", 2);
  await click(".chat-popup .emoji-trigger");
  await sleep(400);
  const moon = await browser.evaluate(`[...document.querySelectorAll(".emoji-cell")].find((b) => b.textContent === "🌙") ? "🌙" : null`);
  assert.ok(moon, "表情面板里应当有夜空一组的 🌙");
  await click('.emoji-cell:nth-child(1)');
  await sleep(500);
  const inChat = await textareaState(chat);
  const first = opened.first;
  assert.equal(inChat.value, `晚安${first}`, `悬浮窗里点选的表情应当插到光标处：${inChat.value}`);
  assert.ok(inChat.focused, "点选后焦点应当回到悬浮窗的输入框");
  assert.ok(await browser.evaluate(`!!document.querySelector(".chat-popup")`), "在表情面板里点选不应当关掉悬浮窗");
  assert.ok(await point(".chat-popup .comment-markdown-hint"), "悬浮窗也应当有“支持 Markdown”提示");

  // —— ② 完整 Markdown：文末评论列表（调试页示例） ——
  await browser.evaluate(`document.querySelector(".debug-comments").scrollIntoView({ block: "center" })`);
  await sleep(1500);
  const list = await browser.evaluate(`(() => {
    const box = [...document.querySelectorAll(".debug-comments .comment-text")].find((el) => el.querySelector("table"));
    const img = box?.querySelector(".comment-zoom img");
    return box && {
      heading: box.querySelector(".comment-heading")?.tagName,
      table: box.querySelectorAll("td").length,
      del: !!box.querySelector("del"), quote: !!box.querySelector("blockquote"),
      link: box.querySelector("a")?.rel, target: box.querySelector("a")?.target,
      rawB: box.querySelectorAll("b").length, rawText: box.textContent.includes("<b>"),
      imgs: box.querySelectorAll("img").length, src: img?.getAttribute("src"), lazy: img?.loading, loaded: img?.complete && img.naturalWidth > 0,
      height: img?.getBoundingClientRect().height,
    };
  })()`);
  assert.ok(list, "调试页评论列表里应当有带表格的示例评论");
  assert.equal(list.heading, "H4", `## 标题应当降两级成 h4：${list.heading}`);
  assert.ok(list.table >= 2 && list.del && list.quote, `表格、删除线、引用都应当显示：${JSON.stringify(list)}`);
  assert.equal(list.link, "noopener noreferrer nofollow ugc");
  assert.equal(list.target, "_blank");
  assert.ok(list.rawB === 0 && list.rawText, "原始 HTML 不应当变成元素，应当原样显示成文字");
  assert.equal(list.imgs, 1, "只应当显示 http(s) 图片，javascript: 的去掉");
  assert.match(list.src, /^https?:\/\//);
  assert.equal(list.lazy, "lazy");
  assert.ok(list.loaded, "评论里的图片应当加载出来");
  assert.ok(list.height <= 320.5, `文末评论图片应当限高 20rem：${list.height}`);
  await click(".debug-comments .comment-zoom");
  await sleep(600);
  assert.ok(await browser.evaluate(`!!document.querySelector(".lightbox-image")`), "点评论图片应当放大");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(600);
  assert.equal(await browser.evaluate(`!!document.querySelector(".lightbox-image")`), false, "Esc 应当关掉放大");

  // —— ② 悬浮窗消息流 ——
  await click(".debug-chat .article-action");
  await sleep(800);
  await browser.evaluate(`(() => { const img = document.querySelector(".chat-popup .comment-zoom"); img?.scrollIntoView({ block: "center" }); })()`);
  await sleep(1200);
  const bubble = await browser.evaluate(`(() => {
    const img = document.querySelector(".chat-popup .comment-zoom img");
    return { table: !!document.querySelector(".chat-popup .chat-text table"), height: img?.getBoundingClientRect().height ?? -1, loaded: img?.complete && img.naturalWidth > 0 };
  })()`);
  assert.ok(bubble.table, "悬浮窗消息里的表格应当显示");
  assert.ok(bubble.loaded && bubble.height > 0 && bubble.height <= 144.5, `悬浮窗里的图片应当显示并限高 9rem：${JSON.stringify(bubble)}`);
  await click(".chat-popup .comment-zoom");
  await sleep(600);
  const zoomed = await browser.evaluate(`({ lightbox: !!document.querySelector(".lightbox-image"), chat: !!document.querySelector(".chat-popup") })`);
  assert.ok(zoomed.lightbox && zoomed.chat, `悬浮窗里点图片应当放大且悬浮窗不关：${JSON.stringify(zoomed)}`);
  await click(".lightbox");
  await sleep(600);
  const closed = await browser.evaluate(`({ lightbox: !!document.querySelector(".lightbox-image"), chat: !!document.querySelector(".chat-popup") })`);
  assert.ok(!closed.lightbox && closed.chat, `关掉放大后悬浮窗应当还在：${JSON.stringify(closed)}`);

  assert.deepEqual(browser.errors, [], `页面不应当报错：${browser.errors.join("\n")}`);
  console.log("PASS comment emoji picker inserts at caret in both forms; full Markdown with images and tables in the list and the chat");
} finally {
  await browser.close();
}
