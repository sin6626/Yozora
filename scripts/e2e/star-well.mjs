// 浏览器回归测试：按下去的“星井”（2026-11-01，components/starfield.tsx）。
// ① 首页开灯时按住鼠标：背着月亮的左下井壁变亮、朝着月亮的右上井壁变暗（量截图像素），松开 2 秒后恢复原样；
// ② 内页（软件渲染时安静夜空静止不画）：按下后开始逐帧画，井消失后又停下；
// ③ 触屏的按下、在输入框里按下不算；“减少动态效果”时没有星井。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { openBrowser, sleep } from "../headless-browser.mjs";

const sharp = createRequire(import.meta.url)("sharp");
const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9374 });

// 井的半径是 64px（像素比 1），井壁最陡处约 60px：左下、右上各取一小块算平均亮度
const [x, y] = [960, 300];
const patch = async (dx, dy) => {
  const shot = await browser.send("Page.captureScreenshot", { format: "png", clip: { x: x + dx - 6, y: y + dy - 6, width: 12, height: 12, scale: 1 } });
  const { data } = await sharp(Buffer.from(shot.result.data, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 3) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 3);
};
const sides = async () => ({ lit: await patch(-42, 42), shade: await patch(42, -42) });
const mouse = (type) => browser.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
const drawsPerSecond = (ms = 1000) => browser.evaluate(`(async () => {
  let count = 0;
  const proto = WebGLRenderingContext.prototype, original = proto.drawArrays;
  proto.drawArrays = function (...args) { count++; return original.apply(this, args); };
  await new Promise((done) => setTimeout(done, ${ms}));
  proto.drawArrays = original;
  return count / ${ms / 1000};
})()`);

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`, 3000);
  await browser.evaluate(`localStorage.setItem("theme", "light")`);
  await browser.goto(`${base}/`, 6000);
  await mouse("mouseMoved");
  await sleep(300);
  const before = await sides();
  await mouse("mousePressed");
  await sleep(500);
  const held = await sides();
  await mouse("mouseReleased");
  await sleep(2200);
  const after = await sides();
  await browser.evaluate(`localStorage.removeItem("theme")`);
  assert.ok(held.lit - before.lit > 15, `按住时背着月亮的井壁变亮：${before.lit.toFixed(1)} → ${held.lit.toFixed(1)}`);
  assert.ok(before.shade - held.shade > 15, `按住时朝着月亮的井壁变暗：${before.shade.toFixed(1)} → ${held.shade.toFixed(1)}`);
  assert.ok(Math.abs(after.lit - before.lit) < 6 && Math.abs(after.shade - before.shade) < 6, `松开后恢复：${JSON.stringify({ before, after })}`);

  await browser.goto(`${base}/posts`, 6000);
  assert.equal(await drawsPerSecond(), 0, "内页安静夜空本来静止不画（软件渲染）");
  await browser.evaluate(`window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", button: 0, clientX: 200, clientY: 500 }))`);
  assert.equal(await drawsPerSecond(), 0, "触屏的按下不挖井");
  await browser.evaluate(`document.querySelector(".list-aside input").dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", button: 0, bubbles: true, clientX: 200, clientY: 500 }))`);
  assert.equal(await drawsPerSecond(), 0, "在输入框里按下不挖井");
  await mouse("mousePressed");
  const pressing = await drawsPerSecond(500);
  await mouse("mouseReleased");
  await sleep(2500);
  const settled = await drawsPerSecond();
  assert.ok(pressing >= 10, `按下后逐帧画：${pressing} 次/秒`);
  assert.equal(settled, 0, "井消失后又停下");

  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(`${base}/posts`, 6000);
  await drawsPerSecond();
  await mouse("mousePressed");
  const reduced = await drawsPerSecond(500);
  await mouse("mouseReleased");
  assert.equal(reduced, 0, "减少动态效果时没有星井");
  assert.deepEqual(browser.errors, [], "没有页面报错");
  console.log(`PASS 星井：左下井壁 ${before.lit.toFixed(0)} → ${held.lit.toFixed(0)} → ${after.lit.toFixed(0)}，右上井壁 ${before.shade.toFixed(0)} → ${held.shade.toFixed(0)} → ${after.shade.toFixed(0)}；内页按下时 ${pressing} 次/秒、之后 ${settled}；触屏、输入框、减少动态效果都不挖井`);
} finally {
  browser.close();
}
