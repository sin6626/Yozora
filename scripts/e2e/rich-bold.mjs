// 浏览器回归测试：博客手记的加粗要看得出来（2026-11-11）。
// 曾经的问题：手记正文和加粗都是思源宋体，宋体加粗笔画还是细（可变字重下 600 就真是 600），和正文几乎分不出来
// （站长在后台写手记时发现，前台同一套主题同样如此；后台的检查在 admin-note-font.mjs）。现在手记的加粗换成黑体。
// 用 /debug 的“富文本加粗”示例（真实 article-body，同一句话一段正文、一段加粗；手记富文本、手记 Markdown、文章富文本各一份），
// 截图数两行的亮像素（默认熄灯，字比底色亮），比较“加粗/正文”之比：手记不少于文章。截图前藏起背景星空，免得星星算进笔画。
// 需要先运行 pnpm dev。用法：node scripts/e2e/rich-bold.mjs（WEB_URL 可改地址）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { openBrowser } from "../headless-browser.mjs";

const sharp = createRequire(import.meta.url)("sharp");
const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9448 });

// 第 n 段文字的紧贴边框（整页坐标），并等它用到的字重切片下载完
async function textBox(sample, n) {
  return browser.evaluate(`(async () => {
    const p = document.querySelectorAll('#debug-rich-bold [data-sample="${sample}"]  p')[${n}];
    const text = p.querySelector('[data-lexical-text], span') ?? p;
    await document.fonts.load(getComputedStyle(text).font, p.textContent);
    const range = document.createRange();
    range.selectNodeContents(p);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x: x + scrollX, y: y + scrollY, width, height, font: getComputedStyle(text).fontFamily, weight: getComputedStyle(text).fontWeight };
  })()`);
}

async function ink(box) {
  const shot = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
  const { data, info } = await sharp(Buffer.from(shot.result.data, "base64")).greyscale().raw().toBuffer({ resolveWithObject: true });
  const sorted = [...data].sort((a, b) => a - b);
  const background = sorted[Math.floor(sorted.length / 2)];
  let sum = 0;
  for (const v of data) sum += Math.max(0, v - background);
  return sum / (info.width * info.height);
}

try {
  await browser.setViewport(1920, 991, 2);
  await browser.goto(`${web}/debug`, 6000);
  await browser.evaluate(`(() => {
    document.querySelector('.starfield')?.style.setProperty('visibility', 'hidden');
    document.getElementById('debug-rich-bold').scrollIntoView({ block: 'center' });
  })()`);
  const ratio = {};
  for (const sample of ["note", "note-markdown", "article"]) {
    const regular = await textBox(sample, 1);
    const bold = await textBox(sample, 2);
    assert.ok(regular.width > 100 && bold.width > 100, `${sample} 示例没有渲染出来`);
    if (sample !== "article") assert.match(regular.font, /Noto Serif SC/, `${sample} 示例的正文没有用思源宋体：${regular.font}`);
    ratio[sample] = (await ink(bold)) / (await ink(regular));
  }
  assert.ok(ratio.article > 1.2, `文章主题的加粗没有变粗（${ratio.article.toFixed(2)}），示例或截图有问题`);
  const summary = Object.entries(ratio).map(([k, v]) => `${k} ${v.toFixed(2)}`).join("，");
  for (const sample of ["note", "note-markdown"]) assert.ok(ratio[sample] >= ratio.article, `${sample} 的加粗不如文章明显：加粗/正文笔画 ${summary}`);
  console.log(`rich-bold: 通过（加粗/正文笔画 ${summary}）`);
} finally {
  browser.close();
}
