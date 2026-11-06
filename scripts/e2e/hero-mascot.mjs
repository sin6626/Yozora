// 浏览器回归测试：首屏“丛雨抱着 Sin”（2026-10-28）。
// 检查：① 后层、闭眼帧、前层三张图都加载了，并且叠在完全相同的位置（错开一点手就不在字上）；
// ② 层叠顺序是 后层 < 文字 < 前层；③ 闭眼帧在播眨眼动画；
// ④ 桌面上图不盖住旁边的“是”和“。”（名字整层画在普通文字之上，边距不够时句号曾被头发盖住）；
// ⑤ 手机上“Sin。”一起换到第二行，丛雨的头不碰上一行的“你好，我是”（曾经头发盖住“好，”，句号单独掉到下一行）。
// 前提：配置片段 theme/yozora 填了 hero.mascot（三层图在图床上）；没填时首页没有角色，这个测试会失败。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9339 });

const measure = `(async () => {
  const name = document.querySelector(".home-hero-name");
  const layers = ["back", "blink", "front"].map((layer) => name.querySelector(".is-" + layer));
  await Promise.all(layers.map((img) => img.decode().catch(() => {})));
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  // 文字本身的范围（不含 line-height 撑出来的行高）
  const textRect = (el) => { const range = document.createRange(); range.selectNodeContents(el); return rect(range); };
  const [hello, period] = [name.closest("h1").firstElementChild, name.nextElementSibling];
  return {
    loaded: layers.map((img) => img.complete && img.naturalWidth > 0),
    // 后层在做呼吸缩放，比较不受 transform 影响的布局位置
    boxes: layers.map((img) => [img.offsetLeft, img.offsetTop, img.offsetWidth, img.offsetHeight]),
    zIndex: layers.map((img) => Number(getComputedStyle(img).zIndex)),
    blinking: layers[1].getAnimations().some((a) => a.animationName === "home-hero-blink"),
    image: rect(layers[0]),
    hello: textRect(hello),
    period: textRect(period),
  };
})()`;

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`);
  const desktop = await browser.evaluate(measure);
  assert.deepEqual(desktop.loaded, [true, true, true], "三层图没有全部加载");
  for (const box of desktop.boxes.slice(1)) assert.deepEqual(box, desktop.boxes[0], "三层图没有叠在同一位置");
  const [back, blink, front] = desktop.zIndex;
  assert.ok(back < 0 && blink < 0 && front > 0, `层叠顺序不对：${desktop.zIndex.join(", ")}`);
  assert.ok(desktop.blinking, "闭眼帧没有眨眼动画");
  assert.ok(desktop.image.left >= desktop.hello.right - 1, `图盖住了“是”：图左 ${desktop.image.left}，文字右 ${desktop.hello.right}`);
  assert.ok(desktop.image.right <= desktop.period.left + 1, `图盖住了“。”：图右 ${desktop.image.right}，句号左 ${desktop.period.left}`);

  // 问候和名字是两个 inline-block，间距靠名字的外边距撑开；英文要有真正的空格，读屏和复制才是 “I'm Sin”，不是 “I'mSin”
  const firstLine = `(() => { const h1 = document.querySelector(".home-hero-title"); let text = ""; for (const node of h1.childNodes) { if (node.nodeName === "BR") break; text += node.textContent; } return text.replace(/\\s+/g, " ").trim(); })()`;
  assert.equal(await browser.evaluate(firstLine), "你好，我是Sin。", "中文问候和名字之间不该有空格");
  await browser.goto(`${base}/en`);
  assert.equal(await browser.evaluate(firstLine), "Hi, I'm Sin.", "英文问候和名字之间少了空格");
  const english = await browser.evaluate(measure);
  assert.ok(english.image.left >= english.hello.right - 1, `英文页图盖住了问候：图左 ${english.image.left}，文字右 ${english.hello.right}`);

  await browser.setViewport(390, 844);
  await browser.goto(`${base}/`);
  const mobile = await browser.evaluate(measure);
  assert.ok(mobile.period.top >= mobile.hello.bottom, "手机上“。”没有和“Sin”一起换行");
  assert.ok(mobile.image.top >= mobile.hello.bottom - 1, `手机上丛雨盖住了上一行：图顶 ${mobile.image.top}，文字底 ${mobile.hello.bottom}`);
  console.log("hero-mascot: 通过");
} finally {
  browser.close();
}
