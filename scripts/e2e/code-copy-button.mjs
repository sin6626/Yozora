// 浏览器回归测试：代码块的复制按钮全站一个样子（2026-11-09 站长截图）。
// ① 富文本：Haklex 按语言把 --rr-code-accent 写进每个代码块的行内样式，复制按钮跟着变色（TypeScript 蓝、Vue 灰），
//    post-detail.css 的 .article-rich .rr-code-copy 改用站点变量。用本地“富文本组件对照”文章（TypeScript、JavaScript、JSON），深浅两种主题都比。
//    嵌套文档预览里的代码块 Haklex 设了 pointer-events: none，不能悬停，跳过。
// ② Markdown 文章的代码块原来没有复制按钮（article-body.tsx）。现在有，颜色、大小、离右上角的距离和富文本的一样，
//    点了真的把代码写进剪贴板、按钮读屏文字变成“已复制”。用本地 Markdown 文章 zod（一段 TypeScript、一段没写语言）。
// ③ Markdown 代码块原来不显示语言（2026-11-10 站长截图）。现在写了语言的右下角有和富文本同一个语言图标（Haklex 的 LanguageIcon），
//    位置、大小、透明度一样（zod 的四段都写了 typescript）。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9481 });

// 每个能悬停的代码块：真实鼠标移到中间，读复制按钮的颜色、透明度和相对代码块右上角的位置
async function looksOf(card, button) {
  const pick = `[...document.querySelectorAll(${JSON.stringify(card)})].filter((card) => card.checkVisibility() && getComputedStyle(card).pointerEvents !== "none")`;
  const count = await browser.evaluate(`${pick}.length`);
  const looks = [];
  for (let i = 0; i < count; i++) {
    const [x, y] = await browser.evaluate(`(() => {
      const card = ${pick}[${i}];
      card.scrollIntoView({ block: "center" });
      const r = card.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    })()`);
    await sleep(200);
    await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(400);
    looks.push(await browser.evaluate(`(() => {
      const card = ${pick}[${i}];
      const button = card.querySelector(${JSON.stringify(button)});
      if (!button) return null;
      const style = getComputedStyle(button);
      const c = card.getBoundingClientRect(), b = button.getBoundingClientRect();
      return {
        accent: card.style.getPropertyValue("--rr-code-accent"),
        look: [style.backgroundColor, style.borderColor, style.color].join(" | "),
        box: [Math.round(c.right - b.right), Math.round(b.top - c.top), Math.round(b.width), Math.round(b.height)].join(" "),
        opacity: style.opacity,
      };
    })()`));
  }
  return looks;
}

const settle = (selector) => browser.evaluate(`new Promise((done) => { const wait = () => document.querySelector(${JSON.stringify(selector)}) ? done() : setTimeout(wait, 100); wait(); })`);

