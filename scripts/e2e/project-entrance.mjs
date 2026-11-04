// 浏览器回归测试：作品页卡片沿斜对角像波浪一样依次浮上（components/corners.css 的 .project-grid > li，序号 --i 来自 project-list.tsx）。
// 检查：① 每张卡的延迟 =（实际所在行 + 实际所在列）× 90ms，宽屏、700 宽、手机一列都对得上（容器查询给的列数和真实网格一致）。
// 本地真实作品只有两张，波浪用 /debug“作品进场”的八张示例卡测，真实作品页测两张卡、网格三列和下面几项；
// ② 播完全部可见、悬停卡片照常上浮；③ 离开再回来（浏览器后退，Activity 重新显示）重播；
// ④ 关掉页面脚本照样播、播完可见；⑤ 减少动态效果时不动。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";

// 按卡片实际位置数出行列，再和动画延迟对照
const cards = (scope) => `(() => {
  const items = [...document.querySelectorAll("${scope} .project-grid > li")].filter((li) => li.checkVisibility() && !li.closest(".guide-gap"));
  const lefts = [...new Set(items.map((li) => Math.round(li.getBoundingClientRect().left)))].sort((a, b) => a - b);
  const tops = [...new Set(items.map((li) => Math.round(li.getBoundingClientRect().top)))].sort((a, b) => a - b);
  return items.map((li) => {
    const r = li.getBoundingClientRect();
    const columns = getComputedStyle(li.parentElement).gridTemplateColumns.split(" ").length;
    const c = getComputedStyle(li);
    return {
      columns,
      row: tops.indexOf(Math.round(r.top)),
      col: lefts.indexOf(Math.round(r.left)),
      name: c.animationName,
      delay: Math.round(parseFloat(c.animationDelay) * (c.animationDelay.endsWith("ms") ? 1 : 1000)),
      opacity: Number(c.opacity),
      start: li.getAnimations().find((a) => a.animationName === "project-rise")?.startTime ?? null,
    };
  });
})()`;

const checkWave = (list, label) => {
  assert.ok(list.length >= 2, `${label}：作品太少，测不了`);
  for (const card of list) {
    assert.equal(card.name, "project-rise", `${label}：每张卡都应有进场动画`);
    assert.equal(card.delay, Math.min((card.row + card.col) * 90, 900), `${label}：第 ${card.row + 1} 行第 ${card.col + 1} 列的延迟应是 ${(card.row + card.col) * 90}ms，实际 ${card.delay}ms`);
  }
};

const browser = await openBrowser({ port: 9370 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(base + "/projects", 2500);
  const wide = await browser.evaluate(cards("main"));
  const columns = wide[0]?.columns ?? 0;
  assert.ok(columns >= 3, `宽屏作品网格应至少三列：${columns}`);
  checkWave(wide, `作品页宽屏 ${columns} 列`);
  assert.ok(wide.every((c) => c.opacity > 0.99), "播完全部可见");

  // 播完悬停卡片照常上浮（动画在外层 li 上，不占卡片的 transform）
  const point = await browser.evaluate(`(() => { const r = document.querySelector(".project-grid .project-card").getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await sleep(400);
  const lifted = await browser.evaluate(`getComputedStyle(document.querySelector(".project-grid .project-card")).transform`);
  assert.equal(lifted, "matrix(1, 0, 0, 1, 0, -2)", `播完后悬停卡片应上浮 2px：${lifted}`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 980 });

  // 离开再回来：Activity 重新显示时重播
  const before = wide.map((c) => c.start);
  await browser.evaluate(`document.querySelector('.navigation-List a[href="/posts"]').click()`);
  await sleep(2000);
  await browser.evaluate("history.back()");
  await sleep(400);
  const back = await browser.evaluate(cards("main"));
  assert.ok(back.every((c, i) => c.start !== null && c.start > before[i]), "离开再回来应重播");

  // 斜对角波浪：/debug 的八张示例卡，三种宽度
  const waves = [];
  for (const [width, label] of [[1920, "宽屏"], [700, "700 宽"], [390, "手机"]]) {
    await browser.setViewport(width, 991);
    await browser.goto(base + "/debug", 2500);
    const list = await browser.evaluate(cards("#debug-project-entrance"));
    assert.equal(list.length, 8, `${label}：调试页应有八张示例卡`);
    assert.equal(Math.max(...list.map((c) => c.col)) + 1, list[0].columns, `${label}：卡片实际占的列数应等于网格列数`);
    checkWave(list, `${label} ${list[0].columns} 列`);
    waves.push(`${label} ${list[0].columns} 列`);
  }
  await browser.setViewport(1920, 991);

  // 关掉页面脚本：照样播，播完可见
  await browser.send("Emulation.setScriptExecutionDisabled", { value: true });
  await browser.goto(base + "/projects", 2000);
  const noScript = await browser.evaluate(cards("main"));
  assert.ok(noScript.every((c) => c.name === "project-rise" && c.opacity > 0.99), "没有脚本时也播、播完全部可见");
  await browser.send("Emulation.setScriptExecutionDisabled", { value: false });

  // 减少动态效果：不动
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(base + "/projects", 2000);
  const reduced = await browser.evaluate(cards("main"));
  assert.ok(reduced.every((c) => c.name === "none" && c.opacity > 0.99), "减少动态效果时作品卡片不该有进场动画");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 作品：卡片按（行 + 列）× 90ms 斜对角依次浮上（调试页八张卡 ${waves.join("、")}都对得上；作品页 ${wide.length} 张、网格 ${columns} 列），播完悬停照常，离开再回来重播，没有脚本照样播，减少动态效果时不动`);
} finally {
  browser.close();
}
