// 浏览器回归测试：导航面板右栏切换时逐字滚动（2026-11-09 站长要求：鼠标移到左边另一个分类/话题，右边的文字逐字滚出来，
// 和页脚链接的逐字翻滚一样的感觉）。文章、手记、时间线三个面板共用 GroupPanel，这里测文章面板。
// 做法是新旧两层叠在一起：旧的一层（读屏隐藏、点不到）每个字往上滚出去，新的一层每个字从下面滚上来，按行、按字依次错开。
// 检查：① 刚打开面板时不滚；② 换分类的一瞬间新旧两层都在，新字在下方往上走、旧字往上走，后面的字比前面的晚开始；
// ③ 滚完新的一层回到原位、旧的一层全部滚出去；右栏标题和每条链接是新分类的，旧的一层没有链接、不接鼠标；标题仍是一行、超长省略；
// ④ 快速扫过几个分类，最后显示的是最后停下的那个，只有一层新的；⑤ 没有文章的分类也滚出“还没有”；⑥ 减少动态效果时不滚。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9487 });
const move = (x, y) => browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const panel = `document.querySelector(".navigation-Popup .nav-panel.is-posts")`;

async function openPosts() {
  const [x, y] = await browser.evaluate(`(() => { const t = [...document.querySelectorAll(".navigation-List .navigation-Trigger")].find((t) => t.textContent.trim().startsWith("文章")); const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await move(x, y + 120);
  await sleep(300);
  await move(x, y);
  await sleep(900);
}
const categories = () => browser.evaluate(`[...${panel}.querySelectorAll(".nav-category")].map((a) => { const r = a.getBoundingClientRect(); return { name: a.querySelector(".nav-category-name").textContent.trim(), count: Number(a.querySelector(".nav-category-count").textContent), x: r.x + 30, y: r.y + r.height / 2 }; })`);
// 右栏两层：新的一层的文字和每个字的位置（相对一行高）、动画延迟；旧的一层同样
const layers = () => browser.evaluate(`(() => {
  const read = (layer) => layer && {
    label: layer.querySelector(".nav-panel-label")?.innerText.trim(),
    text: layer.innerText.replace(/\\s+/g, " ").trim(),
    links: layer.querySelectorAll("a").length,
    hidden: layer.getAttribute("aria-hidden"),
    pointer: getComputedStyle(layer).pointerEvents,
    animation: getComputedStyle(layer.querySelector(".roll-ch") ?? layer).animationName,
    shift: [...layer.querySelectorAll(".roll-ch")].slice(0, 6).map((c) => Math.round(new DOMMatrix(getComputedStyle(c).transform).m42 / parseFloat(getComputedStyle(c).lineHeight) * 100) / 100),
    delays: [...layer.querySelectorAll(".nav-panel-label .roll-ch")].map((c) => parseFloat(getComputedStyle(c).animationDelay)),
    rowDelays: [...layer.querySelectorAll(".nav-entry-title")].map((t) => parseFloat(getComputedStyle(t.querySelector(".roll-ch")).animationDelay)),
    titles: [...layer.querySelectorAll(".nav-entry")].map((a) => ({ href: a.getAttribute("href"), lines: Math.round(a.querySelector(".nav-entry-title").getBoundingClientRect().height / parseFloat(getComputedStyle(a.querySelector(".nav-entry-title")).lineHeight)), ellipsis: getComputedStyle(a.querySelector(".nav-entry-title")).textOverflow })),
  };
  const main = ${panel}.querySelector(".nav-panel-main");
  return { count: main.querySelectorAll(".nav-roll-layer").length, fresh: read(main.querySelector('.nav-roll-layer:not([aria-hidden])')), old: read(main.querySelector('.nav-roll-layer[aria-hidden="true"]')) };
})()`);

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/notes`);
  await sleep(2500);
  await openPosts();

  const opened = await layers();
  assert.equal(opened.count, 1, "刚打开面板只有一层");
  assert.equal(opened.fresh.animation, "none", "刚打开面板不滚");

  const list = await categories();
  const from = list.findIndex((c, i) => i === 0);
  const to = list.findIndex((c, i) => i > 0 && c.count > 0 && c.name !== list[from].name);
  await move(list[to].x, list[to].y);
  await sleep(200); // 缓动曲线开头慢，等到滚到中途再看
  const mid = await layers();
  assert.equal(mid.count, 2, "换分类的一瞬间新旧两层都在");
  assert.ok(mid.fresh.label.startsWith(list[to].name), `新的一层是新分类：${mid.fresh.label}`);
  assert.ok(mid.old.label.startsWith(list[from].name), `旧的一层是原来的分类：${mid.old.label}`);
  assert.equal(mid.old.hidden, "true", "旧的一层读屏不念");
  assert.equal(mid.old.links, 0, "旧的一层没有链接");
  assert.equal(mid.old.pointer, "none", "旧的一层不接鼠标");
  assert.ok(mid.fresh.shift.some((s) => s > 0.05), `新字在下方往上走：${mid.fresh.shift}`);
  assert.ok(mid.old.shift.some((s) => s < -0.05), `旧字往上滚出去：${mid.old.shift}`);
  assert.ok(mid.fresh.delays.every((d, i) => i === 0 || d > mid.fresh.delays[i - 1]), `后面的字晚开始：${mid.fresh.delays}`);
  assert.ok(mid.fresh.rowDelays.every((d, i) => i === 0 || d > mid.fresh.rowDelays[i - 1]), `下面的行晚开始：${mid.fresh.rowDelays}`);

  await sleep(900);
  const done = await layers();
  assert.ok(done.fresh.shift.every((s) => s === 0), `滚完新字回到原位：${done.fresh.shift}`);
  assert.ok(!done.old || done.old.shift.every((s) => s <= -0.99), `旧字全部滚出去：${done.old?.shift}`);
  assert.ok(done.fresh.label.startsWith(list[to].name), "右栏标题是新分类");
  assert.ok(done.fresh.titles.length > 0 && done.fresh.titles.every((t) => t.href?.startsWith("/posts/")), "每条是新分类文章的链接");
  assert.ok(done.fresh.titles.every((t) => t.lines === 1 && t.ellipsis === "ellipsis"), `标题仍是一行、超长省略：${JSON.stringify(done.fresh.titles)}`);

  // 快速扫过几个分类：最后显示的是最后停下的那个
  for (const c of list) {
    await move(c.x, c.y);
    await sleep(50);
  }
  const last = list.at(-1);
  await sleep(1000);
  const swept = await layers();
  assert.ok(swept.fresh.label.startsWith(last.name), `扫过后显示最后停下的分类：${swept.fresh.label} / ${last.name}`);
  assert.ok(swept.count <= 2, "最多新旧两层");

  // 没有文章的分类也滚出“还没有”
  const empty = list.find((c) => c.count === 0);
  if (empty) {
    await move(list[to].x, list[to].y);
    await sleep(900);
    await move(empty.x, empty.y);
    await sleep(900);
    const none = await layers();
    assert.ok(none.fresh.label.startsWith(empty.name) && none.fresh.titles.length === 0, `空分类：${none.fresh.text}`);
    assert.ok(none.fresh.text.length > none.fresh.label.length, "空分类显示提示文字");
  }

  // 减少动态效果：换分类不滚
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await move(list[from].x, list[from].y);
  await sleep(90);
  const reduced = await layers();
  assert.equal(reduced.fresh.animation, "none", "减少动态效果时不滚");
  assert.ok(!reduced.old || reduced.old.shift.every((s) => s <= -0.99 || s === 0) , "减少动态效果时旧的一层不留在画面里");

  console.log(`PASS 导航面板右栏逐字滚动：${list[from].name} → ${list[to].name}，新旧两层、按字按行错开、滚完归位、快速扫过停在最后一个、空分类、减少动态效果不滚`);
} finally {
  browser.close();
}
