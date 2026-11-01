// 浏览器回归测试：首页入场动画与强调字（2026-10-31 与用户约定）。
// ① 首屏：标题两行、说明、社交图标、头像、底部依次上浮对焦（home-hero-rise），强调字“Sin”“大三学生”最后亮起（home-hero-light），播完后完全不透明；
// ② 首页下半部分：带 data-reveal 的块一开始是 waiting（几乎透明），第一次滚进视野才变 shown 并播放；再滚走、滚回来不重播（Motion 的 once）；
// ③ 换页面再回来重置：站内跳到文章页再回首页，下半部分回到 waiting、首屏动画重新开始；
// ④ 减少动态效果时什么都不藏、不播；⑤ 开灯时“大三学生”用粗体（700），光晕不是白色（白色光晕在浅色天空上看不见）。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9371 });

const hero = () => browser.evaluate(`(() => {
  const page = [...document.querySelectorAll(".home-hero")].find((el) => el.offsetParent !== null);
  const names = (el) => el ? el.getAnimations().map((a) => a.animationName) : [];
  const emphasis = page.querySelector(".home-hero-title > strong");
  return {
    title: [...page.querySelectorAll(".home-hero-title > span, .home-hero-title > strong")].map(names),
    description: names(page.querySelector(".home-hero-description")),
    avatar: names(page.querySelector(".home-hero-avatar")),
    bottom: names(page.querySelector(".home-hero-bottom")),
    name: names(page.querySelector(".home-hero-name")),
    emphasis: names(emphasis),
    riseTime: page.querySelector(".home-hero-description").getAnimations()[0]?.currentTime ?? null,
    opacity: getComputedStyle(page.querySelector(".home-hero-title > span")).opacity,
    finished: page.getAnimations({ subtree: true }).filter((a) => /home-hero-(rise|light|sky)/.test(a.animationName)).every((a) => a.playState === "finished"),
    weight: getComputedStyle(emphasis).fontWeight,
    shadow: getComputedStyle(emphasis).textShadow,
  };
})()`);
const room = () => browser.evaluate(`(() => {
  const page = [...document.querySelectorAll(".home-room")].find((el) => el.offsetParent !== null);
  const items = [...page.querySelectorAll("[data-reveal]")];
  return {
    count: items.length,
    states: items.map((el) => el.dataset.revealState ?? "none"),
    hidden: items.filter((el) => Number(getComputedStyle(el).opacity) < 0.01).length,
    // 左栏（文章、手记）里完整落在视野内、不在页面底部 10% 的条目；右栏的碎碎念和最近发生的事在各自的滚动框里，可能被框裁掉，不算
    inView: [...page.querySelectorAll(".home-main [data-reveal]")].filter((el) => { const r = el.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight * 0.9; }).map((el) => ({ state: el.dataset.revealState, opacity: Number(getComputedStyle(el).opacity), start: el.getAnimations().find((a) => a.animationName === "home-reveal")?.startTime ?? null })),
  };
})()`);
const scrollTo = async (y) => { await browser.evaluate(`window.scrollTo(0, ${y})`); await sleep(1500); };

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`);

  const first = await hero();
  assert.ok(first.title.every((list) => list.includes("home-hero-rise")), `标题每一块都应有入场上浮：${JSON.stringify(first.title)}`);
  for (const key of ["description", "avatar", "bottom"]) assert.ok(first[key].includes("home-hero-rise"), `${key} 应有入场上浮：${JSON.stringify(first[key])}`);
  assert.ok(first.name.includes("home-hero-light") && first.emphasis.includes("home-hero-light"), `强调字应在最后亮起：${JSON.stringify([first.name, first.emphasis])}`);
  assert.ok(first.finished && first.opacity === "1", `入场应在几秒内播完、标题完全不透明：${JSON.stringify({ finished: first.finished, opacity: first.opacity })}`);

  const before = await room();
  assert.ok(before.count >= 8, `首页下半部分应标了 data-reveal：${before.count}`);
  assert.ok(before.states.every((state) => state === "waiting") && before.hidden === before.count, `滚到之前都应是 waiting 且几乎透明：${JSON.stringify(before)}`);

  await scrollTo(1000);
  const shown = await room();
  assert.ok(shown.inView.length > 0 && shown.inView.every((item) => item.state === "shown" && item.opacity === 1), `滚进视野后应出现：${JSON.stringify(shown.inView)}`);
  await scrollTo(0);
  await scrollTo(1000);
  const again = await room();
  // 动画重播会换一个开始时间；开始时间不变说明还是第一次那一遍
  assert.deepEqual(again.inView.map((item) => item.start), shown.inView.map((item) => item.start), "再滚回来不应重播（once）");
  assert.ok(again.inView.every((item) => item.state === "shown"), "再滚回来仍是 shown");

  // 换页面再回来：站内跳转，Next 用 Activity 把首页藏起来，再显示时要重置
  await scrollTo(0);
  await browser.evaluate(`document.querySelector('.navigation-List a[href="/posts"]').click()`);
  await sleep(2500);
  await browser.evaluate(`document.querySelector('.navigation-List a[href="/"]').click()`);
  await sleep(300);
  const back = await hero();
  assert.ok(back.riseTime !== null && back.riseTime < 1500, `回到首页后首屏动画应重新开始：${back.riseTime}`);
  await sleep(1500);
  const backRoom = await room();
  assert.ok(backRoom.states.every((state) => state === "waiting"), `回到首页后下半部分应重置为 waiting：${JSON.stringify(backRoom.states)}`);

  // 开灯：粗体 + 不是白色的光晕
  await browser.evaluate(`localStorage.setItem("theme", "light")`);
  await browser.goto(`${base}/`);
  await sleep(1500);
  const light = await hero();
  assert.equal(light.weight, "700", "开灯时“大三学生”应是粗体");
  assert.ok(light.shadow !== "none" && !/rgba?\(255, 255, 255/.test(light.shadow), `开灯时光晕不应是白色：${light.shadow}`);
  await browser.evaluate(`localStorage.removeItem("theme")`);

  // 减少动态效果：不藏、不播
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(`${base}/`);
  const reduced = await room();
  assert.equal(reduced.hidden, 0, `减少动态效果时不应藏起任何块：${JSON.stringify(reduced)}`);

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 首屏逐行入场、强调字最后亮起；下半部分 ${before.count} 块滚到才出现且只播一次；换页回来重置；开灯粗体 + 有色光晕（${light.shadow}）；减少动态效果时不藏`);
} finally {
  browser.close();
}
