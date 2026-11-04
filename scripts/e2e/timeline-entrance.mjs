// 浏览器回归测试：时间线进场（components/timeline.css + Reveal kind="timeline"）。每个月：月份淡入，星座竖线从上往下匀速画出，
// 画到哪条那颗小星亮一下、那条随后浮上；每次进入页面每个月只播一次。
// 检查：① 首屏的月份一插进来就播、整页打开亮起后不再被藏起来；② 小星亮起的时刻和竖线画到它的位置对得上，文字在小星之后；
// ③ 一个月条目很多时压缩到 1.6 秒内画完；④ 首屏以下的月份先藏着（竖线收起、小星和文字透明），滚到才播，来回滚不重播；
// ⑤ 播完悬停小星照常亮起；⑥ 关掉页面脚本全部可见；⑦ 减少动态效果时不动。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";

const flashProbe = `(() => {
  const log = (window.__timelineLog = { peak: 0, dropAfterPeak: 1 });
  const tick = () => {
    const node = [...document.querySelectorAll(".timeline-node")].find((el) => el.checkVisibility());
    if (node) {
      const o = Number(getComputedStyle(node).opacity);
      log.peak = Math.max(log.peak, o);
      if (log.peak > 0.99) log.dropAfterPeak = Math.min(log.dropAfterPeak, o);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

// 动画只在等待期间填充，播完 getAnimations() 里就没有了，所以时长和延迟从计算样式读；“有没有重播”看是否又出现正在跑的动画
const months = `(() => [...document.querySelectorAll(".timeline-month")].filter((m) => m.checkVisibility()).map((month) => {
  const list = month.querySelector(".timeline-list");
  const ms = (v) => Math.round(parseFloat(v) * (v.endsWith("ms") ? 1 : 1000));
  const css = (el, pseudo) => { const c = getComputedStyle(el, pseudo); return { name: c.animationName, duration: ms(c.animationDuration), delay: ms(c.animationDelay) }; };
  const draw = css(list, "::before");
  const box = list.getBoundingClientRect();
  return {
    top: Math.round(month.getBoundingClientRect().top),
    kind: month.dataset.reveal,
    state: month.dataset.revealState ?? "none",
    label: css(month.querySelector(".timeline-month-label")).name === "timeline-label-in",
    draw: draw.name === "timeline-draw" ? draw : null,
    running: document.getAnimations().filter((a) => month.contains(a.effect?.target) && a.playState === "running" && a.animationName?.startsWith("timeline-")).length,
    lineScale: getComputedStyle(list, "::before").scale,
    items: [...list.children].map((li) => {
      const node = li.querySelector(".timeline-node");
      const star = css(node);
      const text = css(li.querySelector("a"));
      const r = node.getBoundingClientRect();
      return { at: (r.top + r.height / 2 - box.top) / box.height, starDelay: star.name === "timeline-star" ? star.delay : null, textDelay: text.name === "timeline-item-in" ? text.delay : null, nodeOpacity: Number(getComputedStyle(node).opacity), textOpacity: Number(getComputedStyle(li.querySelector("a")).opacity) };
    }),
  };
}))()`;

const browser = await openBrowser({ port: 9368 });
try {
  await browser.setViewport(1920, 991);
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: flashProbe });
  await browser.goto(base + "/timeline", 3500);

  const all = await browser.evaluate(months);
  assert.ok(all.length >= 2, `时间线月份太少，测不了：${all.length}`);
  assert.ok(all.every((m) => m.kind === "timeline"), "每个月都应由 Reveal kind=timeline 包住");
  const first = all.filter((m) => m.top < 991 * 0.92);
  const below = all.filter((m) => m.top >= 991 * 0.92);
  assert.ok(first.length >= 1 && below.length >= 1, `需要首屏内外都有月份：${first.length} / ${below.length}`);

  const flash = await browser.evaluate("window.__timelineLog");
  assert.ok(flash.peak > 0.99 && flash.dropAfterPeak > 0.5, `整页打开时首屏小星亮起后不该再被藏起来：${JSON.stringify(flash)}`);

  let above = 0;
  for (const m of first) {
    assert.equal(m.state, "none", "首屏的月份不该被标成 waiting");
    assert.ok(m.label && m.draw, `首屏月份应有月份淡入和竖线画出：${JSON.stringify(m)}`);
    const monthAt = Math.min(above * 110, 1200);
    assert.ok(Math.abs(m.draw.delay - monthAt) < 1, `月份应接着上一个月画：前面 ${above} 条，应等 ${monthAt}ms，实际 ${m.draw.delay}ms`);
    const step = Math.min(110, 1600 / m.items.length);
    assert.ok(Math.abs(m.draw.duration - m.items.length * step) < 1, `竖线画出时长应是条数 × 每条时长：${m.draw.duration}`);
    m.items.forEach((item, i) => {
      assert.ok(Math.abs(item.starDelay - monthAt - (i + 0.5) * step) < 1, `第 ${i + 1} 颗星亮起的延迟不对：${item.starDelay}`);
      assert.ok(item.textDelay > item.starDelay, `第 ${i + 1} 条的文字应在小星之后浮上`);
      const when = (item.starDelay - m.draw.delay) / m.draw.duration;
      assert.ok(Math.abs(when - item.at) < 0.15, `第 ${i + 1} 颗星亮起时竖线应正好画到它：时刻 ${when.toFixed(2)}，位置 ${item.at.toFixed(2)}`);
      assert.ok(item.nodeOpacity > 0.99 && item.textOpacity > 0.99, "首屏月份播完应全部可见");
    });
    above += m.items.length;
  }

  for (const m of below) {
    assert.equal(m.state, "waiting", "首屏以下的月份应先等着");
    assert.equal(m.lineScale, "1 0", "等待中的月份竖线应收起");
    assert.ok(m.items.every((item) => item.nodeOpacity < 0.01 && item.textOpacity < 0.01), "等待中的月份小星和文字应藏着");
  }

  // 条目很多的月份压缩到 1.6 秒内画完
  const squeezed = await browser.evaluate(`(() => {
    const list = [...document.querySelectorAll(".timeline-list")].find((l) => l.checkVisibility());
    const before = list.style.getPropertyValue("--count");
    list.style.setProperty("--count", "30");
    const duration = getComputedStyle(list, "::before").animationDuration;
    list.style.setProperty("--count", before);
    return duration;
  })()`);
  assert.equal(squeezed, "1.6s", `30 条的月份应 1.6 秒画完：${squeezed}`);

  // 滚到才播，来回滚不重播
  const target = below[0];
  await browser.evaluate(`scrollTo(0, scrollY + ${target.top} - 300)`);
  await sleep(2400);
  const shownBatch = (await browser.evaluate(months)).filter((m) => m.state === "shown");
  const shownNow = shownBatch[0];
  assert.ok(shownNow?.draw, "滚到后月份应变成 shown 并画出竖线");
  assert.equal(shownNow.draw.delay, 0, "滚到才出现的第一个月应马上开始画，不按整页的位置等");
  assert.ok(shownNow.items.every((item) => item.nodeOpacity > 0.99 && item.textOpacity > 0.99), "滚到的月份播完应全部可见");
  await browser.evaluate("scrollTo(0, 0)");
  await sleep(300);
  await browser.evaluate(`scrollTo(0, scrollY + ${target.top} - 300)`);
  await sleep(150);
  const again = (await browser.evaluate(months)).filter((m) => m.state === "shown");
  assert.ok(again.every((m) => m.running === 0), "滚走再滚回来不应重播");

  // 播完悬停小星照常亮起（动画只在等待期间填充，不占着 scale）
  await browser.evaluate("scrollTo(0, 0)");
  await sleep(400);
  const point = await browser.evaluate(`(() => { const a = [...document.querySelectorAll(".timeline-item a")].find((x) => x.checkVisibility()); const r = a.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await sleep(500);
  const hoverScale = await browser.evaluate(`getComputedStyle([...document.querySelectorAll(".timeline-node")].find((x) => x.checkVisibility())).scale`);
  assert.equal(hoverScale, "1.4", `播完后悬停小星应放大到 1.4：${hoverScale}`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 900 });

  // 关掉页面脚本：首屏照样播，播完全部可见，没有 waiting
  await browser.send("Emulation.setScriptExecutionDisabled", { value: true });
  await browser.goto(base + "/timeline", 2500);
  const noScript = await browser.evaluate(months);
  assert.ok(noScript.every((m) => m.state === "none"), "没有脚本时不该有月份等着");
  assert.ok(noScript.filter((m) => m.top < 991).every((m) => m.items.every((i) => i.nodeOpacity > 0.99 && i.textOpacity > 0.99)), "没有脚本时首屏月份播完应全部可见");
  await browser.send("Emulation.setScriptExecutionDisabled", { value: false });

  // 减少动态效果：不动，全部可见
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(base + "/timeline", 2000);
  const reduced = await browser.evaluate(months);
  assert.ok(reduced.every((m) => !m.draw && !m.label && m.state === "none" && m.items.every((i) => i.starDelay === null && i.nodeOpacity > 0.99 && i.textOpacity > 0.99)), "减少动态效果时时间线不该有进场动画");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 时间线：首屏 ${first.length} 个月一插进来就一个接一个画线点星（不等脚本、不闪），小星亮起和竖线画到的位置对得上、文字随后浮上，30 条压缩到 1.6 秒，以下 ${below.length} 个月滚到才播且只播一次，播完悬停照常，没有脚本时全部可见，减少动态效果时不动`);
} finally {
  browser.close();
}
