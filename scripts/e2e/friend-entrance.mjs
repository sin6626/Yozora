// 浏览器回归测试：友链进场——头像像天黑后的星星，随机先后从暗处亮起（friend-list.tsx 的 twinkleTimes + corners.css 的 friend-twinkle）。
// 本地真实友链只有两个，随机顺序用 /debug“友链进场”的十二个示例测，真实友链页测两个也会播。
// 检查：① 每张卡的亮起时刻在 0.9 秒内均匀排开、两两不同，顺序不是从上到下（打乱过），刷新后顺序不变（服务端按 id 算，水合不会对不上）；
// ② 头像在卡片之前或同时开始亮、站名晚 0.12 秒；③ 播完全部可见、头像回到原样（没有残留的滤镜和缩放）、悬停卡片照常上浮；
// ④ 离开再回来重播；⑤ 关掉页面脚本照样播；⑥ 减少动态效果时不动。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";

const cards = (scope) => `(() => {
  const ms = (v) => Math.round(parseFloat(v) * (v.endsWith("ms") ? 1 : 1000));
  return [...document.querySelectorAll("${scope} .friend-grid > li")].filter((li) => li.checkVisibility()).map((li) => {
    const c = getComputedStyle(li);
    const avatar = getComputedStyle(li.querySelector(".friend-avatar"));
    const text = getComputedStyle(li.querySelector(".friend-card > div"));
    return {
      card: c.animationName, cardDelay: ms(c.animationDelay), opacity: Number(c.opacity),
      avatar: avatar.animationName, avatarDelay: ms(avatar.animationDelay), filter: avatar.filter, scale: avatar.scale, avatarOpacity: Number(avatar.opacity),
      text: text.animationName, textDelay: ms(text.animationDelay), textOpacity: Number(text.opacity),
      start: li.getAnimations().find((a) => a.animationName === "friend-appear")?.startTime ?? null,
    };
  });
})()`;

const browser = await openBrowser({ port: 9373 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(base + "/debug", 3000);
  const sample = await browser.evaluate(cards("#debug-friend-entrance"));
  assert.equal(sample.length, 12, `调试页应有十二个示例友链：${sample.length}`);
  const step = Math.min(80, 900 / sample.length);
  const delays = sample.map((c) => c.cardDelay);
  assert.deepEqual([...delays].sort((a, b) => a - b), sample.map((_, i) => Math.round(i * step)), `亮起时刻应在 0.9 秒内均匀排开、两两不同：${delays}`);
  // 打乱要真的乱：亮起先后和页面上的先后（从上到下）的等级相关系数要弱，正着、倒着排都不行（曾因散列末字节没混开，几乎是倒序）
  const rank = (list) => list.map((v) => [...list].sort((a, b) => a - b).indexOf(v));
  const n = delays.length;
  const rho = 1 - (6 * rank(delays).reduce((sum, r, i) => sum + (r - i) ** 2, 0)) / (n * (n * n - 1));
  assert.ok(Math.abs(rho) < 0.6, `亮起顺序应打乱，和从上到下的顺序相关太强：rho = ${rho.toFixed(2)}，延迟 ${delays}`);
  for (const c of sample) {
    assert.ok(c.card === "friend-appear" && c.avatar === "friend-twinkle" && c.text === "friend-text-in", `每张卡都应有淡入、头像亮起、文字滑入：${JSON.stringify(c)}`);
    assert.equal(c.avatarDelay, c.cardDelay, "头像和卡片同时开始");
    assert.equal(c.textDelay, c.cardDelay + 120, "站名晚 0.12 秒滑进");
    assert.ok(c.opacity > 0.99 && c.avatarOpacity > 0.99 && c.textOpacity > 0.99, "播完全部可见");
    assert.ok(c.filter === "none" && c.scale === "none", `播完头像应回到原样：filter ${c.filter}，scale ${c.scale}`);
  }
  await browser.goto(base + "/debug", 3000);
  assert.deepEqual((await browser.evaluate(cards("#debug-friend-entrance"))).map((c) => c.cardDelay), delays, "刷新后亮起顺序应不变");

  // 真实友链页
  await browser.goto(base + "/friends", 2500);
  const real = await browser.evaluate(cards("main"));
  assert.ok(real.length >= 1, "友链页应有友链");
  assert.ok(real.every((c) => c.card === "friend-appear" && c.opacity > 0.99), "友链页每张卡都播、播完可见");

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

  // 关掉页面脚本：照样播，播完可见
  await browser.send("Emulation.setScriptExecutionDisabled", { value: true });
  await browser.goto(base + "/friends", 2000);
  const noScript = await browser.evaluate(cards("main"));
  assert.ok(noScript.every((c) => c.card === "friend-appear" && c.opacity > 0.99 && c.avatarOpacity > 0.99), "没有脚本时也播、播完全部可见");
  await browser.send("Emulation.setScriptExecutionDisabled", { value: false });

  // 减少动态效果：不动
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(base + "/friends", 2000);
  const reduced = await browser.evaluate(cards("main"));
  assert.ok(reduced.every((c) => c.card === "none" && c.avatar === "none" && c.text === "none" && c.opacity > 0.99), "减少动态效果时友链不该有进场动画");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 友链：调试页十二个头像按打乱的顺序在 0.9 秒内每隔 ${Math.round(step)}ms 亮起一颗（刷新顺序不变），站名随后滑进，播完回到原样、悬停照常；友链页 ${real.length} 个也播，离开再回来重播，没有脚本照样播，减少动态效果时不动`);
} finally {
  browser.close();
}
