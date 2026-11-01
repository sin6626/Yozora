// 浏览器回归测试：一言页（components/say-list.tsx、say-sky.tsx、say-tools.tsx）。
// 按人看（?author=名字，胶囊计数、只剩这个人说的、没有这个人时 404）；金句星图（每句一颗星，鼠标移到星上读星面板翻出这句、星和星座亮起，
// 按人看时其他星座变暗，抽一句先划过一颗流星再落到抽中的星上，再抽换一句）；金句卡片图（弹窗里是 1080×1350 的图，能保存；
// 引文卡片右上角的按钮悬停才出现）。只读，不写库。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const api = process.env.API_URL ?? "http://127.0.0.1:2333";
const all = (await (await fetch(`${api}/says/all`)).json()).data ?? [];
const browser = await openBrowser({ port: 9379 });
const click = async (selector) => {
  const point = await browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
};
const hover = async (selector) => {
  const point = await browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x - 40, y: point.y - 40 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
};
const reading = () => browser.evaluate(`document.querySelector(".say-sky-reading blockquote > p")?.textContent`);
const sky = () => browser.evaluate(`({
  stars: document.querySelectorAll(".say-sky-star").length,
  active: [...document.querySelectorAll(".say-sky-star[data-active]")].map((g) => g.dataset.id),
  activeGroups: document.querySelectorAll(".say-sky-group[data-active]").length,
  dimStars: [...document.querySelectorAll(".say-sky-star[data-dim]")].map((g) => g.dataset.id),
  spikes: document.querySelector(".say-sky-star[data-active] .say-sky-spikes") && getComputedStyle(document.querySelector(".say-sky-star[data-active] .say-sky-spikes")).opacity,
})`);
const page = () => browser.evaluate(`({
  count: document.querySelector(".page-heading .post-meta")?.textContent,
  chips: [...document.querySelectorAll(".say-authors .tag-chip")].map((a) => ({ text: a.innerText.replace(/\\s+/g, " ").trim(), current: a.getAttribute("aria-current") })),
  authors: [...document.querySelectorAll(".say-list .say-card footer span")].map((s) => s.textContent),
  texts: [...document.querySelectorAll(".say-list .say-card blockquote > p")].map((p) => p.textContent),
  notFound: Boolean(document.querySelector(".site-content .empty-state")),
})`);

