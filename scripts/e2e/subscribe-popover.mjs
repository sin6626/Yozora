// 浏览器回归测试：邮件订阅浮层（components/subscribe-popover.tsx、subscribe-form.tsx，样式在 subscribe-popover.css、details-sidebar.css）。
// 2026-11-02 用户嫌原来的样子“slop”（渐变信封图标、大标题加分隔线、带对勾的胶囊、整行大按钮），重做成：一行小标题、
// 一句文楷写的话（“文章”“手记”嵌在句子里，点掉后划去）、一条信纸横线写邮箱（末端是寄出的箭头）、一行小字 RSS。
// 只测不会写库的路径：两个都点掉再寄出会在发请求前被拦下。需要先运行 pnpm dev，且后台开启了邮件订阅。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9384 });
const click = async (selector) => {
  const point = await browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
};

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`, 4500);
  await click(".site-action.is-subscribe");
  await sleep(500);
  const look = await browser.evaluate(`(() => {
    const popup = document.querySelector(".site-action-popup");
    const words = [...popup.querySelectorAll(".subscribe-word")];
    return {
      old: popup.querySelectorAll(".subscribe-icon, .subscribe-type, .subscribe-submit, .subscribe-hint").length,
      background: getComputedStyle(popup).backgroundImage,
      title: getComputedStyle(popup.querySelector(".subscribe-title")).fontSize,
      sentence: popup.querySelector(".subscribe-letter").textContent,
      font: getComputedStyle(popup.querySelector(".subscribe-letter")).fontFamily,
      words: words.map((word) => word.textContent),
      line: getComputedStyle(popup.querySelector(".subscribe-email")).borderTopStyle,
      send: Boolean(popup.querySelector(".subscribe-send svg")),
      rss: popup.querySelector(".subscribe-rss a")?.getAttribute("href"),
      focused: document.activeElement?.classList.contains("subscribe-email"),
    };
  })()`);
  assert.equal(look.old, 0, "没有渐变图标、对勾胶囊、整行大按钮");
  assert.equal(look.background, "none", "浮层不铺渐变");
  assert.equal(look.title, "12px", "标题是一行小字");
  assert.equal(look.sentence, "有新的文章和手记时，我会写一封信告诉你。", "一句话，文章在前、手记在后");
  assert.ok(look.font.includes("LXGW WenKai"), "这句话用霞鹜文楷");
  assert.deepEqual(look.words, ["文章", "手记"]);
  assert.equal(look.line, "none", "邮箱没有框，只有底下一条线");
  assert.ok(look.send && look.rss === "/feed.xml", "横线末端是寄出的箭头，下面是 RSS");
  assert.ok(look.focused, "打开时光标在邮箱里");

  // 点掉“手记”：变淡、划去；两个都点掉后寄出，在发请求前提示至少选一种（不写库）
  await click(".subscribe-word:nth-of-type(2)");
  await sleep(200);
  const off = await browser.evaluate(`(() => { const word = document.querySelectorAll(".subscribe-word")[1]; return { checked: word.querySelector("input").checked, line: getComputedStyle(word).textDecorationLine }; })()`);
  assert.deepEqual(off, { checked: false, line: "line-through" }, "点掉的那个划去");
  await click(".subscribe-word:nth-of-type(1)");
  await browser.evaluate(`document.querySelector(".subscribe-email").value = "nobody@example.com"`);
  await click(".subscribe-send");
  await sleep(300);
  assert.equal(await browser.evaluate(`document.querySelector(".subscribe-status.is-error")?.textContent`), "至少选一种订阅内容。", "两个都点掉时提示至少选一种");
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".subscribe-rss"))`), false, "提示出现时 RSS 那行让位");

  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(400);
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".site-action-popup"))`), false, "Esc 关上浮层");

  // 英文页面：句子跟着语言换，单词仍嵌在句子里
  await browser.goto(`${base}/en`, 4500);
  await click(".site-action.is-subscribe");
  await sleep(500);
  assert.equal(await browser.evaluate(`document.querySelector(".subscribe-letter").textContent`), "When a new post or note goes up, I’ll write you a letter.");

  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log("PASS 订阅浮层：无渐变图标胶囊大按钮、小标题、文楷一句话（文章在前）、横线邮箱 + 箭头、RSS、打开聚焦邮箱、点掉划去、都点掉拦下不写库、Esc 关闭、英文句子");
} finally {
  await browser.close();
}
