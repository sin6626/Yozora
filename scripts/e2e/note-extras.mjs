// 浏览器回归测试：手记详情的左侧时间线、文末话题卡片、头图与横幅（2026-11-07，参考 Shiro 的 NoteLeftSidebar / NoteBottomTopic / NoteHeadCover / NoteBanner）。
// 1920×991：正文左边有“前后的手记”，当前这篇高亮、前后各 10 篇与 Core 的公开手记对得上，读到底不压页脚，点了能跳；1280 与手机没有。
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

// 公开手记按时间倒序（和前台 getTimeline 一致），挑中间那篇，两边都有邻居
const notes = (await (await fetch(`${core}/notes?size=50`)).json()).data.sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
assert.ok(notes.length >= 3, "本地公开手记不足 3 篇");
const index = Math.floor(notes.length / 2);
const current = notes[index];
const expected = notes.slice(Math.max(0, index - 10), index + 11).map((note) => `/notes/${note.nid}`);
const topicNote = notes.find((note) => note.topic_id || note.topicId);

const issues = `(() => { const m = (document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? "").match(/(\\d+)\\s*Issues?/); return m ? Number(m[1]) : 0; })()`;
const readTimeline = `(() => {
  const nav = [...document.querySelectorAll(".note-timeline")].find((el) => el.checkVisibility());
  if (!nav) return null;
  const links = [...nav.querySelectorAll("a")];
  const active = nav.querySelector('a[aria-current="page"]');
  const other = links.find((a) => a !== active);
  const article = nav.closest(".note-detail").querySelector(".post-list-content").getBoundingClientRect();
  const box = nav.querySelector(".note-timeline-inner").getBoundingClientRect();
  return {
    hrefs: links.map((a) => new URL(a.href).pathname),
    active: active && new URL(active.href).pathname,
    activeColor: active && getComputedStyle(active).color,
    otherColor: other && getComputedStyle(other).color,
    right: box.right, contentLeft: article.left, top: box.top, bottom: box.bottom,
    footerTop: document.querySelector(".site-footer")?.getBoundingClientRect().top ?? Infinity,
  };
})()`;
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
  await browser.goto(`${base}/notes/${current.nid}`, 6000);
  const timeline = await browser.evaluate(readTimeline);
  assert.ok(timeline, "1920 宽没有左侧时间线");
  assert.deepEqual(timeline.hrefs, expected, "时间线不是当前这篇前后各 10 篇");
  assert.equal(timeline.active, `/notes/${current.nid}`, "当前这篇没有高亮");
  assert.notEqual(timeline.activeColor, timeline.otherColor, "当前这篇和别的颜色一样");
  assert.ok(timeline.right <= timeline.contentLeft, `时间线压到正文：${timeline.right} > ${timeline.contentLeft}`);
  await shot(browser, "timeline-1920.jpg");

  // 读到底：时间线跟着 sticky，但不能压到页脚
  await browser.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  await sleep(600);
  const bottom = await browser.evaluate(readTimeline);
  assert.ok(bottom.bottom <= bottom.footerTop + 1, `时间线压到页脚：${bottom.bottom} > ${bottom.footerTop}`);
  await shot(browser, "timeline-bottom-1920.jpg");

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
  } else console.log("note-extras: 本地没有带话题的手记，跳过话题卡片");

  // 站内点时间线里另一篇：跳过去，高亮跟着换
  await browser.goto(`${base}/notes/${current.nid}`, 5000);
  const target = expected.find((href) => href !== `/notes/${current.nid}`);
  await browser.evaluate(`[...document.querySelectorAll(".note-timeline a")].find((a) => a.checkVisibility() && new URL(a.href).pathname === ${JSON.stringify(target)}).click()`);
  await sleep(3500);
  const moved = await browser.evaluate(readTimeline);
  assert.equal(await browser.evaluate("location.pathname"), target);
  assert.equal(moved?.active, target, "跳转后高亮没有换");
  assert.equal(await browser.evaluate(issues), 0, "手记页有 Next Issue");

  // 1280 宽、手机：没有时间线；手机上话题卡片还在
  await browser.setViewport(1280, 800);
  await browser.goto(`${base}/notes/${current.nid}`, 4000);
  assert.equal(await browser.evaluate(readTimeline), null, "1280 宽不该有左侧时间线");
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/notes/${topicNote?.nid ?? current.nid}`, 4000);
  assert.equal(await browser.evaluate(readTimeline), null, "手机不该有左侧时间线");
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