try {
  assert.ok(all.length >= 2, "本地库至少要有两条一言才能测（抽一句不重复、按人看）");
  await browser.setViewport(1280, 900);
  await browser.goto(`${base}/says`, 3000);
  const full = await page();
  assert.equal(full.count, `共 ${all.length} 条`);
  assert.deepEqual(full.chips[0], { text: `全部 ${all.length}`, current: "page" }, "第一枚是“全部”，当前选中");
  const counts = new Map();
  for (const say of all) if (say.author?.trim()) counts.set(say.author.trim(), (counts.get(say.author.trim()) ?? 0) + 1);
  assert.equal(full.chips.length, counts.size + 1, "每个说话的人一枚胶囊");

  const [name, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  await click(`.say-authors .tag-chip[href*="author="]`);
  await sleep(1500);
  assert.equal(await browser.evaluate("decodeURIComponent(location.search)"), `?author=${name}`, "点胶囊按人筛选");
  const one = await page();
  assert.equal(one.count, `共 ${count} 条`);
  assert.ok(one.authors.length === count && one.authors.every((author) => author.trim() === name), "只剩这个人说的");
  assert.equal(one.chips.find((chip) => chip.current)?.text, `${name} ${count}`, "这枚胶囊是当前选中");
  await browser.goto(`${base}/says?author=${encodeURIComponent("没有这个人")}`, 2500);
  assert.equal((await page()).notFound, true, "没有这个人时 404");

  // 金句星图：每句一颗星；鼠标移到哪颗星上，读星面板就翻出哪句，这颗星带星芒、它的星座亮起
  const textOf = new Map(all.map((say) => [say.id, say.text]));
  await browser.goto(`${base}/says`, 3000);
  assert.equal((await sky()).stars, all.length, "每句话一颗星");
  const [firstId, secondId] = await browser.evaluate(`[...document.querySelectorAll(".say-sky-star")].slice(0, 2).map((g) => g.dataset.id)`);
  await hover(`.say-sky-star[data-id="${firstId}"] .say-sky-core`);
  await sleep(600);
  assert.equal(await reading(), textOf.get(firstId), "悬停星：读星面板翻出这一句");
  const hovered = await sky();
  assert.deepEqual(hovered.active, [firstId], "悬停的这颗星亮起");
  assert.equal(hovered.activeGroups, (all.find((say) => say.id === firstId).author?.trim() ? 1 : 0), "有作者时它的星座亮起");
  assert.equal(hovered.spikes, "0.9", "亮起的星带十字星芒");
  await hover(`.say-sky-star[data-id="${secondId}"] .say-sky-core`);
  await sleep(600);
  assert.equal(await reading(), textOf.get(secondId), "移到另一颗星：换成那一句");

  // 抽一句：先有一颗流星划过星盘（.say-sky-flight），落下后这颗星亮起、面板翻出这句；再抽换一句
  await click(".say-sky-actions .say-draw-button");
  await sleep(200);
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".say-sky-flight"))`), true, "抽一句时流星正在划过");
  await sleep(1000);
  const first = await reading();
  assert.ok(full.texts.includes(first), "抽到的是列表里的一句");
  assert.equal(textOf.get((await sky()).active[0]), first, "流星落下的就是抽到的这颗星");
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".say-sky-flight"))`), false, "流星落下后消失");
  await click(".say-sky-actions .say-draw-button");
  await sleep(1200);
  const second = await reading();
  assert.ok(second && second !== first, "再抽一句换了一句");

  // 按人看：其他人的星变暗，抽一句只在这个人说的里面抽
  await browser.goto(`${base}/says?author=${encodeURIComponent(name)}`, 3000);
  const focused = await sky();
  const mine = all.filter((say) => say.author?.trim() === name).map((say) => say.id);
  assert.equal(focused.stars, all.length, "按人看时星图仍是整片天");
  assert.deepEqual(focused.dimStars.sort(), all.map((say) => say.id).filter((id) => !mine.includes(id)).sort(), "别人的星变暗");
  await click(".say-sky-intro .say-draw-button");
  await sleep(1200);
  assert.ok(mine.includes((await sky()).active[0]), "按人看时只抽这个人说的");

  await browser.goto(`${base}/says`, 3000);
  await click(".say-sky-intro .say-draw-button");
  await sleep(1200);
  const drawn = await reading();
  await click(".say-sky-actions .btn:nth-child(2)");
  await browser.evaluate(`new Promise((resolve) => { const check = () => document.querySelector(".say-card-preview img")?.naturalWidth ? resolve() : setTimeout(check, 100); check(); })`);
  const card = await browser.evaluate(`(() => {
    const img = document.querySelector(".say-card-preview img");
    const save = document.querySelector(".say-card-actions a[download]");
    return { size: [img.naturalWidth, img.naturalHeight], alt: img.alt, save: save && { href: save.href.startsWith("blob:"), name: save.getAttribute("download") } };
  })()`);
  assert.deepEqual(card.size, [1080, 1350], "金句卡片是 1080×1350 的竖图");
  assert.equal(card.alt, drawn, "卡片画的就是抽到的这句");
  assert.ok(card.save?.href && card.save.name.endsWith(".png"), "可以保存成 PNG");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(400);
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".say-card-dialog"))`), false, "Esc 关掉卡片弹窗");

  const opacity = () => browser.evaluate(`getComputedStyle(document.querySelector(".say-list .say-card-button")).opacity`);
  assert.equal(await opacity(), "0", "引文卡片右上角的“做成卡片”平时藏着");
  const cardBox = await browser.evaluate(`(() => { const r = document.querySelector(".say-list .say-card").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cardBox.x, y: cardBox.y });
  await sleep(300);
  assert.equal(await opacity(), "1", "悬停卡片时出现");

  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log(`PASS 一言：按人看（${name} ${count} 条）、没这个人 404、星图悬停读星与星座亮起、抽一句流星落点与不重复、按人看变暗且只抽这个人、金句卡片 1080×1350 可保存、Esc 关闭、悬停才出现卡片按钮`);
} finally {
  await browser.close();
}
