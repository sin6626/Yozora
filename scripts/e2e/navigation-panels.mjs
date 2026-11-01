// 浏览器回归测试：顶部导航的悬停面板（2026-10-28 仿 Innei 的面板式导航）。
// 检查：① 一级导航的顺序；② 悬停首页、文章、手记、时间线、更多都会弹出对应面板；
// ③ 首页面板“此间”的篇数和字数不是 0（Core 的 site_info 字段经 SDK 转成驼峰，读错字段名时会全是 0）；
// ④ 文章面板里鼠标移到另一个分类，右边的“X · 最近”跟着换；⑤ 弹层背景真的有模糊（backdrop-filter 曾被构建工具吞掉）；
// ⑦ 时间线面板里鼠标移到“手记”，右边换成“手记 · 最近”且只列手记（曾经右边固定是混排的近期动态，悬停不变）；
// ⑥ 五个面板里的每个链接打开后都不是站内 404（手记面板的话题链接曾用话题名拼地址，而手记页按 slug 筛选，结果全是 404）；
// ⑧ 首页面板在页面很多时分栏、不会拉得很长（/debug 的示例）；⑨ 分栏时悬停底色和箭头不碰到邻栏。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9337 });

// 鼠标先停在导航下方再移到触发器上，等面板弹出并完成尺寸过渡
async function hover(label) {
  const [x, y] = await browser.evaluate(`(() => {
    const trigger = [...document.querySelectorAll(".navigation-List .navigation-Trigger")].find((t) => t.textContent.trim().startsWith(${JSON.stringify(label)}));
    const r = trigger.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y + 80 });
  await sleep(600);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(900);
}

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/notes`);
  const order = await browser.evaluate(`[...document.querySelectorAll(".navigation-List .navigation-Trigger")].map((t) => t.textContent.trim()).filter((t) => t !== "调试")`);
  assert.deepEqual(order, ["首页", "文章", "手记", "时间线", "碎碎念", "更多"], `导航顺序不对：${order.join(" / ")}`);

  const panels = { 首页: "is-home", 文章: "is-posts", 手记: "is-notes", 时间线: "is-timeline", 更多: "is-more" };
  const hrefs = new Map();
  for (const [label, className] of Object.entries(panels)) {
    await hover(label);
    assert.equal(await browser.evaluate(`!!document.querySelector(".navigation-Popup .nav-panel.${className}")`), true, `悬停“${label}”没有弹出面板`);
    // 串门（/visit）在新标签页打开、会跳到朋友的站，不在这里逐个打开
    for (const href of await browser.evaluate(`[...document.querySelectorAll(".navigation-Popup .nav-panel a[href^='/']:not([target='_blank'])")].map((a) => a.getAttribute("href"))`)) hrefs.set(href, label);
  }

  // 更多（2026-11-01 重做，原来的说明和排版跟 Innei 的站重了）：两列小格子 + 串门，说明是自己的话
  await hover("更多");
  const more = await browser.evaluate(`[...document.querySelectorAll(".navigation-Popup .nav-more-link")].map((a) => ({ text: a.innerText.replace(/\\s+/g, " ").trim(), href: a.getAttribute("href"), target: a.target, icon: Boolean(a.querySelector(".nav-more-icon svg")) }))`);
  assert.deepEqual(more.map((item) => item.text), ["作品 夜里敲出来的小东西", "友链 夜空里的邻居们", "一言 朋友们说过的好句子", "思考 读到什么，想到什么", "串门 随机敲开一位朋友的门"], "更多面板的五项和说明");
  assert.ok(more.every((item) => item.icon), "每一项都有图标");
  assert.deepEqual([more.at(-1).href, more.at(-1).target], ["/visit", "_blank"], "串门在新标签页打开 /visit");
  const friends = new Set(((await (await fetch(`${process.env.API_URL ?? "http://127.0.0.1:2333"}/links/all`)).json()).data ?? [])
    .filter((link) => !link.hide && link.state === 0 && link.type === 0).map((link) => new URL(link.url).href));
  const visit = await fetch(`${base}/visit`, { redirect: "manual" });
  assert.equal(visit.status, 307, "/visit 是一次跳转");
  assert.ok(friends.size === 0 || friends.has(visit.headers.get("location")), `串门跳到已通过的朋友的站（实际 ${visit.headers.get("location")}）`);

  await hover("首页");
  // 首页面板（2026-10-31 改为海报大字）：左边旧式数字的“第几夜”，篇数、字数在它下面上下排开（也是旧式数字）；右边页面带后台填的副标题
  const home = await browser.evaluate(`(async () => {
    const count = document.querySelector(".nav-night-count b");
    await document.fonts.ready;
    const stats = [...document.querySelectorAll(".navigation-Popup .nav-night-stat")];
    const rows = [count, ...stats].map((el) => el.getBoundingClientRect());
    return {
      nights: Number(count.textContent),
      font: getComputedStyle(count).fontFamily,
      statFonts: stats.map((stat) => getComputedStyle(stat.querySelector("b")).fontFamily),
      oldstyle: [...document.fonts].some((font) => font.family.includes("Cormorant") && font.status === "loaded"),
      foot: stats.map((stat) => stat.textContent),
      stacked: rows.every((rect, i) => i === 0 || rect.top >= rows[i - 1].bottom),
      pages: [...document.querySelectorAll(".navigation-Popup .nav-home-page")].map((page) => page.textContent),
    };
  })()`);
  assert.ok(home.nights > 0, `“第几夜”的数字不对：${home.nights}`);
  assert.ok(/Cormorant/.test(home.font) && home.oldstyle, `“第几夜”应使用旧式数字字体：${home.font}`);
  assert.ok(home.foot.length === 2 && home.foot.every((text) => /\d/.test(text)), `应有篇数与字数：${JSON.stringify(home.foot)}`);
  assert.ok(home.stacked, `“第几夜”、篇数、字数应上下排开：${JSON.stringify(home.foot)}`);
  assert.ok(home.statFonts.every((font) => /Cormorant/.test(font)), `篇数、字数也应使用旧式数字：${home.statFonts}`);
  assert.ok(home.pages.length > 0, "首页面板应列出后台页面");
  assert.notEqual(await browser.evaluate(`getComputedStyle(document.querySelector(".navigation-Popup")).backdropFilter`), "none", "弹层背景没有模糊");

  await hover("文章");
  const before = await browser.evaluate(`document.querySelector(".is-posts .nav-panel-main .nav-panel-label").textContent`);
  const [cx, cy, name] = await browser.evaluate(`(() => {
    const items = [...document.querySelectorAll(".is-posts .nav-categories li")];
    const other = items.find((li) => !li.hasAttribute("data-highlighted"));
    const r = other.getBoundingClientRect();
    return [r.x + 30, r.y + r.height / 2, other.querySelector(".nav-category-name").textContent];
  })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy });
  await sleep(400);
  const after = await browser.evaluate(`document.querySelector(".is-posts .nav-panel-main .nav-panel-label").textContent`);
  assert.equal(after, `${name} · 最近`, `移到“${name}”后右边没有跟着换（之前是 ${before}）`);

  await hover("时间线");
  const [tx, ty] = await browser.evaluate(`(() => {
    const item = [...document.querySelectorAll(".is-timeline .nav-categories li")].find((li) => li.textContent.includes("手记"));
    const r = item.getBoundingClientRect();
    return [r.x + 30, r.y + r.height / 2];
  })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: tx, y: ty });
  await sleep(400);
  const timeline = await browser.evaluate(`({
    label: document.querySelector(".is-timeline .nav-panel-main .nav-panel-label").textContent,
    hrefs: [...document.querySelectorAll(".is-timeline .nav-entries a")].map((a) => a.getAttribute("href")),
  })`);
  assert.equal(timeline.label, "手记 · 最近", `时间线面板悬停“手记”后右边没有切换（还是 ${timeline.label}）`);
  assert.ok(timeline.hrefs.length && timeline.hrefs.every((href) => href.startsWith("/notes/")), `时间线面板“手记”下混进了别的内容：${timeline.hrefs.join(", ")}`);

  // 逐个整页打开面板里的站内链接，正文不能是站内 404（app/not-found.tsx 的 .empty-state，状态码仍可能是 200，所以看正文）
  const broken = [];
  for (const [href, label] of hrefs) {
    await browser.goto(base + href, 1500);
    if (await browser.evaluate(`!!document.querySelector(".site-content .empty-state")`)) broken.push(`${label}：${decodeURIComponent(href)}`);
  }
  assert.deepEqual(broken, [], `面板里有链接打开是 404：${broken.join("；")}`);

  // ⑧ 页面和社交账号多了以后（/debug 的三份真实 HomePanel：2 / 12 / 18 个页面），页面分 1 / 2 / 3 栏，面板变宽而不是一直往下拉长
  await browser.goto(`${base}/debug`, 2500);
  const grow = await browser.evaluate(`[...document.querySelectorAll(".debug-home-panel")].map((box) => {
    const pages = box.querySelector(".nav-home-pages");
    return { pages: pages.children.length, columns: getComputedStyle(pages).gridTemplateColumns.split(" ").length, height: Math.round(box.getBoundingClientRect().height) };
  })`);
  assert.deepEqual(grow.map(({ columns }) => columns), [1, 2, 3], `首页面板的页面没有随数量分栏：${JSON.stringify(grow)}`);
  for (const panel of grow) assert.ok(panel.height < 520, `${panel.pages} 个页面时面板高 ${panel.height}px，太高了`);

  // ⑨ 分栏时鼠标停在左栏一格：它的悬停底色和箭头不能碰到右边那一栏（曾因列间距变量不存在，两栏紧贴，箭头贴着右栏的字）
  const [hx, hy] = await browser.evaluate(`(() => {
    const item = document.querySelectorAll(".debug-home-panel")[1].querySelectorAll(".nav-home-page")[2];
    item.scrollIntoView({ block: "center" });
    const r = item.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hx, y: hy });
  await sleep(400);
  const touch = await browser.evaluate(`(() => {
    const items = document.querySelectorAll(".debug-home-panel")[1].querySelectorAll(".nav-home-page");
    const [hovered, neighbor] = [items[2], items[3]];
    const box = hovered.getBoundingClientRect();
    const arrow = hovered.querySelector("svg");
    return {
      arrowShown: Number(getComputedStyle(arrow).opacity) > 0.9,
      boxGap: Math.round(neighbor.getBoundingClientRect().left - box.right),
      arrowGap: Math.round(neighbor.querySelector(".nav-home-page-title").getBoundingClientRect().left - arrow.getBoundingClientRect().right),
    };
  })()`);
  assert.ok(touch.arrowShown, "悬停那一格应显示箭头");
  assert.ok(touch.boxGap >= 4, `悬停底色碰到了右边一栏（间隔 ${touch.boxGap}px）`);
  assert.ok(touch.arrowGap >= 16, `箭头离右边一栏的字太近（${touch.arrowGap}px）`);

  console.log(`PASS 面板内 ${hrefs.size} 个链接都能打开；导航顺序、五个悬停面板、第 ${home.nights} 夜（旧式数字）、${home.foot.join(" · ")}、弹层模糊、文章面板随分类切换（${before} → ${after}）、首页面板 ${grow.map(({ pages, columns, height }) => `${pages} 页 ${columns} 栏 ${height}px`).join(" / ")}、悬停箭头离邻栏 ${touch.arrowGap}px`);
} finally {
  browser.close();
}
