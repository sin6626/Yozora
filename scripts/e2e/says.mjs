// 浏览器回归测试：一言页（components/say-list.tsx、say-tools.tsx）。
// 按人看（?author=名字，胶囊计数、只剩这个人说的、没有这个人时 404）；抽一句（抽到的是列表里的一句，再抽换一句）；
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

  await browser.goto(`${base}/says`, 3000);
  await click(".say-draw-button");
  await sleep(800);
  const first = await browser.evaluate(`document.querySelector(".say-drawn blockquote > p")?.textContent`);
  assert.ok(full.texts.includes(first), "抽到的是列表里的一句");
  await click(".say-drawn-actions .btn:first-child");
  await sleep(800);
  const second = await browser.evaluate(`document.querySelector(".say-drawn blockquote > p")?.textContent`);
  assert.ok(second && second !== first, "再抽一句换了一句");

  await click(".say-drawn-actions .btn:nth-child(2)");
  await browser.evaluate(`new Promise((resolve) => { const check = () => document.querySelector(".say-card-preview img")?.naturalWidth ? resolve() : setTimeout(check, 100); check(); })`);
  const card = await browser.evaluate(`(() => {
    const img = document.querySelector(".say-card-preview img");
    const save = document.querySelector(".say-card-actions a[download]");
    return { size: [img.naturalWidth, img.naturalHeight], alt: img.alt, save: save && { href: save.href.startsWith("blob:"), name: save.getAttribute("download") } };
  })()`);
  assert.deepEqual(card.size, [1080, 1350], "金句卡片是 1080×1350 的竖图");
  assert.equal(card.alt, second, "卡片画的就是抽到的这句");
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
  console.log(`PASS 一言：按人看（${name} ${count} 条）、没这个人 404、抽一句不重复、金句卡片 1080×1350 可保存、Esc 关闭、悬停才出现卡片按钮`);
} finally {
  await browser.close();
}
