// 浏览器回归测试：页头站名区换 App 时的动画（2026-11-09 站长要求：切换正在用的应用时，图标“滚动下滑”换过去，原来是瞬间替换）。
// 用调试页“页头站名滚动”的“换个应用”示例（真实组件 + 写死的数据，不读 Core、不受站长 Companion 实时上报影响）：
// ① 等站名滚到 App 那一格，点“换个应用”；② 刚换的一瞬间新旧两个图标同时在：新的在上方往下滑进来，旧的往下滑出去；
// ③ 滑完只剩新图标、回到原位；④ 减少动态效果时直接换、没有滑动。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9485 });
const root = `document.querySelector("#debug-brand-ticker-switch")`;
const icons = () => browser.evaluate(`[...${root}.querySelectorAll(".brand-ticker-app")].map((el) => ({ app: el.dataset.app, y: Math.round(new DOMMatrix(getComputedStyle(el).transform).m42 * 10) / 10 }))`);

async function waitLive() {
  for (let i = 0; i < 120; i++) {
    if (await browser.evaluate(`${root}?.querySelector(".brand-ticker")?.dataset.slot === "live"`)) return;
    await sleep(100);
  }
  assert.fail("站名没有滚到 App 那一格");
}

const press = () => browser.evaluate(`${root}.querySelector(".debug-switch-app").click()`);

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/debug`);
  await browser.evaluate(`${root}.scrollIntoView({ block: "center" })`);
  await waitLive();
  await sleep(700);
  const before = await icons();
  assert.equal(before.length, 1, "换之前只有一个图标");

  await press();
  await sleep(70);
  const during = await icons();
  assert.equal(during.length, 2, `换的一瞬间新旧两个图标都在（${JSON.stringify(during)}）`);
  const fresh = during.find((icon) => icon.app !== before[0].app);
  const old = during.find((icon) => icon.app === before[0].app);
  assert.ok(fresh && fresh.y < 0, `新图标从上方往下滑进来：${JSON.stringify(during)}`);
  assert.ok(old && old.y > 0, `旧图标往下滑出去：${JSON.stringify(during)}`);

  await sleep(700);
  const after = await icons();
  assert.equal(after.length, 1, "滑完只剩新图标");
  assert.equal(after[0].app, fresh.app);
  assert.equal(after[0].y, 0, "新图标回到原位");

  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await press();
  await sleep(70);
  const reduced = await icons();
  assert.ok(reduced.every((icon) => icon.y === 0), `减少动态效果时直接换、不滑动：${JSON.stringify(reduced)}`);

  console.log(`PASS 换 App 时图标向下滑：${before[0].app} → ${fresh.app}，新的从上方滑进、旧的往下滑出，减少动态效果直接换`);
} finally {
  browser.close();
}
