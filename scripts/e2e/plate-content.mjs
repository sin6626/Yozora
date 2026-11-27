// 浏览器回归测试：Plate（@suzuri/editor）正文（2026-11-27 Suzuri 迁移阶段 2）。
// 直接往 Mongo 插几篇临时内容（不经 Core 接口，不发订阅邮件、不触发 AI），跑完删掉：
// 一篇全节点 Plate 文章、一篇 Plate 手记、一篇坏信封的 Plate 文章，以及 Markdown、Lexical 文章各一篇做回归。
// 检查：服务端渲染出 Suzuri 正文且没有控制台报错；标题带 id、目录能跳；代码块是站内 Shiki + 复制按钮；KaTeX 字体生效；
// 图片保留调过的宽度、点开放大；提示框按语气用站点颜色；实况图按住和点 LIVE 都能播；深浅主题都跟着站点变量走；
// 手记用衬线体；手机宽度不横向溢出；坏信封退回 Markdown、不报错；Markdown、Lexical 文章照旧。截图存 .local/previews/plate-content/。
// 隔离环境：node scripts/dev.mjs --test 后
//   WEB_URL=http://127.0.0.1:2523 MONGO_URL=mongodb://127.0.0.1:27029 MONGO_DB=sinpersonalspace-verify node scripts/e2e/plate-content.mjs
// 加 PLATE_E2E_KEEP=1 跑完不删，留给人工在浏览器里看（看完再不带它跑一次就删掉了）。
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { openBrowser, sleep } from "../headless-browser.mjs";

const { MongoClient } = createRequire(new URL("../../apps/core/package.json", import.meta.url))("mongodb");
const { createEnvelope, SUZURI_SAMPLE_DOCUMENT, toMarkdown } = await import(new URL("../../apps/web/node_modules/@suzuri/editor/dist/schema/index.js", import.meta.url));
const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const mongo = new MongoClient(process.env.MONGO_URL ?? "mongodb://127.0.0.1:27018", { directConnection: true });
const db = mongo.db(process.env.MONGO_DB ?? "shrio-import-20261014");
const shots = new URL("../../.local/previews/plate-content/", import.meta.url);
mkdirSync(shots, { recursive: true });

const cover = "/sample-media/live-cover.jpg";
const clip = "/sample-media/live-clip.mp4";
const document = {
  children: [
    ...SUZURI_SAMPLE_DOCUMENT.children.map((node) =>
      node.type === "livePhoto" ? { ...node, url: cover, videoUrl: clip } : node.type === "image" ? { ...node, url: cover } : node,
    ),
    { type: "heading", level: 2, children: [{ text: "中文标题" }] },
    { type: "paragraph", children: [{ text: "中文段落，" }, { text: "加粗", bold: true }, { text: "。" }] },
    { type: "callout", variant: "warning", icon: "⚠️", children: [{ text: "注意事项" }] },
    { type: "callout", variant: "tip", icon: "💡", children: [{ text: "小技巧" }] },
  ],
};
const envelope = createEnvelope(document);
const content = JSON.stringify(envelope);
const text = toMarkdown(envelope).markdown;
const broken = JSON.stringify({ ...envelope, document: { children: [{ type: "banner", children: [{ text: "x" }] }] } });
const lexical = JSON.stringify({ root: { type: "root", version: 1, format: "", indent: 0, direction: null, children: [{ type: "heading", tag: "h2", version: 1, format: "", indent: 0, direction: null, children: [{ type: "text", version: 1, text: "Lexical 标题", format: 0, detail: 0, mode: "normal", style: "" }] }] } });

await mongo.connect();
const category = await db.collection("categories").findOne({}, { sort: { _id: 1 } });
assert.ok(category, "库里要有分类");
const posts = db.collection("posts");
const notes = db.collection("notes");
const slugs = ["e2e-plate", "e2e-plate-broken", "e2e-markdown", "e2e-lexical"];
const nid = 990013;
const cleanup = async () => {
  await posts.deleteMany({ slug: { $in: slugs } });
  await notes.deleteOne({ nid });
};
await cleanup();
const now = new Date();
const post = (slug, title, extra) => ({
  slug, title, categoryId: category._id, isPublished: true, copyright: false, allowComment: true, commentsIndex: 0,
  tags: [], images: [], meta: null, count: { read: 0, like: 0 }, related: [], created: now, modified: null, summary: null, ...extra,
});
await posts.insertMany([
  post(slugs[0], "e2e Plate 全节点（测试会自动删除）", { contentFormat: "plate", content, text }),
  post(slugs[1], "e2e Plate 坏信封（测试会自动删除）", { contentFormat: "plate", content: broken, text: "## 兜底标题\n\n兜底正文。" }),
  post(slugs[2], "e2e Markdown（测试会自动删除）", { contentFormat: "markdown", text: "## Markdown 标题\n\n正文。" }),
  post(slugs[3], "e2e Lexical（测试会自动删除）", { contentFormat: "lexical", content: lexical, text: "## Lexical 标题" }),
]);
await notes.insertOne({
  nid, title: "e2e Plate 手记（测试会自动删除）", isPublished: true, allowComment: true, commentsIndex: 0, contentFormat: "plate", content, text,
  images: [], meta: null, mood: "平静", weather: "晴", topicId: null, count: { read: 0, like: 0 }, created: now, modified: null, publicAt: null, bookmark: false,
});

