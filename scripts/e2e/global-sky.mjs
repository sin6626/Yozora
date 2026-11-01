// 浏览器回归测试：全站一张夜空（2026-11-01 用户采用的方案，components/starfield.tsx）。
// ① 整站只有一张固定在视口后面的画布，在换页过渡（.site-page）之外，站内换页时是同一个元素、不重建；内页不再有 CSS 顶部星带；
// ② 首页第一屏是完整夜空：月亮悬停区域在右上方，画布连续绘制；
// ③ 往下滚、到内页是安静夜空：月亮隐去，有显卡时每秒只画约 15 帧，没有显卡加速（软件渲染）时只画一帧静止的；跳回首页恢复完整夜空。
// 先用默认无头浏览器（软件渲染 SwiftShader）测 ①②③ 的软件分支，再开 Metal 显卡测每秒约 15 帧（本机拿不到显卡时跳过这一段）。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";

// 2 秒内星空每秒调用了几次绘制
const drawsPerSecond = `(async () => {
  let count = 0;
  const proto = WebGLRenderingContext.prototype, original = proto.drawArrays;
  proto.drawArrays = function (...args) { count++; return original.apply(this, args); };
  await new Promise((done) => setTimeout(done, 2000));
  proto.drawArrays = original;
  return count / 2;
})()`;
const visibleMoons = `[...document.querySelectorAll(".moon-tip")].filter((el) => el.getBoundingClientRect().width > 0).length`;
const goTo = async (browser, href) => {
  await browser.evaluate(`document.querySelector('.site-header a[href="${href}"]').click()`);
  await sleep(2500);
  assert.equal(await browser.evaluate("location.pathname"), href, `站内跳到 ${href}`);
};
const renderer = (browser) => browser.evaluate(`(() => { const gl = document.createElement("canvas").getContext("webgl"); const info = gl?.getExtension("WEBGL_debug_renderer_info"); return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ""; })()`);
const software = (name) => /swiftshader|llvmpipe|software|basic render/i.test(name);

const report = [];
let browser = await openBrowser({ port: 9372 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`, 6000);
  assert.ok(software(await renderer(browser)), "默认无头浏览器应是软件渲染，才能测软件分支");

  const layer = await browser.evaluate(`(() => {
    const canvases = document.querySelectorAll("canvas.starfield");
    const canvas = canvases[0];
    canvas.dataset.testMark = "1";
    const tip = [...document.querySelectorAll(".moon-tip")].find((el) => el.getBoundingClientRect().width > 0)?.getBoundingClientRect();
    return {
      count: canvases.length,
      position: getComputedStyle(canvas).position,
      inPage: !!canvas.closest(".site-page"),
      tip: tip && { x: (tip.left + tip.width / 2) / innerWidth, y: (tip.top + tip.height / 2) / innerHeight, size: tip.width },
    };
  })()`);
  assert.equal(layer.count, 1, "全站只有一张星空画布");
  assert.equal(layer.position, "fixed", "画布固定在视口后面");
  assert.equal(layer.inPage, false, "画布在换页过渡层之外");
  assert.ok(layer.tip && layer.tip.x > 0.7 && layer.tip.y < 0.4 && layer.tip.size > 40, `首屏月亮在右上方：${JSON.stringify(layer.tip)}`);
  const homeDraws = await browser.evaluate(drawsPerSecond);
  assert.ok(homeDraws >= 10, `首屏完整夜空连续绘制：${homeDraws} 次/秒`);

  await goTo(browser, "/posts");
  const inner = await browser.evaluate(`({
    same: document.querySelector("canvas.starfield")?.dataset.testMark === "1",
    count: document.querySelectorAll("canvas.starfield").length,
    band: getComputedStyle(document.querySelector(".site-shell"), "::before").content,
  })`);
  assert.equal(inner.same, true, "站内换页后还是同一张画布，没有重建");
  assert.equal(inner.count, 1, "内页也只有一张画布");
  assert.equal(inner.band, "none", "内页不再有 CSS 顶部星带");
  assert.equal(await browser.evaluate(visibleMoons), 0, "内页看不到月亮悬停区域");
  const stillDraws = await browser.evaluate(drawsPerSecond);
  assert.equal(stillDraws, 0, `软件渲染时内页安静夜空静止不画：${stillDraws} 次/秒`);

  await goTo(browser, "/");
  const backDraws = await browser.evaluate(drawsPerSecond);
  assert.ok(backDraws >= 10, `跳回首页恢复完整夜空：${backDraws} 次/秒`);
  assert.deepEqual(browser.errors, [], "没有页面报错");
  report.push(`软件渲染 首屏 ${homeDraws}/内页 ${stillDraws}/回首页 ${backDraws} 次/秒`);
} finally {
  browser.close();
}

browser = await openBrowser({ port: 9372, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`, 6000);
  if (software(await renderer(browser))) {
    report.push("拿不到显卡，跳过每秒 15 帧检查");
  } else {
    const home = await browser.evaluate(drawsPerSecond);
    await browser.evaluate("window.scrollTo(0, 1100)");
    await sleep(1500);
    const scrolled = await browser.evaluate(drawsPerSecond);
    await browser.evaluate("window.scrollTo(0, 0)");
    await sleep(500);
    await goTo(browser, "/posts");
    const inner = await browser.evaluate(drawsPerSecond);
    assert.ok(home >= 30, `首屏每帧都画：${home} 次/秒`);
    for (const [name, value] of [["首页滚下去", scrolled], ["内页", inner]]) assert.ok(value >= 5 && value <= 20, `${name}安静夜空约每秒 15 帧：${value} 次/秒`);
    assert.deepEqual(browser.errors, [], "没有页面报错");
    report.push(`显卡 首屏 ${home}/滚下去 ${scrolled}/内页 ${inner} 次/秒`);
  }
} finally {
  browser.close();
}
console.log(`PASS 全站星空：${report.join("；")}`);
