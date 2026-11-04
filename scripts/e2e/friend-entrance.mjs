// 浏览器回归测试：友链进场——卡片按页面顺序一张接一张弹上来（corners.css 的 .friend-grid > li，弹簧缓动 --ease-spring）。
// 本地真实友链只有两个，依次的节奏用 /debug“友链进场”的十二个示例测，真实友链页测两个也会播。
// 检查：① 每张卡晚 70ms、按页面顺序；② 缓动是弹簧：逐帧采样能看到卡片冲过最终位置（往上越过）再落稳；
// ③ 播完全部可见、在原位、悬停卡片照常上浮；④ 离开再回来重播；⑤ 减少动态效果时不动。（不测关掉页面脚本：正文在 Suspense 里，没有脚本时换不上来。）
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";

const cards = (scope) => `(() => {
  const ms = (v) => Math.round(parseFloat(v) * (v.endsWith("ms") ? 1 : 1000));
  return [...document.querySelectorAll("${scope} .friend-grid > li")].filter((li) => li.checkVisibility()).map((li) => {
    const c = getComputedStyle(li);
    return { name: c.animationName, delay: ms(c.animationDelay), easing: c.animationTimingFunction, opacity: Number(c.opacity), translate: c.translate, start: li.getAnimations().find((a) => a.animationName === "friend-spring")?.startTime ?? null };
  });
})()`;

const browser = await openBrowser({ port: 9373 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(base + "/debug", 3000);
  const sample = await browser.evaluate(cards("#debug-friend-entrance"));
  assert.equal(sample.length, 12, `调试页应有十二个示例友链：${sample.length}`);
  assert.deepEqual(sample.map((c) => c.delay), sample.map((_, i) => i * 70), "应按页面顺序每张晚 70ms");
  for (const c of sample) {
    assert.equal(c.name, "friend-spring", "每张卡都应弹上来");
    const points = (c.easing.match(/linear\(([^)]*)\)/)?.[1] ?? "").split(",").map((p) => parseFloat(p));
    assert.ok(points.length > 20 && Math.max(...points) > 1.1, `缓动应是会冲过头的弹簧曲线：${c.easing.slice(0, 80)}`);
    assert.ok(c.opacity > 0.99 && ["none", "0px"].includes(c.translate), `播完全部可见、回到原位：${c.opacity} / ${c.translate}`);
  }

  // 逐帧采样第一张卡：先在下面，冲到最终位置上方，再落稳
  const path = await browser.evaluate(`(async () => {
    const grid = document.querySelector("#debug-friend-entrance .friend-grid");
    grid.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 300));
    grid.style.display = "none"; grid.offsetHeight; grid.style.display = "";
    const li = grid.firstElementChild;
    const ys = [];
    const start = performance.now();
    while (performance.now() - start < 1000) {
      ys.push(new DOMMatrix(getComputedStyle(li).transform === "none" ? undefined : getComputedStyle(li).transform).m42 || parseFloat(getComputedStyle(li).translate.split(" ")[1] ?? "0") || 0);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { first: ys[0], min: Math.min(...ys), last: ys.at(-1) };
  })()`);
  assert.ok(path.first > 10, `一开始应在下方：${path.first}`);
  assert.ok(path.min < -1, `应冲过最终位置往上越过一点（弹簧）：最高 ${path.min}px`);
  assert.ok(Math.abs(path.last) < 0.5, `最后应落稳在原位：${path.last}`);

  // 真实友链页
  await browser.goto(base + "/friends", 2500);
  const real = await browser.evaluate(cards("main"));
  assert.ok(real.length >= 1, "友链页应有友链");
  assert.ok(real.every((c, i) => c.name === "friend-spring" && c.delay === i * 70 && c.opacity > 0.99), "友链页每张卡依次弹上来、播完可见");

  // 播完悬停卡片照常上浮
  const point = await browser.evaluate(`(() => { const r = [...document.querySelectorAll("main .friend-card .card-link")].find((a) => a.checkVisibility()).getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await sleep(400);
  const lifted = await browser.evaluate(`getComputedStyle([...document.querySelectorAll("main .friend-card")].find((c) => c.checkVisibility())).transform`);
  assert.equal(lifted, "matrix(1, 0, 0, 1, 0, -2)", `播完后悬停卡片应上浮 2px：${lifted}`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 980 });

  // 离开再回来重播
  const before = real.map((c) => c.start);
  await browser.evaluate(`document.querySelector('.navigation-List a[href="/posts"]').click()`);
  await sleep(2000);
  await browser.evaluate("history.back()");
  await sleep(400);
  const back = await browser.evaluate(cards("main"));
  assert.ok(back.every((c, i) => c.start !== null && c.start > before[i]), "离开再回来应重播");

  // 减少动态效果：不动
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(base + "/friends", 2000);
  const reduced = await browser.evaluate(cards("main"));
  assert.ok(reduced.length > 0 && reduced.every((c) => c.name === "none" && c.opacity > 0.99), "减少动态效果时友链不该有进场动画");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 友链：调试页十二张卡按顺序每张晚 70ms 弹上来，弹簧冲过 ${Math.abs(path.min).toFixed(1)}px 再落稳；友链页 ${real.length} 张也依次弹上来，悬停照常，离开再回来重播，减少动态效果时不动`);
} finally {
  browser.close();
}
