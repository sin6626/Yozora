// 浏览器回归测试：手记详情的文末话题卡片、头图与横幅（2026-11-07，参考 Shiro 的 NoteBottomTopic / NoteHeadCover / NoteBanner）。
// 有话题的手记文末有话题卡片（在相邻手记前），最近几篇不含当前这篇，链到 /notes?topic=<slug> 且打开不是 404。
// 头图与横幅本地库没有数据，用 /debug 的示例检查（真实组件）。截图存 .local/previews/note-extras/。
// 需要先运行 pnpm dev。用法：node scripts/e2e/note-extras.mjs
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const shots = new URL("../../.local/previews/note-extras/", import.meta.url);
mkdirSync(shots, { recursive: true });

const notes = (await (await fetch(`${core}/notes?size=50`)).json()).data;
const topicNote = notes.find((note) => note.topic_id || note.topicId);

const issues = `(() => { const m = (document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? "").match(/(\\d+)\\s*Issues?/); return m ? Number(m[1]) : 0; })()`;
const readTopic = `(() => {
  const card = [...document.querySelectorAll(".note-topic-card")].find((el) => el.checkVisibility());
  if (!card) return null;
  const neighbor = card.parentElement.querySelector(".neighbor-nav");
  const end = card.parentElement.querySelector(".article-end");
  return {
    name: card.querySelector(".note-topic-name")?.textContent,
    nameHref: card.querySelector(".note-topic-name")?.getAttribute("href"),
    moreHref: card.querySelector(".note-topic-more")?.getAttribute("href"),
    recent: [...card.querySelectorAll(".note-stars a")].map((a) => new URL(a.href).pathname),
    hasIcon: !!card.querySelector(".note-topic-icon"),
    beforeNeighbor: !neighbor || !!(card.compareDocumentPosition(neighbor) & Node.DOCUMENT_POSITION_FOLLOWING),
    afterEnd: !!end && !!(end.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING),
  };
})()`;
const shot = async (browser, name) => {
  const { data } = (await browser.send("Page.captureScreenshot", { format: "jpeg", quality: 82 })).result;
  writeFileSync(new URL(name, shots), Buffer.from(data, "base64"));
};

const browser = await openBrowser({ port: 9455 });
try {
  await browser.setViewport(1920, 991);
  // 话题卡片
  if (topicNote) {
    await browser.goto(`${base}/notes/${topicNote.nid}`, 5000);
    const topic = await browser.evaluate(readTopic);
    assert.ok(topic, "有话题的手记没有话题卡片");
    assert.match(topic.nameHref, /^\/notes\?topic=/, "话题名没有链到筛选");
    assert.equal(topic.moreHref, topic.nameHref);
    assert.ok(topic.hasIcon);
    assert.ok(topic.recent.length <= 5 && !topic.recent.includes(`/notes/${topicNote.nid}`), "最近几篇不对");
    assert.ok(topic.beforeNeighbor && topic.afterEnd, "话题卡片应在文末喜欢之后、相邻手记之前");
    await browser.evaluate(`document.querySelector(".note-topic-card").scrollIntoView({ block: "center" })`);
    await sleep(400);
    await shot(browser, "topic-card-1920.jpg");
    // 点“全部”去筛选页，不能是站内 404
    await browser.evaluate(`[...document.querySelectorAll(".note-topic-more")].find((el) => el.checkVisibility()).click()`);
    await sleep(3000);
    const filtered = await browser.evaluate(`({ url: location.pathname + location.search, empty: !!document.querySelector(".empty-state:not([hidden])")?.checkVisibility(), entries: document.querySelectorAll(".entry").length })`);
    assert.equal(filtered.url, topic.moreHref);
    assert.ok(!filtered.empty && filtered.entries > 0, "话题筛选页是空的或 404");
    assert.equal(await browser.evaluate(issues), 0, "手记页有 Next Issue");
  } else console.log("note-extras: 本地没有带话题的手记，跳过话题卡片");

  // 手机上话题卡片还在
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/notes/${topicNote?.nid ?? notes[0].nid}`, 4000);
  if (topicNote) {
    assert.ok(await browser.evaluate(readTopic), "手机上没有话题卡片");
    await browser.evaluate(`document.querySelector(".note-topic-card").scrollIntoView({ block: "center" })`);
    await sleep(400);
    await shot(browser, "topic-card-390.jpg");
  }

  // 头图与横幅：/debug 示例（真实组件）
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/debug`, 5000);
  const demo = await browser.evaluate(`(() => {
    const box = document.querySelector("#debug-note-extras");
    box.scrollIntoView();
    const img = box.querySelector(".note-cover img");
    const banners = [...box.querySelectorAll(".note-banner")];
    return {
      cover: img && img.complete && img.naturalWidth > 0,
      coverBeforeTitle: !!img && !!(img.compareDocumentPosition(box.querySelector("h1")) & Node.DOCUMENT_POSITION_FOLLOWING),
      mask: img && getComputedStyle(img.parentElement).maskImage,
      types: banners.map((el) => el.dataset.type),
      roles: banners.map((el) => el.getAttribute("role")),
      borders: new Set(banners.map((el) => getComputedStyle(el).borderColor)).size,
      icons: banners.every((el) => el.querySelector("svg")),
      multiline: banners.at(-1).getBoundingClientRect().height > banners[0].getBoundingClientRect().height,
    };
  })()`);
  await sleep(500);
  await shot(browser, "cover-banner-debug.jpg");
  assert.ok(demo.cover, "调试页头图没加载");
  assert.ok(demo.coverBeforeTitle, "头图应在标题上方");
  assert.match(demo.mask, /gradient/, "头图底部没有渐隐");
  assert.deepEqual(demo.types, ["info", "warning", "error", "success", "secondary"]);
  assert.ok(demo.roles.every((role) => role === "note"));
  assert.equal(demo.borders, 5, "五种横幅颜色应各不相同");
  assert.ok(demo.icons && demo.multiline, "横幅缺图标或没有保留换行");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("note-extras: 通过");
} finally {
  await browser.close();
}
