// 浏览器回归测试：页头“夜航岛”（components/site-header.tsx）的几种状态。
// 顶部铺开（bar）；往下滚后——列表等普通页面保持深色导航条（expanded，导航一直可点），
// 阅读页（文章/手记/页面详情）收成“标题 + 阅读进度环”的小胶囊（compact），鼠标移上展开、移开收回；
// 在 /debug 播报一条活动（activity），播完缩回。（2026-10-29 用户定：只有真正在读时才收拢）
// 2026-10-28 的 bug：用鼠标点过页头里的东西（导航链接、主题按钮）后焦点留在页头，岛把“页头内有焦点”当成展开条件，
// 之后往下读文章时一直是展开状态、不收成标题 + 进度环。现在只有键盘聚焦（:focus-visible）才展开。
// 2026-10-29 的 bug：鼠标点过页头后，用键盘切到别的软件再切回（⌘+Tab、截图快捷键），浏览器把焦点还回来，
// 而且因为最后一次操作是键盘，这次聚焦算作 :focus-visible，岛又卡在展开。现在键盘聚焦只认 Tab 键，窗口失焦时清掉展开状态。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9339 });
const island = () => browser.evaluate(`(() => {
  const header = document.querySelector(".site-header");
  const rect = document.querySelector(".island").getBoundingClientRect();
  return { mode: header.dataset.mode, x: rect.x, width: Math.round(rect.width), navVisible: document.querySelector(".island .navigation-List").checkVisibility(), text: document.querySelector(".island").innerText };
})()`);
const move = (x, y) => browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
// 在页面里逐帧记录岛的状态（data-mode、是否在“先淡出”、是否裁切、导航的不透明度），用来检查变形过程
const startSampling = () => browser.evaluate(`(() => {
  window.__samples = [];
  const t0 = performance.now();
  const tick = () => {
    const header = document.querySelector(".site-header");
    const island = document.querySelector(".island");
    const nav = document.querySelector(".island-nav");
    window.__samples.push({
      t: Math.round(performance.now() - t0),
      mode: header.dataset.mode,
      fading: header.hasAttribute("data-fading"),
      clipped: getComputedStyle(island).overflow.includes("clip") || getComputedStyle(island).overflow.includes("hidden"),
      navOpacity: nav.checkVisibility() ? Number(getComputedStyle(nav).opacity) : 0,
    });
    if (performance.now() - t0 < 700) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
const samples = () => browser.evaluate("window.__samples");

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/posts`);
  const bar = await island();
  assert.equal(bar.mode, "bar");
  assert.ok(bar.navVisible, "顶部时导航应当可见");

  // 列表页往下滚：保持深色导航条，导航一直可见
  await browser.evaluate("scrollTo(0, 500)");
  await sleep(900);
  const listBar = await island();
  assert.equal(listBar.mode, "expanded", `列表页往下滚应当保持导航条（现在是 ${listBar.mode}）`);
  assert.ok(listBar.navVisible, "列表页往下滚时导航应当可见");

  // 阅读页：先在顶部用真实鼠标点两下主题按钮（焦点留在按钮上），再按一下 ⌘ 模拟切走、让焦点回到按钮，然后往下读
  await browser.goto(`${base}/timeline/posts`, 3000);
  const post = await browser.evaluate(`document.querySelector(".timeline-list a").getAttribute("href")`);
  await browser.goto(base + post);
  const [tx, ty] = await browser.evaluate(`(() => { const r = document.querySelector(".theme-toggle").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await move(tx, ty);
  for (let i = 0; i < 2; i++) {
    for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x: tx, y: ty, button: "left", clickCount: 1 });
    await sleep(700);
  }
  await move(960, 700);
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Meta", code: "MetaLeft", windowsVirtualKeyCode: 91 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Meta", code: "MetaLeft", windowsVirtualKeyCode: 91 });
  await browser.evaluate(`(() => { const el = document.activeElement; el.blur(); el.focus(); })()`);
  await browser.evaluate("scrollTo(0, document.documentElement.scrollHeight * 0.4)");
  await sleep(1200);
  const compact = await island();
  assert.equal(compact.mode, "compact", "阅读页往下读应当收成胶囊（点过页头按钮、切走再切回也一样）");
  // 标题最长 260px（超出省略），胶囊最宽约 470px；页头铺开时开发环境约 933px。原来按“不到一半”判断，只在最新文章标题很短时成立
  assert.ok(compact.width < bar.width * 0.6 && !compact.navVisible, `阅读时的胶囊应当窄且不显示导航（宽 ${compact.width}，铺开 ${bar.width}）`);
  const reading = await browser.evaluate(`({ text: document.querySelector(".island-context")?.innerText ?? "", ring: !!document.querySelector(".island-ring"), title: document.querySelector(".post-detail-title").textContent })`);
  assert.ok(reading.ring && reading.text.includes(reading.title.slice(0, 6)), `读文章时胶囊应显示标题和进度环：${reading.text}`);

  // 变大：外框撑开时内容被裁切、还在淡入，不会露到胶囊外面
  await startSampling();
  await move(compact.x + compact.width / 2, 30);
  await sleep(900);
  const growing = (await samples()).filter((sample) => sample.mode === "expanded").slice(0, 4);
  assert.ok(growing.length && growing.some((sample) => sample.clipped), `展开变形时应当裁切内容：${JSON.stringify(growing)}`);
  assert.ok(growing[0].navOpacity < 0.6, `展开一开始导航应当还在淡入（不透明度 ${growing[0].navOpacity}）`);
  const expanded = await island();
  assert.equal(expanded.mode, "expanded", "鼠标移上胶囊应当展开");
  assert.ok(expanded.navVisible, "展开后导航应当可见");

  // 变小：先在原来的大小里把导航淡出，再收拢，不会出现空着的长黑条
  await startSampling();
  await move(960, 700);
  await sleep(900);
  const shrinking = await samples();
  const firstCompact = shrinking.findIndex((sample) => sample.mode === "compact");
  assert.ok(firstCompact > 0 && shrinking.slice(0, firstCompact).some((sample) => sample.fading), `收拢前应当先淡出旧内容：${JSON.stringify(shrinking.slice(0, firstCompact + 1))}`);
  assert.equal((await island()).mode, "compact", "鼠标移开后应当收回");

  await browser.goto(`${base}/debug`);
  await browser.evaluate(`[...document.querySelectorAll("li")].find((li) => li.querySelector("h2")?.textContent === "页头夜航岛").querySelector("button").click()`);
  await sleep(500);
  const activity = await island();
  assert.equal(activity.mode, "activity", "播报活动时应当变形");
  assert.match(activity.text, /一条示例活动/);
  // 播报左边是按类型着色的圆角方块 + 实心图标（2026-10-29 重做；曾因 globals.css 没重新编译而颜色变量缺失、图标变成白色）
  const tile = await browser.evaluate(`(() => { const icon = document.querySelector(".island-activity-icon"); const style = getComputedStyle(icon); return { svg: !!icon.querySelector("svg"), color: style.color, background: style.backgroundColor, fg: getComputedStyle(document.querySelector(".island-activity-text strong")).color }; })()`);
  assert.ok(tile.svg && tile.color !== tile.fg && !/rgba\(0, 0, 0, 0\)|transparent/.test(tile.background), `播报图标应当有类型颜色和底色：${JSON.stringify(tile)}`);
  await sleep(3500);
  assert.notEqual((await island()).mode, "activity", "活动播完应当缩回");

  console.log(`PASS 夜航岛：铺开 ${bar.width}px；列表页往下滚保持导航条 ${listBar.width}px；读文章收成 ${compact.width}px（标题 + 进度环）→ 悬停展开 ${expanded.width}px → 收回；活动播报后缩回`);
} finally {
  browser.close();
}