try {
  await browser.setViewport(1920, 991);
  await browser.send("Browser.grantPermissions", { origin: new URL(base).origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });

  await browser.goto(`${base}/posts/default/rich-text-components-20261014`);
  await settle(".article-rich .rr-code-copy");
  await sleep(2000); // 换页的入场动画放完再悬停
  const rich = {};
  for (const theme of ["dark", "light"]) {
    await browser.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    const looks = await looksOf(".article-rich .rr-code-card", ".rr-code-copy");
    assert.ok(new Set(looks.map((l) => l.accent)).size >= 2, `测试文章里要有至少两种语言的代码块：${looks.map((l) => l.accent).join(", ")}`);
    assert.ok(looks.every((l) => Number(l.opacity) > 0.9), `悬停后复制按钮要显示出来（${theme}）：${looks.map((l) => l.opacity).join(", ")}`);
    assert.equal(new Set(looks.map((l) => l.look)).size, 1, `不同语言的复制按钮样式不一样（${theme}）：\n${looks.map((l) => `${l.accent} → ${l.look}`).join("\n")}`);
    rich[theme] = looks[0];
  }

  // 语言图标：每个富文本代码块右下角，按语言记下图标和位置
  const langOf = (frame, marker) => `[...document.querySelectorAll(${JSON.stringify(frame)})].filter((f) => f.checkVisibility() && getComputedStyle(f).pointerEvents !== "none").map((f) => {
    const mark = f.querySelector(${JSON.stringify(marker)});
    if (!mark) return { code: f.querySelector("pre")?.textContent.slice(0, 30), mark: null };
    const c = f.getBoundingClientRect(), m = mark.getBoundingClientRect(), svg = mark.querySelector("svg");
    return { mark: svg?.innerHTML ?? mark.textContent, box: [Math.round(c.right - m.right), Math.round(c.bottom - m.bottom), Math.round(m.width), Math.round(m.height), getComputedStyle(mark).opacity].join(" ") };
  })`;
  const richLangs = await browser.evaluate(langOf(".article-rich .rr-code-card", ".rr-code-lang"));
  assert.ok(richLangs.length > 0 && richLangs.every((l) => l.mark), "富文本代码块都有语言图标");

  await browser.goto(`${base}/posts/study%26think/zod`);
  await settle(".article-body pre");
  await sleep(2000);
  for (const theme of ["dark", "light"]) {
    await browser.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    const looks = await looksOf(".article-body .code-frame", ".code-copy");
    assert.ok(looks.length >= 2, `Markdown 文章的代码块要包在带复制按钮的框里（找到 ${looks.length} 个）`);
    assert.ok(looks.every(Boolean), "每个 Markdown 代码块都有复制按钮（没写语言的也要有）");
    assert.ok(looks.every((l) => Number(l.opacity) > 0.9), `悬停后 Markdown 代码块的复制按钮要显示出来（${theme}）`);
    for (const l of looks) {
      assert.equal(l.look, rich[theme].look, `Markdown 与富文本的复制按钮颜色不一样（${theme}）`);
      assert.equal(l.box, rich[theme].box, `Markdown 与富文本的复制按钮大小或位置不一样（${theme}）：${l.box} / ${rich[theme].box}`);
    }
  }

  const mdLangs = await browser.evaluate(langOf(".article-body .code-frame", ".code-lang"));
  const labelled = mdLangs.filter((l) => l.mark);
  assert.ok(labelled.length >= 1, `写了语言的 Markdown 代码块要在右下角显示语言（${JSON.stringify(mdLangs.map((l) => l.code))}）`);
  const richTs = richLangs.find((l) => /0288d1/i.test(l.mark));
  assert.ok(richTs, "富文本对照文章里有 TypeScript 代码块");
  for (const l of labelled) {
    assert.equal(l.mark, richTs.mark, "Markdown 的 TypeScript 图标和富文本的同一个");
    assert.equal(l.box, richTs.box, `语言图标的位置、大小、透明度和富文本一样：${l.box} / ${richTs.box}`);
  }

  // 点第一个代码块的按钮：剪贴板里是这段代码，读屏文字变成“已复制”
  const target = await browser.evaluate(`(() => {
    const frame = [...document.querySelectorAll(".article-body .code-frame")].find((f) => f.checkVisibility());
    frame.scrollIntoView({ block: "center" });
    const b = frame.querySelector(".code-copy").getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, code: frame.querySelector("pre").textContent };
  })()`);
  await sleep(200);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x: target.x, y: target.y, button: "left", clickCount: 1 });
  await sleep(300);
  const after = await browser.evaluate(`(async () => ({ clipboard: await navigator.clipboard.readText(), label: [...document.querySelectorAll(".article-body .code-copy")].find((b) => b.checkVisibility()).getAttribute("aria-label") }))()`);
  assert.equal(after.clipboard, target.code.replace(/\n$/, ""), "复制到剪贴板的是这段代码");
  assert.equal(after.label, "已复制", "复制后按钮读屏文字变成“已复制”");

  console.log("PASS 富文本三种语言的复制按钮一致；Markdown 代码块有同款复制按钮，点了复制成功；写了语言的 Markdown 代码块右下角有和富文本同款的语言图标");
} finally {
  browser.close();
}