const postUrl = (slug) => `${base}/posts/${category.slug}/${slug}`;
const waitFor = async (browser, expression, ms = 20000) => {
  for (let t = 0; t < ms; t += 200) { if (await browser.evaluate(expression)) return true; await sleep(200); }
  return false;
};
const shot = async (browser, name) => {
  const { result } = await browser.send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  writeFileSync(new URL(`${name}.jpg`, shots), Buffer.from(result.data, "base64"));
};
const center = (selector) => `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
const mouse = (browser, type, { x, y }) => browser.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });

const browser = await openBrowser({ port: 9493 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(postUrl(slugs[0]), 4000);
  assert.ok(await waitFor(browser, `document.querySelector(".article-plate .suzuri-root")?.checkVisibility() === true`, 60000), "Plate 文章渲染出 Suzuri 正文");
  const page = await browser.evaluate(`(() => {
    const root = document.querySelector(".article-plate .suzuri-root");
    const style = (el) => el && getComputedStyle(el);
    const tones = Object.fromEntries([...document.querySelectorAll(".plate-callout")].map((el) => [el.dataset.tone, style(el).backgroundColor]));
    const img = document.querySelector(".plate-zoom img");
    return {
      headings: [...root.querySelectorAll("h1[id], h2[id], h3[id]")].map((h) => h.id),
      toc: [...document.querySelectorAll(".article-toc a")].map((a) => decodeURIComponent(a.getAttribute("href") ?? "")),
      shiki: Boolean(document.querySelector(".article-plate .code-frame .shiki")),
      copy: Boolean(document.querySelector(".article-plate .code-frame .code-copy")),
      katex: document.querySelectorAll(".article-plate .katex").length,
      katexFont: style(document.querySelector(".article-plate .katex"))?.fontFamily,
      tones,
      imageWidth: img?.closest("figure")?.querySelector(":scope > div")?.style.width,
      live: Boolean(document.querySelector(".plate-live video")),
      tableHeight: document.querySelector(".article-plate .editor-table table")?.getBoundingClientRect().height ?? 0,
      tableScroll: (() => { const box = document.querySelector(".article-plate .editor-table"); return [box.scrollWidth - box.clientWidth, box.scrollHeight - box.clientHeight]; })(),
      rootColor: style(root).color, bodyColor: style(document.body).color, rootBg: style(root).backgroundColor,
      bodyFont: style(root.querySelector(".editor-paragraph")).fontFamily, siteFont: style(document.body).fontFamily,
    };
  })()`);
  assert.ok(page.headings.includes("中文标题") && page.headings.length >= 5, `标题带 id：${page.headings}`);
  assert.ok(page.toc.includes("#中文标题"), `目录收了正文标题：${page.toc}`);
  assert.ok(page.shiki && page.copy, "代码块是站内 Shiki 高亮加复制按钮");
  assert.ok(page.katex >= 2 && page.katexFont.includes("KaTeX"), "行内与块级公式用 KaTeX 字体");
  assert.ok(page.tones.warning && page.tones.tip && page.tones.warning !== page.tones.tip, "不同语气的提示框颜色不同");
  assert.equal(page.imageWidth, "78%", "图片保留调过的宽度");
  assert.ok(page.live, "实况图有短片");
  assert.ok(page.tableHeight > 100, `表格要撑开、看得见（现在 ${page.tableHeight}px 高）`);
  assert.deepEqual(page.tableScroll, [0, 0], "宽屏下表格放得下，不出滚动条");
  assert.equal(page.rootColor, page.bodyColor, "正文字色跟站点一致");
  assert.equal(page.rootBg, "rgba(0, 0, 0, 0)", "正文不铺 Suzuri 自己的底色");
  assert.equal(page.bodyFont, page.siteFont, "文章正文用站点字体");
  await shot(browser, "post-1920-dark");

  // 目录跳转
  await browser.evaluate(`document.querySelector('.article-toc a[href="#${encodeURIComponent("中文标题")}"], .article-toc a[href="#中文标题"]').click()`);
  assert.ok(await waitFor(browser, `Math.abs(document.getElementById("中文标题").getBoundingClientRect().top) < 200`, 5000), "点目录滚到这个标题");

  // 图片放大
  await browser.evaluate(`document.querySelector(".plate-zoom").scrollIntoView({ block: "center" })`);
  await sleep(600);
  await browser.evaluate(`document.querySelector(".plate-zoom").click()`);
  assert.ok(await waitFor(browser, `Boolean(document.querySelector('[role="dialog"] img')?.checkVisibility())`, 5000), "点图片弹出灯箱");
  await shot(browser, "post-lightbox");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  assert.ok(await waitFor(browser, `!document.querySelector('[role="dialog"] img')`, 5000), "Esc 关闭灯箱");

  // 实况图：按住画面 250ms 播放、松开停止；点 LIVE 播放整段
  await browser.evaluate(`document.querySelector(".plate-live").scrollIntoView({ block: "center" })`);
  await sleep(600);
  const frame = await browser.evaluate(center(".plate-live > img"));
  await mouse(browser, "mouseMoved", frame);
  await mouse(browser, "mousePressed", frame);
  assert.ok(await waitFor(browser, `document.querySelector(".plate-live").hasAttribute("data-playing")`, 4000), "按住实况图会播放");
  await shot(browser, "post-live-playing");
  await mouse(browser, "mouseReleased", frame);
  assert.ok(await waitFor(browser, `!document.querySelector(".plate-live").hasAttribute("data-playing")`, 3000), "松开停止");
  const badge = await browser.evaluate(center(".plate-live .yz-live-badge"));
  await mouse(browser, "mouseMoved", badge);
  await mouse(browser, "mousePressed", badge);
  await mouse(browser, "mouseReleased", badge);
  assert.ok(await waitFor(browser, `document.querySelector(".plate-live").hasAttribute("data-playing")`, 4000), "点 LIVE 播放");

  // 浅色主题：变量跟着站点走
  await browser.evaluate(`document.documentElement.dataset.theme = "light"`);
  await sleep(500);
  const light = await browser.evaluate(`({ root: getComputedStyle(document.querySelector(".article-plate .suzuri-root")).color, body: getComputedStyle(document.body).color, border: getComputedStyle(document.querySelector(".article-plate .suzuri-root")).getPropertyValue("--suzuri-border").trim() })`);
  assert.equal(light.root, light.body, "浅色主题正文字色跟站点一致");
  assert.ok(light.border.length > 0, "--suzuri-border 指向站点变量");
  await browser.evaluate(`window.scrollTo(0, 0)`);
  await sleep(400);
  await shot(browser, "post-1920-light");
  await browser.evaluate(`document.documentElement.dataset.theme = "dark"`);

  // 手机宽度不横向溢出
  await browser.setViewport(390, 844, 2);
  await browser.goto(postUrl(slugs[0]), 3000);
  assert.ok(await waitFor(browser, `document.querySelector(".article-plate .suzuri-root")?.checkVisibility() === true`, 30000));
  const overflow = await browser.evaluate(`document.scrollingElement.scrollWidth - innerWidth`);
  assert.ok(overflow <= 1, `手机上不横向溢出（多出 ${overflow}px）`);
  await shot(browser, "post-390");

  // 手记：衬线体，加粗用无衬线
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/notes/${nid}`, 4000);
  assert.ok(await waitFor(browser, `document.querySelector(".note-detail .article-plate .suzuri-root")?.checkVisibility() === true`, 60000), "Plate 手记渲染出 Suzuri 正文");
  const note = await browser.evaluate(`(() => {
    const p = document.querySelector(".note-detail .article-plate .editor-paragraph");
    const strong = [...document.querySelectorAll(".note-detail .article-plate strong")].pop();
    return { body: getComputedStyle(p).fontFamily, serif: getComputedStyle(document.querySelector(".note-detail .post-detail-title")).fontFamily, bold: getComputedStyle(strong).fontFamily };
  })()`);
  assert.equal(note.body, note.serif, `手记正文用和标题一样的衬线体：${note.body}`);
  assert.notEqual(note.bold, note.serif, "手记加粗换成无衬线");
  await shot(browser, "note-1920");

  // 坏信封退回 Markdown
  await browser.goto(postUrl(slugs[1]), 4000);
  assert.ok(await waitFor(browser, `document.getElementById("兜底标题")?.checkVisibility() === true`, 60000), "坏信封退回 Markdown 正文");
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".article-plate"))`), false);

  // 回归：Markdown 和 Lexical 文章照旧
  await browser.goto(postUrl(slugs[2]), 4000);
  assert.ok(await waitFor(browser, `document.getElementById("markdown-标题")?.checkVisibility() === true`, 60000), "Markdown 文章照旧");
  await browser.goto(postUrl(slugs[3]), 4000);
  assert.ok(await waitFor(browser, `Boolean(document.querySelector(".article-rich .rich-content h2")?.checkVisibility())`, 60000), "Lexical 文章照旧走 Haklex");

  const errors = browser.errors.filter((e) => !/fn\/ps\/update|security vulnerability|Download the React DevTools/.test(e));
  assert.deepEqual(errors, [], "控制台没有报错和水合警告");
  console.log("PASS Plate article/note render natively (TOC, Shiki, KaTeX, lightbox, callout tones, live photo, themes, serif notes, mobile), broken envelopes fall back to Markdown, Markdown and Lexical unchanged");
} finally {
  await browser.close();
  if (process.env.PLATE_E2E_KEEP !== "1") await cleanup();
  await mongo.close();
}
