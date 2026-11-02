// 浏览器回归测试：一言页（components/say-list.tsx、say-sky.tsx、say-tools.tsx）。
// 金句星图（每句一颗星，鼠标移到星上读星面板翻出这句、星和星座亮起，抽一句先划过一颗流星再落到抽中的星上，再抽换一句）；
// 按人看就是看星座，不再有“按人看”胶囊（它和星图各管一份选中状态，点胶囊后星图还停在上一句），旧的 ?author= 链接显示全部；
// 金句卡片图（弹窗里是 1080×1350 的图，能保存；引文卡片右上角的按钮悬停才出现）。只读，不写库。
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
  spikes: document.querySelector(".say-sky-star[data-active] .say-sky-spikes") && getComputedStyle(document.querySelector(".say-sky-star[data-active] .say-sky-spikes")).opacity,
})`);
const page = () => browser.evaluate(`({
  count: document.querySelector(".page-heading .post-meta")?.textContent,
  chips: document.querySelectorAll(".say-authors, .say-toolbar").length,
  texts: [...document.querySelectorAll(".say-list .say-card blockquote > p")].map((p) => p.textContent),
  notFound: Boolean(document.querySelector(".site-content .empty-state")),
})`);

try {
  assert.ok(all.length >= 2, "本地库至少要有两条一言才能测（抽一句不重复）");
  await browser.setViewport(1280, 900);
  await browser.goto(`${base}/says`, 3000);
  const full = await page();
  assert.equal(full.count, `共 ${all.length} 条`);
  assert.equal(full.chips, 0, "没有“按人看”胶囊，按人看就看星座");
  await browser.goto(`${base}/says?author=${encodeURIComponent(all.find((say) => say.author?.trim())?.author?.trim() ?? "x")}`, 2500);
  const legacy = await page();
  assert.equal(legacy.notFound, false, "旧的 ?author= 链接不 404");
  assert.equal(legacy.count, `共 ${all.length} 条`, "旧的 ?author= 链接显示全部");

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
  console.log(`PASS 一言：没有按人看胶囊、旧 ?author= 显示全部、星图悬停读星与星座亮起、抽一句流星落点与不重复、金句卡片 1080×1350 可保存、Esc 关闭、悬停才出现卡片按钮`);
} finally {
  await browser.close();
}
