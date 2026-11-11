// 浏览器回归测试：后台手记编辑器的正文用思源宋体（2026-10-29），加粗要看得出来（2026-11-11）。
// 曾经的问题：
// ① Haklex 手记主题只写了字体名、不加载字体文件，电脑没装思源宋体时落到系统宋体（Songti SC），
//    它自带的英文数字比汉字小、悬在基线上方，中英混排看着不在一条线上。
// ② 加粗也是思源宋体：系统宋体只有常规和粗体两档，600 会落到很重的粗体；换成可变字重的思源宋体后 600 就是真的 600，
//    宋体笔画又细，加粗和正文几乎分不出来（站长截图）。现在手记的加粗换成黑体（主题自带的无衬线字体栈）。
// 后台编辑器要登录才能打开，所以用夹具页 apps/admin/test/note-font.html：走后台同一套 Vite 管线，
// 加载 Haklex 样式和 note-serif-font 模块，按手记主题和文章主题各排一段文字，再用编辑器的加粗类名各排一行。
// 检查：① 手记的字体栈以 Noto Serif SC Variable 开头，且中文、英文数字都真的由它渲染（字体切片已下载）；② 文章主题仍是苹方，不受影响；
// ③ 同一句话加粗后多出来的笔画（截图里亮像素的总量之比），手记不少于文章。
// 需要先运行 pnpm dev（后台默认 http://127.0.0.1:9528，可用 ADMIN_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { openBrowser } from "../headless-browser.mjs";

const sharp = createRequire(import.meta.url)("sharp");
const admin = process.env.ADMIN_URL ?? "http://127.0.0.1:9528";
const browser = await openBrowser({ port: 9341 });

// 夹具背景 #181818、字 #eee：亮像素越多，笔画越粗
async function ink(id) {
  const r = await browser.evaluate(`(async () => {
    const el = document.getElementById(${JSON.stringify(id)});
    await document.fonts.load(getComputedStyle(el).font, el.textContent);
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  })()`);
  const shot = await browser.send("Page.captureScreenshot", { format: "png", clip: { ...r, scale: 1 } });
  const { data, info } = await sharp(Buffer.from(shot.result.data, "base64")).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += Math.max(0, v - 0x18);
  return sum / (info.width * info.height);
}

try {
  await browser.setViewport(1100, 600, 2);
  await browser.goto(`${admin}/test/note-font.html`, 6000);
  const result = await browser.evaluate(`(async () => {
    await document.fonts.ready;
    const family = (id) => getComputedStyle(document.getElementById(id)).fontFamily;
    await Promise.all([document.fonts.load('18px "Noto Serif SC Variable"', '块'), document.fonts.load('18px "Noto Serif SC Variable"', 'AI 330')]);
    return {
      note: family("note"),
      article: family("article"),
      cjk: document.fonts.check('18px "Noto Serif SC Variable"', '块钱'),
      latin: document.fonts.check('18px "Noto Serif SC Variable"', 'AI Grok 330'),
    };
  })()`);
  assert.match(result.note, /^"Noto Serif SC Variable"/, `手记字体栈没有以思源宋体开头：${result.note}`);
  assert.ok(result.cjk && result.latin, "思源宋体的中文或英文数字切片没有加载");
  assert.match(result.article, /^"PingFang SC"/, `文章主题的字体被改了：${result.article}`);

  const note = (await ink("note-bold")) / (await ink("note-regular"));
  const article = (await ink("article-bold")) / (await ink("article-regular"));
  assert.ok(article > 1.2, `文章主题的加粗没有变粗（${article.toFixed(2)}），夹具或截图有问题`);
  assert.ok(note >= article, `手记的加粗不如文章明显：加粗/正文笔画 手记 ${note.toFixed(2)}，文章 ${article.toFixed(2)}`);
  console.log(`admin-note-font: 通过（加粗/正文笔画 手记 ${note.toFixed(2)}，文章 ${article.toFixed(2)}）`);
} finally {
  browser.close();
}
