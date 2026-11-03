// 浏览器回归测试：“今晚的天空”面板（components/sky-menu.tsx，2026-11-03 在 /debug 做给用户看的页头候选）。
// ① 面板只有三块小天空，按 夜紫 / 银河 / 墨黑 排，没有浅色 / 深色开关（那是旁边月亮按钮的事，用户 11-03 要求去掉）；
// ② 点一块天空：<html data-palette> 换掉（夜紫是去掉）、记进 sessionStorage、显示选中，背景星空真的换了颜色（量截图里的天空），深浅不变；
// ③ 望远镜按钮打开真实浮层，读屏名字里有当前配色，方向键换配色，Esc 关；④ 刷新后配色还在；无页面报错。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9392 });

const panel = () => browser.evaluate(`(() => {
  const panel = document.querySelector(".debug-sky .sky-panel");
  return {
    options: [...panel.querySelectorAll(".sky-option")].map((option) => ({ sky: option.dataset.sky, name: option.querySelector(".sky-name").textContent, checked: option.getAttribute("aria-checked") === "true" })),
    radios: panel.querySelectorAll('[role="radio"]').length,
  };
})()`);
const state = () => browser.evaluate(`({ palette: document.documentElement.dataset.palette ?? null, stored: sessionStorage.getItem("palette"), theme: document.documentElement.dataset.theme, storedTheme: localStorage.getItem("theme") })`);
const pick = async (sky) => {
  await browser.evaluate(`document.querySelector('.debug-sky .sky-panel [data-sky="${sky}"]').click()`);
  await sleep(1200);
};
// 正文左边空白处的天空（全站固定画布）在截图里的平均颜色
const skyColor = async () => {
  const png = (await browser.send("Page.captureScreenshot", { format: "png" })).result.data;
  return browser.evaluate(`(async () => {
    const image = new Image();
    image.src = "data:image/png;base64,${png}";
    await image.decode();
    const canvas = new OffscreenCanvas(300, 300);
    const context = canvas.getContext("2d");
    context.drawImage(image, 40, 600, 300, 300, 0, 0, 300, 300);
    const { data } = context.getImageData(0, 0, 300, 300);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
    return sum.map((value) => Math.round(value / (data.length / 4)));
  })()`);
};
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/debug?palette=night`);
  await browser.evaluate(`localStorage.removeItem("theme"); document.querySelector("#debug-sky").scrollIntoView({ block: "center" })`);
  await sleep(1500);

  const first = await panel();
  assert.deepEqual(first.options.map((option) => option.sky), ["night", "galaxy", "ink"], "顺序：夜紫、银河、墨黑");
  assert.deepEqual(first.options.map((option) => option.name), ["夜紫", "银河", "墨黑"]);
  assert.ok(first.options[0].checked && !first.options[1].checked, `一开始是夜紫：${JSON.stringify(first.options)}`);
  assert.equal(first.radios, 3, "面板里只有三块天空，没有浅色 / 深色开关");

  const nightSky = await skyColor();
  await pick("galaxy");
  assert.deepEqual(await state(), { palette: "galaxy", stored: "galaxy", theme: "dark", storedTheme: null }, "换配色不动深浅");
  assert.ok((await panel()).options[1].checked, "显示银河选中");
  const galaxySky = await skyColor();
  assert.ok(distance(nightSky, galaxySky) > 6, `背景星空要跟着换：夜紫 ${nightSky} → 银河 ${galaxySky}`);

  await pick("ink");
  assert.equal((await state()).palette, "ink");
  const inkSky = await skyColor();
  assert.ok(distance(galaxySky, inkSky) > 6, `银河 ${galaxySky} → 墨黑 ${inkSky}`);

  await browser.goto(`${base}/debug`);
  assert.equal((await state()).palette, "ink", "刷新后配色还在");
  await browser.evaluate(`document.querySelector("#debug-sky").scrollIntoView({ block: "center" })`);
  await sleep(800);

  await pick("night");
  assert.equal((await state()).palette, null, "夜紫是去掉 data-palette");

  // 真实浮层：望远镜按钮的读屏名字带当前配色；打开后焦点进面板，方向键换配色，Esc 关
  const label = await browser.evaluate(`document.querySelector(".debug-sky .sky-trigger").getAttribute("aria-label")`);
  assert.equal(label, "今晚的天空：夜紫");
  await browser.evaluate(`document.querySelector(".debug-sky .sky-trigger").click()`);
  await sleep(500);
  assert.ok(await browser.evaluate(`!!document.querySelector(".sky-positioner .sky-popup")`), "点按钮打开浮层");
  await browser.evaluate(`document.querySelector('.sky-positioner [data-sky="night"]').focus()`);
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await sleep(1000);
  assert.equal((await state()).palette, "galaxy", "方向键换到下一套");
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(500);
  assert.ok(await browser.evaluate(`!document.querySelector(".sky-positioner .sky-popup")`), "Esc 关掉浮层");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 今晚的天空：三块天空的顺序、没有深浅开关、点选换 data-palette 并记住且不动深浅、背景星空跟着换（夜紫 ${nightSky} → 银河 ${galaxySky} → 墨黑 ${inkSky}）、真实浮层读屏名字、方向键换配色、Esc 关闭`);
} finally {
  await browser.evaluate(`sessionStorage.setItem("palette", "night"); localStorage.removeItem("theme")`).catch(() => {});
  browser.close();
}
