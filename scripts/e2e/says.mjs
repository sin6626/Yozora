// 浏览器回归测试：一言页（components/say-list.tsx、say-sky.tsx、say-list-drawer.tsx、say-tools.tsx）。
// 2026-11-02 用户定：一言页整页是一片星空（不要圆形星盘、不要“金句星图”说明和抽一句、不要下面的列表），每句话一颗暖色的星，
// 同一个人说的连成星座；一开始没有选中的星，鼠标移到星上就在旁边浮出那句话，点别处或按 Esc 收起；全部句子收在右下角“全部 N 条”抽屉里；
// 手机竖屏另排一份，那句话在底部。
// 这里检查：星空铺满屏幕宽、每句一颗星、一开始没有选中的星和卡片、悬停换句与星座亮起、离开停住、点别处和 Esc 收起、卡片在星旁边且不出画面、
// 没有圆盘/说明/抽一句/胶囊、旧 ?author= 显示全部；
// 调试页 5 / 60 / 240 句都在画面里且悬停范围互不盖住、240 句能悬停到指定星；手机竖屏用竖排那份、点星换句、卡片在底部；
// 抽屉里是全部句子、引文卡片的“做成卡片”悬停才出现；金句卡片图 1080×1350 可保存、Esc 关闭。只读，不写库。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const api = process.env.API_URL ?? "http://127.0.0.1:2333";
const all = (await (await fetch(`${api}/says/all`)).json()).data ?? [];
const browser = await openBrowser({ port: 9379 });
const centerOf = (selector) => browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const click = async (selector) => {
  const point = await centerOf(selector);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
};
const hover = async (selector) => {
  const point = await centerOf(selector);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x - 40, y: point.y - 40 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
};
const escape = async () => {
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
};
// 当前看得见的那份星空（横屏 wide / 竖屏 tall）
const layer = (scope = "") => `${scope} .say-sky:is([data-shape="wide"], [data-shape="tall"])`;
const visible = (scope = "") => `[...document.querySelectorAll('${layer(scope)}')].find((el) => el.checkVisibility())`;
const sky = (scope = "") => browser.evaluate(`(() => {
  const sky = ${visible(scope)};
  const card = sky.querySelector(".say-sky-card");
  const box = sky.getBoundingClientRect();
  const cardBox = card?.getBoundingClientRect();
  return {
    shape: sky.dataset.shape,
    stars: sky.querySelectorAll(".say-star").length,
    active: [...sky.querySelectorAll(".say-star[data-active]")].map((el) => el.dataset.id),
    activeLines: sky.querySelectorAll(".say-sky-lines g[data-active] line").length,
    spikes: sky.querySelector(".say-star[data-active] .say-star-spikes") && getComputedStyle(sky.querySelector(".say-star[data-active] .say-star-spikes")).opacity,
    reading: card?.querySelector("blockquote > p")?.textContent,
    card: cardBox && { left: cardBox.left, right: cardBox.right, top: cardBox.top, bottom: cardBox.bottom },
    field: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width },
  };
})()`);

