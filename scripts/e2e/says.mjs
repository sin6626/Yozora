// 浏览器回归测试：一言页（components/say-list.tsx、say-sky.tsx、say-tools.tsx）。
// 金句星图（每句一颗星，一开始右边是最新的一句，鼠标移到星上就换成那一句、星和星座亮起；2026-11-02 用户要求去掉“金句星图”说明和抽一句，
// 只有一颗星的星座平时不标名字；调试页 5 / 60 / 240 句的示例：星都在星盘里、可悬停的范围互不盖住、悬停能换句）；
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
  assert.ok(all.length >= 2, "本地库至少要有两条一言才能测（悬停换句）");
  await browser.setViewport(1280, 900);
  await browser.goto(`${base}/says`, 3000);
  const full = await page();
  assert.equal(full.count, `共 ${all.length} 条`);
  assert.equal(full.chips, 0, "没有“按人看”胶囊，按人看就看星座");
  await browser.goto(`${base}/says?author=${encodeURIComponent(all.find((say) => say.author?.trim())?.author?.trim() ?? "x")}`, 2500);
  const legacy = await page();
  assert.equal(legacy.notFound, false, "旧的 ?author= 链接不 404");
  assert.equal(legacy.count, `共 ${all.length} 条`, "旧的 ?author= 链接显示全部");

  // 金句星图：每句一颗星；一开始右边是最新的一句；鼠标移到哪颗星上就换成哪句，这颗星带星芒、它的星座亮起。没有说明文字、没有抽一句
  const textOf = new Map(all.map((say) => [say.id, say.text]));
  const newest = all.reduce((latest, say) => (Date.parse(say.created) > Date.parse(latest.created) ? say : latest));
  await browser.goto(`${base}/says`, 3000);
  assert.equal((await sky()).stars, all.length, "每句话一颗星");
  assert.equal(await reading(), newest.text, "一开始是最新的一句");
  assert.deepEqual((await sky()).active, [newest.id], "最新那句的星亮着");
  const extras = await browser.evaluate(`({
    intro: document.querySelectorAll(".say-sky-intro, .say-draw-button, .say-sky-back").length,
    heading: [...document.querySelectorAll(".say-sky h2, .say-sky h3")].map((h) => h.textContent),
    labels: [...document.querySelectorAll(".say-sky-group")].map((g) => ({ stars: g.querySelectorAll(".say-sky-line").length + 1, active: g.hasAttribute("data-active"), label: Boolean(g.querySelector(".say-sky-label")) })),
  })`);
  assert.equal(extras.intro, 0, "没有说明、抽一句、回到星图");
  assert.deepEqual(extras.heading, [], "星图里没有“金句星图”标题");
  assert.ok(extras.labels.every((group) => group.stars > 1 || group.active || !group.label), "只有一颗星的星座平时不标名字");
  const [firstId, secondId] = await browser.evaluate(`[...document.querySelectorAll(".say-sky-star")].map((g) => g.dataset.id).filter((id) => id !== ${JSON.stringify(newest.id)}).slice(0, 2)`);
  await hover(`.say-sky-star[data-id="${firstId}"] .say-sky-core`);
  await sleep(600);
  assert.equal(await reading(), textOf.get(firstId), "悬停星：右边换成这一句");
  const hovered = await sky();
  assert.deepEqual(hovered.active, [firstId], "悬停的这颗星亮起");
  assert.equal(hovered.activeGroups, (all.find((say) => say.id === firstId).author?.trim() ? 1 : 0), "有作者时它的星座亮起");
  assert.equal(hovered.spikes, "0.9", "亮起的星带十字星芒");
  await hover(`.say-sky-star[data-id="${secondId}"] .say-sky-core`);
  await sleep(600);
  assert.equal(await reading(), textOf.get(secondId), "移到另一颗星：换成那一句");
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 600 });
  await sleep(300);
  assert.equal(await reading(), textOf.get(secondId), "鼠标离开星盘后停在最后看的那句");

  // 调试页：5 / 60 / 240 句的示例都装在星盘里，可悬停的范围互不盖住，悬停能换句（2026-11-02 用户：句子多了圈根本装不下）
  await browser.goto(`${base}/debug`, 5000);
  const samples = await browser.evaluate(`[...document.querySelectorAll(".debug-say-sky")].map((box) => {
    const rim = box.querySelector(".say-sky-grid circle").getBoundingClientRect();
    const cx = rim.x + rim.width / 2, cy = rim.y + rim.height / 2, radius = rim.width / 2;
    const stars = [...box.querySelectorAll(".say-sky-star")].map((g) => { const hit = g.querySelector(".say-sky-hit").getBoundingClientRect(); return { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2, r: hit.width / 2 }; });
    let gap = Infinity;
    for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) gap = Math.min(gap, Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y));
    return { count: Number(box.dataset.count), stars: stars.length, outside: stars.filter((star) => Math.hypot(star.x - cx, star.y - cy) > radius).length, hit: stars[0].r, gap };
  })`);
  assert.deepEqual(samples.map((sample) => [sample.count, sample.stars]), [[5, 5], [60, 60], [240, 240]], "三份示例，每句一颗星");
  for (const sample of samples) {
    assert.equal(sample.outside, 0, `${sample.count} 句：星都在星盘里`);
    assert.ok(sample.hit * 2 <= sample.gap + 0.5, `${sample.count} 句：可悬停的范围互不盖住（半径 ${sample.hit.toFixed(1)}px，最近 ${sample.gap.toFixed(1)}px）`);
  }
  await browser.evaluate(`document.querySelector('.debug-say-sky[data-count="240"]').scrollIntoView({ block: "center" })`);
  await sleep(400);
  const target = await browser.evaluate(`document.querySelectorAll('.debug-say-sky[data-count="240"] .say-sky-star')[100].dataset.id`);
  await hover(`.debug-say-sky[data-count="240"] .say-sky-star[data-id="${target}"] .say-sky-core`);
  await sleep(600);
  assert.equal(await browser.evaluate(`document.querySelector('.debug-say-sky[data-count="240"] .say-sky-star[data-active]')?.dataset.id`), target, "240 句时也能悬停到指定的那颗星");

  await browser.goto(`${base}/says`, 3000);
  const drawn = await reading();
  await click(".say-sky-actions .btn");
  await browser.evaluate(`new Promise((resolve) => { const check = () => document.querySelector(".say-card-preview img")?.naturalWidth ? resolve() : setTimeout(check, 100); check(); })`);
  const card = await browser.evaluate(`(() => {
    const img = document.querySelector(".say-card-preview img");
    const save = document.querySelector(".say-card-actions a[download]");
    return { size: [img.naturalWidth, img.naturalHeight], alt: img.alt, save: save && { href: save.href.startsWith("blob:"), name: save.getAttribute("download") } };
  })()`);
  assert.deepEqual(card.size, [1080, 1350], "金句卡片是 1080×1350 的竖图");
  assert.equal(card.alt, drawn, "卡片画的就是右边那句");
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
  console.log(`PASS 一言：没有按人看胶囊、旧 ?author= 显示全部、星图一开始是最新一句、悬停换句与星座亮起、没有说明和抽一句、调试页 5/60/240 句都装得下且悬停不打架、金句卡片 1080×1350 可保存、Esc 关闭、悬停才出现卡片按钮`);
} finally {
  await browser.close();
}
