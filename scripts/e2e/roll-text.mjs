// 浏览器回归测试：文字链接的逐字翻滚（2026-11-09 站长给的参考录屏：鼠标移上链接，每个字往上滚出、同一个字从下面滚进来，
// 从左到右依次错开）。用在页脚小链接（时间线、友链、RSS、源码）和导航面板底栏（查看全部 →、跃迁 ↗），两处一样的效果。
// 检查：① 链接文字还是原来的字（innerText、读屏名字都不变，翻滚用的那份是 CSS 生成的、读屏不念）；
// ② 真实鼠标移上去，每个字往上滚了一整行，后面的字比前面的晚开始；移开滚回；③ 导航面板底栏停在右边说明上也翻滚（整行是链接）；
// ④ 键盘聚焦也翻滚；⑤ 减少动态效果时不翻滚。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9484 });
const move = (x, y) => browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });

// 某个链接里每个字现在滚了多少（相对一行的高度，-1 = 整行滚上去了）和各自的开始延迟
const rollOf = (selector) => browser.evaluate(`(() => {
  const link = ${selector};
  const glyphs = [...link.querySelectorAll(".roll-glyph")];
  return {
    text: link.innerText.replace(/\\s+/g, " ").trim(),
    name: link.getAttribute("aria-label"),
    chars: glyphs.map((g) => g.dataset.char).join(""),
    shift: glyphs.map((g) => { const m = new DOMMatrix(getComputedStyle(g).transform); return Math.round((m.m42 / g.parentElement.getBoundingClientRect().height) * 100) / 100; }),
    delays: glyphs.map((g) => parseFloat(getComputedStyle(g).transitionDelay)),
  };
})()`);

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/posts`);
  await sleep(2500);

  // 页脚：滚到底，鼠标先停在空白处
  const footerLink = (label) => `[...document.querySelectorAll(".site-footer-links a")].find((a) => a.innerText.trim() === ${JSON.stringify(label)})`;
  await browser.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(500);
  for (const label of ["时间线", "友链", "RSS", "源码"]) {
    const before = await rollOf(footerLink(label));
    assert.equal(before.text, label, `页脚“${label}”的文字不变`);
    assert.equal(before.chars, label, `页脚“${label}”逐字拆开`);
    assert.equal(before.name, label, `页脚“${label}”读屏名字还是原文`);
    assert.ok(before.shift.every((s) => s === 0), `没悬停时“${label}”不翻滚`);
  }
  const [x, y] = await browser.evaluate(`(() => { const r = ${footerLink("时间线")}.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await move(x, y);
  await sleep(700);
  const hovered = await rollOf(footerLink("时间线"));
  assert.ok(hovered.shift.every((s) => s <= -0.99), `悬停后每个字都往上滚一整行：${hovered.shift}`);
  assert.ok(hovered.delays.every((d, i) => i === 0 || d > hovered.delays[i - 1]), `后面的字比前面的晚开始：${hovered.delays}`);
  await move(x, y - 200);
  await sleep(700);
  assert.ok((await rollOf(footerLink("时间线"))).shift.every((s) => s === 0), "移开后滚回原位");

  // 键盘聚焦也翻滚
  await browser.evaluate(`document.body.focus()`);
  await browser.evaluate(`${footerLink("友链")}.focus({ focusVisible: true })`);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift" });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift" });
  await sleep(700);
  const focused = await browser.evaluate(`${footerLink("友链")}.matches(":focus-visible")`);
  if (focused) assert.ok((await rollOf(footerLink("友链"))).shift.every((s) => s <= -0.99), "键盘聚焦时也翻滚");
  await browser.evaluate(`document.activeElement.blur()`);

  // 导航面板底栏：鼠标停在最右边的说明上，左边的“查看全部文章”翻滚，箭头和说明不动
  await browser.evaluate(`window.scrollTo(0, 0)`);
  await sleep(400);
  const [tx, ty] = await browser.evaluate(`(() => { const t = [...document.querySelectorAll(".navigation-List .navigation-Trigger")].find((t) => t.textContent.trim().startsWith("文章")); const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await move(tx, ty + 80);
  await sleep(400);
  await move(tx, ty);
  await sleep(900);
  const footer = `document.querySelector(".navigation-Popup .nav-panel.is-posts .nav-panel-footer a")`;
  const [fx, fy] = await browser.evaluate(`(() => { const r = ${footer}.getBoundingClientRect(); return [r.right - 6, r.bottom - 8]; })()`);
  await move(fx, fy);
  await sleep(700);
  const panel = await rollOf(footer);
  assert.ok(panel.chars.length >= 2 && panel.shift.every((s) => s <= -0.99), `停在面板底栏右端，左边的文字翻滚：${panel.chars} ${panel.shift}`);
  assert.ok(panel.name?.startsWith(panel.chars), `面板底栏读屏名字以原文开头：${panel.name}`);
  assert.equal(await browser.evaluate(`${footer}.querySelectorAll(".nav-panel-more-aside .roll-glyph, svg .roll-glyph").length`), 0, "右边说明和箭头不翻滚");

  // 减少动态效果：悬停只变色，不翻滚
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await move(10, 500);
  await browser.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(500);
  const [rx, ry] = await browser.evaluate(`(() => { const r = ${footerLink("RSS")}.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await move(rx, ry);
  await sleep(600);
  assert.ok((await rollOf(footerLink("RSS"))).shift.every((s) => s === 0), "减少动态效果时不翻滚");

  console.log("PASS 页脚链接与导航面板底栏逐字翻滚：文字和读屏名字不变、依次错开、移开滚回、键盘聚焦也翻、减少动态效果不翻");
} finally {
  browser.close();
}