try {
  assert.ok(all.length >= 2, "本地库至少要有两条一言才能测（悬停换句）");
  const textOf = new Map(all.map((say) => [say.id, say.text]));
  await browser.setViewport(1440, 900);
  await browser.goto(`${base}/says`, 3500);

  // 整页星空：铺满屏幕宽，横屏那份；每句一颗星；没有圆盘、说明、抽一句、按人看胶囊、下面的列表
  const page = await browser.evaluate(`({
    count: document.querySelector(".page-heading .post-meta")?.textContent,
    width: innerWidth,
    old: document.querySelectorAll(".say-sky-chart, .say-sky-grid, .say-sky-intro, .say-draw-button, .say-authors, .say-toolbar").length,
    listOutsideDrawer: [...document.querySelectorAll(".say-list")].filter((list) => !list.closest(".say-drawer")).length,
    drawerItems: document.querySelectorAll(".say-drawer .say-card").length,
  })`);
  assert.equal(page.count, `共 ${all.length} 条`);
  assert.equal(page.old, 0, "没有圆形星盘、说明、抽一句、按人看胶囊");
  assert.equal(page.listOutsideDrawer, 0, "星空下面没有列表");
  assert.equal(page.drawerItems, all.length, "全部句子都在抽屉里（没打开时也在页面里）");
  const first = await sky();
  assert.equal(first.shape, "wide", "横屏用横排那份");
  assert.ok(first.field.width >= page.width - 20 && first.field.left <= 1, `星空铺满屏幕宽（${first.field.width}/${page.width}）`);
  assert.equal(first.stars, all.length, "每句话一颗星");
  assert.equal(first.reading, undefined, "一开始没有那句话的卡片");
  assert.deepEqual(first.active, [], "一开始没有选中的星");

  // 悬停换句：这颗星带星芒、它的星座（不止一颗星时）连线亮起；卡片在画面里；离开星空停在最后看的那句
  // 看得见、没被卡片盖住的星（elementFromPoint 拿到的就是它）
  const uncovered = () => browser.evaluate(`[...${visible()}.querySelectorAll(".say-star:not([data-active])")].filter((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".say-star") === el; }).map((el) => el.dataset.id)`);
  assert.equal((await uncovered()).length, all.length, "一开始每颗星都能悬停到");
  const ids = (await uncovered()).slice(0, 2);
  for (const id of ids) {
    await hover(`${layer()} .say-star[data-id="${id}"]`);
    await sleep(600);
    const now = await sky();
    assert.equal(now.reading, textOf.get(id), "悬停星：旁边换成这一句");
    assert.equal(await browser.evaluate(`${visible()}.querySelector(".say-sky-card").firstElementChild.tagName`), "BLOCKQUOTE", "卡片开头就是那句话，不写“某某座”");
    assert.deepEqual(now.active, [id], "悬停的这颗星亮起");
    assert.equal(now.spikes, "0.9", "亮起的星带十字星芒");
    const author = all.find((say) => say.id === id).author?.trim();
    const kin = author ? all.filter((say) => say.author?.trim() === author).length : 1;
    assert.equal(now.activeLines, kin - 1, "它的星座连线亮起（只有一颗星时没有线）");
    if (all.length <= 12) assert.equal((await uncovered()).length, all.length - 1, "星不多时卡片不盖住别的星");
    assert.ok(now.card.left >= now.field.left && now.card.right <= now.field.right && now.card.top >= now.field.top - 40 && now.card.bottom <= now.field.bottom + 40, "那句话的卡片在星空里");
  }
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 120 });
  await sleep(300);
  assert.equal((await sky()).reading, textOf.get(ids.at(-1)), "鼠标离开后停在最后看的那句");
  // 点星和卡片以外的地方收起（2026-11-02 用户：点屏幕其他处弹层应该消失）；点卡片本身不收起；Esc 也收起
  const empty = await browser.evaluate(`(() => { const r = ${visible()}.getBoundingClientRect(); for (let y = r.top + 20; y < r.bottom; y += 23) for (let x = r.left + 20; x < r.right; x += 37) { const el = document.elementFromPoint(x, y); if (el && !el.closest(".say-star, .say-sky-card, .say-list-trigger, a, button")) return { x, y }; } })()`);
  await click(`${layer()} .say-sky-card blockquote`);
  await sleep(200);
  assert.equal((await sky()).reading, textOf.get(ids.at(-1)), "点卡片本身不收起");
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x: empty.x, y: empty.y, button: "left", clickCount: 1 });
  await sleep(300);
  const closed = await sky();
  assert.equal(closed.reading, undefined, "点空白处卡片收起");
  assert.deepEqual(closed.active, [], "点空白处后没有选中的星");
  await hover(`${layer()} .say-star[data-id="${ids[0]}"]`);
  await sleep(400);
  assert.equal((await sky()).reading, textOf.get(ids[0]));
  await escape();
  await sleep(300);
  assert.equal((await sky()).reading, undefined, "Esc 收起卡片");

  // 旧链接：?author=、?page= 都显示这一页、不 404
  for (const query of [`author=${encodeURIComponent(all.find((say) => say.author?.trim())?.author?.trim() ?? "x")}`, "page=2"]) {
    await browser.goto(`${base}/says?${query}`, 2500);
    assert.equal(await browser.evaluate(`document.querySelector(".page-heading .post-meta")?.textContent`), `共 ${all.length} 条`, `旧的 ?${query} 链接显示全部`);
  }

  // 抽屉：右下角“全部 N 条”滑出全部句子；引文卡片右上角的“做成卡片”悬停才出现；Esc 关上
  await browser.goto(`${base}/says`, 3000);
  await click(".say-list-trigger");
  await sleep(700);
  // 贴着可视区右边（html 留着滚动条的位置，固定定位的可视区比 innerWidth 窄一条滚动条宽）
  const drawer = await browser.evaluate(`(() => { const r = document.querySelector(".say-drawer").getBoundingClientRect(); return { right: Math.round(r.right), edge: Math.round(document.querySelector(".say-drawer-viewport").getBoundingClientRect().right), open: document.querySelector(".say-drawer").checkVisibility() }; })()`);
  assert.ok(drawer.open && Math.abs(drawer.right - drawer.edge) <= 1, `抽屉从右边滑出、贴着右边（${drawer.right}/${drawer.edge}）`);
  const opacity = () => browser.evaluate(`getComputedStyle(document.querySelector(".say-drawer .say-card-button")).opacity`);
  assert.equal(await opacity(), "0", "引文卡片右上角的“做成卡片”平时藏着");
  await hover(".say-drawer .say-card");
  await sleep(300);
  assert.equal(await opacity(), "1", "悬停卡片时出现");
  await escape();
  await sleep(700);
  assert.equal(await browser.evaluate(`document.querySelector(".say-drawer").checkVisibility()`), false, "Esc 关上抽屉");

  // 金句卡片图：星旁边那句的“做成卡片”；弹窗用 Esc 关上后那句话的卡片还在
  await hover(`${layer()} .say-star[data-id="${ids[0]}"]`);
  await sleep(500);
  const drawn = (await sky()).reading;
  await click(`${layer()} .say-sky-card .btn`);
  await browser.evaluate(`new Promise((resolve) => { const check = () => document.querySelector(".say-card-preview img")?.naturalWidth ? resolve() : setTimeout(check, 100); check(); })`);
  const card = await browser.evaluate(`(() => {
    const img = document.querySelector(".say-card-preview img");
    const save = document.querySelector(".say-card-actions a[download]");
    return { size: [img.naturalWidth, img.naturalHeight], alt: img.alt, save: save && { href: save.href.startsWith("blob:"), name: save.getAttribute("download") } };
  })()`);
  assert.deepEqual(card.size, [1080, 1350], "金句卡片是 1080×1350 的竖图");
  assert.equal(card.alt, drawn, "卡片画的就是星旁边那句");
  assert.ok(card.save?.href && card.save.name.endsWith(".png"), "可以保存成 PNG");
  await escape();
  await sleep(400);
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".say-card-dialog"))`), false, "Esc 关掉卡片弹窗");
  assert.equal((await sky()).reading, drawn, "关掉弹窗后那句话的卡片还在");

  // 手机竖屏：竖排那份，点一颗星换句，那句话在星空底部、不出屏幕；“全部 N 条”在右上角
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/says`, 3000);
  const phone = await sky();
  assert.equal(phone.shape, "tall", "竖屏用竖排那份");
  assert.equal(phone.stars, all.length);
  await click(`.say-sky[data-shape="tall"] .say-star[data-id="${ids[0]}"]`);
  await sleep(600);
  const tapped = await sky();
  assert.equal(tapped.reading, textOf.get(ids[0]), "点一颗星换成那一句");
  assert.ok(tapped.card.left >= 0 && tapped.card.right <= 390 && Math.abs(tapped.card.bottom - (tapped.field.bottom - 16)) <= 2, "那句话在星空底部，不出屏幕");
  const trigger = await browser.evaluate(`(() => { const r = document.querySelector(".say-list-trigger").getBoundingClientRect(); return { top: r.top, right: r.right }; })()`);
  assert.ok(trigger.right <= 390 && Math.abs(trigger.top - tapped.field.top) <= 2, "“全部 N 条”在星空右上角");
  const emptyPhone = await browser.evaluate(`(() => { const r = ${visible()}.getBoundingClientRect(); for (let y = r.top + 60; y < r.bottom; y += 23) for (let x = r.left + 20; x < r.right; x += 37) { const el = document.elementFromPoint(x, y); if (el && !el.closest(".say-star, .say-sky-card, .say-list-trigger, a, button")) return { x, y }; } })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x: emptyPhone.x, y: emptyPhone.y, button: "left", clickCount: 1 });
  await sleep(300);
  assert.equal((await sky()).reading, undefined, "手机上点空白处卡片收起");

  // 调试页：5 / 60 / 240 句（横屏）都在画面里，可悬停的范围互不盖住，240 句能悬停到指定星（2026-11-02 用户：句子多了根本装不下）
  await browser.setViewport(1440, 900);
  await browser.goto(`${base}/debug`, 5000);
  const samples = await browser.evaluate(`[...document.querySelectorAll(".debug-say-sky")].map((box) => {
    const sky = box.querySelector('.say-sky[data-shape="wide"]');
    const field = sky.getBoundingClientRect();
    const stars = [...sky.querySelectorAll(".say-star")].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width / 2 }; });
    let gap = Infinity;
    for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) gap = Math.min(gap, Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y));
    return { count: Number(box.dataset.count), stars: stars.length, outside: stars.filter((star) => star.x < field.left || star.x > field.right || star.y < field.top || star.y > field.bottom).length, hit: stars[0].r, gap };
  })`);
  assert.deepEqual(samples.map((sample) => [sample.count, sample.stars]), [[5, 5], [60, 60], [240, 240]], "三份示例，每句一颗星");
  for (const sample of samples) {
    assert.equal(sample.outside, 0, `${sample.count} 句：星都在画面里`);
    assert.ok(sample.hit * 2 <= sample.gap + 0.5, `${sample.count} 句：可悬停的范围互不盖住（半径 ${sample.hit.toFixed(1)}px，最近 ${sample.gap.toFixed(1)}px）`);
  }
  await browser.evaluate(`document.querySelector('.debug-say-sky[data-count="240"] .say-field').scrollIntoView({ block: "center" })`);
  await sleep(400);
  const target = await browser.evaluate(`document.querySelectorAll('.debug-say-sky[data-count="240"] .say-sky[data-shape="wide"] .say-star')[100].dataset.id`);
  await hover(`.debug-say-sky[data-count="240"] .say-sky[data-shape="wide"] .say-star[data-id="${target}"]`);
  await sleep(600);
  assert.equal(await browser.evaluate(`document.querySelector('.debug-say-sky[data-count="240"] .say-sky[data-shape="wide"] .say-star[data-active]')?.dataset.id`), target, "240 句时也能悬停到指定的那颗星");

  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log(`PASS 一言：整屏星空铺满宽、每句一颗星、一开始不选中、悬停换句与星座亮起、离开停住、点别处和 Esc 收起、关弹窗卡片还在、无圆盘说明抽一句和列表、旧链接显示全部、抽屉全部句子与卡片按钮、金句卡片 1080×1350、手机竖排点星换句卡片在底部点别处收起、调试页 5/60/240 句都装得下且悬停不打架`);
} finally {
  await browser.close();
}
