// 浏览器回归测试：夜航岛在“顶部铺开 ↔ 深色导航条”“顶部铺开 ↔ 阅读胶囊”之间切换时不弹跳（2026-11-01 用户录屏反馈）。
// 原因有两个：深色导航条和阅读胶囊里头像用 CSS 直接从 32px 换成 28px，在外框开始变形前就跳一下（右边的东西跟着瞬移 4px）；
// 外框的弹簧带一点回弹，会冲过头再退回来。逐帧记录切换过程：头像大小始终不变，外框的位置和大小只朝一个方向走。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9375 });
const record = (y) => browser.evaluate(`(async () => {
  const frames = [];
  const island = document.querySelector(".island");
  const avatar = document.querySelector(".site-brand-avatar");
  const t0 = performance.now();
  window.scrollTo(0, ${y});
  await new Promise((resolve) => {
    const tick = () => {
      const r = island.getBoundingClientRect();
      const a = avatar.getBoundingClientRect();
      frames.push({ mode: document.querySelector(".site-header").dataset.mode, x: r.x, y: r.y, width: r.width, height: r.height, avatar: Math.round(a.width * 10) / 10 });
      if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  return frames;
})()`);
// 一组数从起点走到终点，中途不能往回退（容差 0.15px）
const monotonic = (values) => {
  const direction = Math.sign(values.at(-1) - values[0]);
  return values.every((value, i) => i === 0 || direction * (value - values[i - 1]) >= -0.15);
};
const check = async (label, y, expected) => {
  const frames = await record(y);
  assert.equal(frames.at(-1).mode, expected, `${label}：切换到 ${expected}`);
  const sizes = [...new Set(frames.map((f) => f.avatar))];
  assert.deepEqual(sizes, [frames[0].avatar], `${label}：头像大小不应当突变（实际 ${sizes.join(" → ")}px）`);
  for (const key of ["x", "y", "width", "height"]) {
    const values = frames.map((f) => f[key]);
    assert.ok(monotonic(values), `${label}：外框 ${key} 冲过头又退回（${values.map((v) => v.toFixed(1)).join(" ")}）`);
  }
};

try {
  await browser.setViewport(1280, 800);
  await browser.goto(`${base}/posts`);
  await check("列表页往下滚", 900, "expanded");
  await sleep(500);
  await check("列表页回到顶部", 0, "bar");

  const article = await browser.evaluate(`[...document.querySelectorAll('a[href*="/posts/"]')].map((a) => a.getAttribute("href")).find((href) => href.split("/").length >= 4)`);
  await browser.goto(`${base}${article}`);
  await check("文章往下读", 1200, "compact");
  await sleep(500);
  await check("文章回到顶部", 0, "bar");

  // 2026-11-04 用户要求：页头头像外面不要光圈（原来是一圈月光色细线 + 柔光，悬停更亮）。顶部铺开、往下滚的导航条、鼠标停在头像上都没有
  const avatarShadow = () => browser.evaluate(`getComputedStyle(document.querySelector(".site-header .site-brand-avatar")).boxShadow`);
  await browser.goto(`${base}/posts`);
  await sleep(800);
  const shadows = [await avatarShadow()];
  const avatar = JSON.parse(await browser.evaluate(`JSON.stringify(document.querySelector(".site-header .site-brand-avatar").getBoundingClientRect())`));
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: avatar.x + avatar.width / 2, y: avatar.y + avatar.height / 2 });
  await sleep(500);
  shadows.push(await avatarShadow());
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 600 });
  await browser.evaluate(`window.scrollTo(0, 900)`);
  await sleep(900);
  shadows.push(await avatarShadow());
  assert.deepEqual(shadows, ["none", "none", "none"], `页头头像外面不应当有光圈：${shadows.join(" | ")}`);

  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log("PASS 夜航岛切换不弹跳：头像大小不变，外框位置和大小单向变化（列表页导航条、文章阅读胶囊，往返）；页头头像没有光圈（铺开、悬停、导航条）");
} finally {
  await browser.close();
}
