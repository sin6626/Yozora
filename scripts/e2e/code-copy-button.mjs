// 浏览器回归测试：富文本代码块的复制按钮在不同语言下长得一样（2026-11-09 站长截图：TypeScript 的是蓝底，Vue 的是灰底）。
// 原因：Haklex 按语言把 --rr-code-accent 写进每个代码块的行内样式，复制按钮的底色、描边取 80%/5% 这个颜色。
// 站点统一的按钮不该跟着语言变色，post-detail.css 的 .article-rich .rr-code-copy 改用站点变量。
// 用本地的“富文本组件对照”文章（TypeScript、JavaScript、JSON 三种语言），真实鼠标悬停每个代码块，深浅两种主题都比。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9481 });

async function copyLooks() {
  const cards = await browser.evaluate(`[...document.querySelectorAll(".article-rich .rr-code-card")].filter((card) => card.checkVisibility() && getComputedStyle(card).pointerEvents !== "none").length`);
  const looks = [];
  for (let i = 0; i < cards; i++) {
    const [x, y] = await browser.evaluate(`(() => {
      const card = [...document.querySelectorAll(".article-rich .rr-code-card")].filter((card) => card.checkVisibility() && getComputedStyle(card).pointerEvents !== "none")[${i}];
      card.scrollIntoView({ block: "center" });
      const r = card.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    })()`);
    await sleep(200);
    await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(400);
    looks.push(await browser.evaluate(`(() => {
      const card = [...document.querySelectorAll(".article-rich .rr-code-card")].filter((card) => card.checkVisibility() && getComputedStyle(card).pointerEvents !== "none")[${i}];
      const style = getComputedStyle(card.querySelector(".rr-code-copy"));
      return { accent: card.style.getPropertyValue("--rr-code-accent"), look: [style.backgroundColor, style.borderColor, style.color].join(" | "), opacity: style.opacity };
    })()`));
  }
  return looks;
}

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/posts/default/rich-text-components-20261014`);
  await browser.evaluate(`new Promise((done) => { const wait = () => document.querySelector(".article-rich .rr-code-copy") ? done() : setTimeout(wait, 100); wait(); })`);
  await sleep(2000); // 换页的入场动画放完再悬停

  for (const theme of ["dark", "light"]) {
    await browser.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    const looks = await copyLooks();
    assert.ok(new Set(looks.map((l) => l.accent)).size >= 2, `测试文章里要有至少两种语言的代码块：${looks.map((l) => l.accent).join(", ")}`);
    assert.ok(looks.every((l) => Number(l.opacity) > 0.9), `悬停后复制按钮要显示出来（${theme}）：${looks.map((l) => l.opacity).join(", ")}`);
    assert.equal(new Set(looks.map((l) => l.look)).size, 1, `不同语言的复制按钮样式不一样（${theme}）：\n${looks.map((l) => `${l.accent} → ${l.look}`).join("\n")}`);
  }
  console.log("PASS 三种语言的代码块复制按钮在深浅两种主题下样式一致");
} finally {
  browser.close();
}
