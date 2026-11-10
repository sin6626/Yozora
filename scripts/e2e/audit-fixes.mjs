// 浏览器回归测试：2026-11-10 上线前审查里站长看过截图、要求修的五处（截图说明 .local/previews/audit-explain/）。
// ① 文章开头的过期提示不再是一个带描边、底色的盒子（原来和 AI 摘要、正文引用三种盒子摞在一起），只是一行淡色小字；
// ② 富文本里的“原生 CodeNode”代码块有内边距，文字离左边框的距离和普通代码块一样（原来字贴着边框）；
// ③ 手机上页面标题和下面正文左边对齐（原来标题缩进 24px、正文 16px）；
// ④ 一言页标题下有一句提示，告诉读者把鼠标移到星星上（触屏是点一颗星）；
// ⑤ 浅色主题下首页技术栈用浅色版图标（skill-icons 的 -light），深色主题仍用 -dark。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9490 });
const wait = (selector, timeout = 15000) => browser.evaluate(`new Promise((done, fail) => { const end = Date.now() + ${timeout}; const tick = () => document.querySelector(${JSON.stringify(selector)}) ? done(true) : Date.now() > end ? fail(new Error("没等到 " + ${JSON.stringify(selector)})) : setTimeout(tick, 100); tick(); })`);

try {
  await browser.setViewport(1920, 991);

  // ① 过期提示是一行字，不是盒子
  await browser.goto(`${base}/posts/study%26think/zod`);
  await wait(".post-outdated");
  const outdated = await browser.evaluate(`(() => { const s = getComputedStyle(document.querySelector(".post-outdated")); return { border: s.borderTopWidth, bg: s.backgroundColor, pad: s.paddingLeft }; })()`);
  assert.equal(outdated.border, "0px", "过期提示没有描边");
  assert.match(outdated.bg, /rgba\(0, 0, 0, 0\)|transparent/, `过期提示没有底色：${outdated.bg}`);
  assert.equal(outdated.pad, "0px", "过期提示没有内边距（和正文左边对齐）");

  // ② 原生 CodeNode 的文字离左边框的距离和普通代码块一样
  await browser.goto(`${base}/posts/default/rich-text-components-20261014`);
  await wait(".article-rich pre.rich-code-block");
  await sleep(1500);
  const inset = await browser.evaluate(`(() => {
    const left = (box) => { const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent.trim() ? 1 : 3 }); const text = walker.nextNode(); const range = document.createRange(); range.setStart(text, text.textContent.search(/\\S/)); range.setEnd(text, text.textContent.search(/\\S/) + 1); return range.getBoundingClientRect().left - box.getBoundingClientRect().left; };
    const native = document.querySelector(".article-rich pre.rich-code-block");
    const card = [...document.querySelectorAll(".article-rich .rr-code-card")].find((c) => c.checkVisibility() && getComputedStyle(c).pointerEvents !== "none");
    return { native: Math.round(left(native)), card: Math.round(left(card.querySelector(".rr-code-body") ?? card)) };
  })()`);
  assert.ok(inset.native >= 12, `原生 CodeNode 文字不贴边框：${inset.native}px`);
  assert.ok(Math.abs(inset.native - inset.card) <= 4, `原生 CodeNode 和普通代码块的文字缩进一致：${inset.native} / ${inset.card}`);

  // ④ 一言页的提示（桌面是“把鼠标移到星星上”）
  await browser.goto(`${base}/says`);
  await wait(".says-hint");
  const hint = await browser.evaluate(`[...document.querySelectorAll(".says-hint")].filter((el) => el.checkVisibility()).map((el) => el.textContent.trim())`);
  assert.equal(hint.length, 1, `桌面只显示一种提示：${hint}`);
  assert.match(hint[0], /鼠标/, `桌面提示说鼠标：${hint[0]}`);

  // ⑤ 浅色主题下技术栈用 -light 图标，深色用 -dark
  await browser.goto(`${base}/`);
  await wait(".stack-track li");
  const stackIcons = (theme) => browser.evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return [...document.querySelector(".stack-track").children].slice(0, 20).map((li) => [...li.querySelectorAll("[data-icon]")].filter((el) => el.checkVisibility()).map((el) => el.dataset.icon)).flat(); })()`);
  const light = await stackIcons("light");
  // 浅色版图标里的渐变不能指向被藏起来的 -dark 那份（两份 id 相同时 url(#a) 落到第一份，藏起来就画成空白方块）
  const brokenRefs = await browser.evaluate(`[...document.querySelectorAll(".stack-track [data-icon]")].filter((svg) => svg.checkVisibility()).flatMap((svg) => [...svg.innerHTML.matchAll(/url\\(#([^)]+)\\)/g)].map((m) => m[1]).filter((id) => { const target = document.getElementById(id); return !target || !target.closest("svg").checkVisibility(); }).map((id) => svg.dataset.icon + " → " + id))`);
  assert.deepEqual([...new Set(brokenRefs)], [], "浅色主题下看得见的图标，渐变都指向看得见的那份");
  const dark = await stackIcons("dark");
  assert.ok(light.length > 0 && light.every((icon) => !icon.endsWith("-dark")), `浅色主题没有 -dark 图标：${light.filter((i) => i.endsWith("-dark"))}`);
  assert.ok(light.some((icon) => icon.endsWith("-light")), "浅色主题用上了 -light 图标");
  assert.ok(dark.some((icon) => icon.endsWith("-dark")) && dark.every((icon) => !icon.endsWith("-light")), "深色主题仍用 -dark 图标");

  // ③ 手机上标题和正文左边对齐；④ 触屏提示说“点”
  await browser.setViewport(390, 844);
  for (const path of ["/friends", "/murmurs", "/posts", "/notes"]) {
    await browser.goto(`${base}${path}`);
    await wait(".page-heading h1");
    await sleep(800);
    const align = await browser.evaluate(`(() => { const h1 = document.querySelector(".page-heading h1").getBoundingClientRect().left; const content = document.querySelector(".post-list-content"); const s = getComputedStyle(content); return { h1: Math.round(h1), content: Math.round(content.getBoundingClientRect().left + parseFloat(s.paddingLeft)) }; })()`);
    assert.equal(align.h1, align.content, `手机 ${path} 标题和正文左边对齐：${align.h1} / ${align.content}`);
  }
  await browser.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
  await browser.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await browser.goto(`${base}/says`);
  await wait(".says-hint");
  const touchHint = await browser.evaluate(`[...document.querySelectorAll(".says-hint")].filter((el) => el.checkVisibility()).map((el) => el.textContent.trim())`);
  assert.equal(touchHint.length, 1, `触屏只显示一种提示：${touchHint}`);
  assert.match(touchHint[0], /点/, `触屏提示说点一颗星：${touchHint[0]}`);

  console.log("PASS 审查五处：过期提示是一行字、原生代码块有内边距、手机标题对齐、一言页有提示、浅色技术栈用浅色图标");
} finally {
  browser.close();
}
