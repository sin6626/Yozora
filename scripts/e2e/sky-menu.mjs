// 浏览器回归测试：“今晚的天空”面板（components/sky-menu.tsx，2026-11-03 在 /debug 做给用户看的页头候选）。
// ① 两种面板（小天空预览、文字列表）都按 夜紫 / 银河 / 墨黑 排，列表版每项有一句说明；
// ② 点一块天空：<html data-palette> 换掉（夜紫是去掉）、记进 sessionStorage、两份面板一起显示选中，背景星空真的换了颜色（量截图里的天空）；
// ③ 浅色 / 深色两段开关改 data-theme 和 localStorage；④ 页面上的月亮按钮打开真实浮层，读屏名字里有当前配色，方向键换配色，Esc 关；
// ⑤ 刷新后配色还在；无页面报错。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9392 });

const panels = () => browser.evaluate(`[...document.querySelectorAll(".debug-sky .sky-panel")].map((panel) => ({
  variant: panel.dataset.variant,
  options: [...panel.querySelectorAll(".sky-option")].map((option) => ({ sky: option.dataset.sky, name: option.querySelector(".sky-name").textContent, note: option.querySelector(".sky-note")?.textContent ?? null, checked: option.getAttribute("aria-checked") === "true" })),
  brightness: [...panel.querySelectorAll(".sky-brightness-option")].map((option) => option.getAttribute("aria-checked") === "true"),
}))`);
const state = () => browser.evaluate(`({ palette: document.documentElement.dataset.palette ?? null, stored: sessionStorage.getItem("palette"), theme: document.documentElement.dataset.theme, storedTheme: localStorage.getItem("theme") })`);
// Base UI 的单选在 span 旁边还放了一个隐藏的 input，所以按序号取，不用 :first-child
const pick = async (selector, index = 0) => {
  await browser.evaluate(`document.querySelectorAll('.debug-sky figure:first-child .sky-panel ${selector}')[${index}].click()`);
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

  const first = await panels();
  assert.deepEqual(first.map((panel) => panel.variant), ["tiles", "list"]);
  for (const panel of first) {
    assert.deepEqual(panel.options.map((option) => option.sky), ["night", "galaxy", "ink"], "顺序：夜紫、银河、墨黑");
    assert.deepEqual(panel.options.map((option) => option.name), ["夜紫", "银河", "墨黑"]);
    assert.ok(panel.options[0].checked && !panel.options[1].checked, `一开始是夜紫：${JSON.stringify(panel.options)}`);
    assert.deepEqual(panel.brightness, [false, true], "一开始是深色");
  }
  assert.ok(first[0].options.every((option) => option.note === null) && first[1].options.every((option) => option.note), "只有列表版有说明");

  const nightSky = await skyColor();
  await pick('[data-sky="galaxy"]');
  assert.deepEqual(await state(), { palette: "galaxy", stored: "galaxy", theme: "dark", storedTheme: null });
  assert.ok((await panels()).every((panel) => panel.options[1].checked), "两份面板都显示银河选中");
  const galaxySky = await skyColor();
  assert.ok(distance(nightSky, galaxySky) > 6, `背景星空要跟着换：夜紫 ${nightSky} → 银河 ${galaxySky}`);

  await pick('[data-sky="ink"]');
  assert.equal((await state()).palette, "ink");
  const inkSky = await skyColor();
  assert.ok(distance(galaxySky, inkSky) > 6, `银河 ${galaxySky} → 墨黑 ${inkSky}`);

  await browser.goto(`${base}/debug`);
  assert.equal((await state()).palette, "ink", "刷新后配色还在");
  await browser.evaluate(`document.querySelector("#debug-sky").scrollIntoView({ block: "center" })`);
  await sleep(800);

  await pick('[data-sky="night"]');
  assert.equal((await state()).palette, null, "夜紫是去掉 data-palette");

  await pick(".sky-brightness-option", 0);
  assert.deepEqual(await state(), { palette: null, stored: "night", theme: "light", storedTheme: "light" });
  assert.deepEqual((await panels())[1].brightness, [true, false]);
  await pick(".sky-brightness-option", 1);
  assert.deepEqual(await state(), { palette: null, stored: "night", theme: "dark", storedTheme: null });

  // 真实浮层：月亮按钮的读屏名字带当前配色；打开后焦点进面板，方向键换配色，Esc 关
  const label = await browser.evaluate(`document.querySelector(".debug-sky .sky-trigger").getAttribute("aria-label")`);
  assert.equal(label, "今晚的天空：夜紫，深色");
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
  console.log(`PASS 今晚的天空：两种面板顺序与说明、点选换 data-palette 并记住、背景星空跟着换（夜紫 ${nightSky} → 银河 ${galaxySky} → 墨黑 ${inkSky}）、浅色深色开关、真实浮层读屏名字、方向键换配色、Esc 关闭`);
} finally {
  await browser.evaluate(`sessionStorage.setItem("palette", "night"); localStorage.removeItem("theme")`).catch(() => {});
  browser.close();
}
