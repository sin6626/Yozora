// 浏览器回归测试：一言星图进场（components/say-sky.tsx 的 --light-at / --draw-at + says.css 的 say-star-light / say-line-draw）。
// 星先全暗（只剩很淡的小点），再从最早收录的那句开始依次点亮，约 2 秒亮完；星都亮了以后，星座连线按连上的那颗星多新一段段画出来。
// 检查：① 真实一言页每颗星的亮起时刻 = 按 created 从旧到新的名次 × 每颗间隔（读 Core 的 /says/all 对照）；
// ② 调试页 60 句示例：连线在最后一颗星亮起 0.5 秒后才开始画，先后按连上的那颗星多新；还没轮到的星是暗的、连线看不见；
//    画到一半的线真的是一半；虚线长度和线在屏幕上的实际长度对得上（连线不随缩放变粗，虚线按屏幕像素算，长度是用容器单位算的）；
//    播完全部连线实线、每颗星回到各自的亮度；③ 减少动态效果时不动。（不测关掉页面脚本：星图在 Suspense 里，没有脚本时换不上来。）
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖；Core 默认 http://127.0.0.1:2333，可用 CORE_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";

const stars = (scope) => `(() => {
  const ms = (v) => Math.round(parseFloat(v) * (v.endsWith("ms") ? 1 : 1000));
  return [...document.querySelectorAll("${scope} .say-star")].filter((s) => s.checkVisibility()).map((s) => {
    const c = getComputedStyle(s);
    return { id: s.dataset.id, name: c.animationName, delay: ms(c.animationDelay), opacity: Number(c.opacity), b: Number(s.style.getPropertyValue("--b")), left: s.style.left, top: s.style.top };
  });
})()`;

const browser = await openBrowser({ port: 9377 });
try {
  await browser.setViewport(1920, 991);

  // ① 真实一言页：亮起先后 = 从旧到新
  const { data } = await (await fetch(`${core}/says/all`)).json();
  const rank = new Map([...data].sort((a, b) => String(a.created).localeCompare(String(b.created))).map((item, index) => [item.id, index]));
  await browser.goto(base + "/says", 3500);
  const real = await browser.evaluate(stars("main"));
  assert.equal(real.length, data.length, `每句一颗星：${real.length} / ${data.length}`);
  const step = Math.min(250, 2000 / Math.max(real.length - 1, 1));
  for (const star of real) {
    assert.equal(star.name, "say-star-light", "每颗星都有点亮动画");
    assert.equal(star.delay, Math.round(rank.get(star.id) * step), `星 ${star.id} 应在第 ${rank.get(star.id) + 1} 个亮起`);
    assert.ok(Math.abs(star.opacity - star.b) < 0.01, `播完回到自己的亮度：${star.opacity} / ${star.b}`);
  }
  assert.ok(Math.max(...real.map((s) => s.delay)) <= 2000, "约 2 秒内全部亮起");

  // ② 调试页 60 句示例：点亮与连线逐帧检查
  await browser.goto(base + "/debug", 3000);
  const result = await browser.evaluate(`(async () => {
    const field = [...document.querySelectorAll("#debug-say-sky .say-field")][1];
    field.scrollIntoView({ block: "start" });
    await new Promise((r) => setTimeout(r, 400));
    const sky = [...field.querySelectorAll(".say-sky")].find((s) => s.checkVisibility());
    const svg = sky.querySelector(".say-sky-lines").getBoundingClientRect();
    const ms = (v) => Math.round(parseFloat(v) * (v.endsWith("ms") ? 1 : 1000));
    const starList = [...sky.querySelectorAll(".say-star")].map((s) => ({ el: s, delay: ms(getComputedStyle(s).animationDelay), key: parseFloat(s.style.left).toFixed(2) + "," + parseFloat(s.style.top).toFixed(2), b: Number(s.style.getPropertyValue("--b")) }));
    const byPos = new Map(starList.map((s) => [s.key, s]));
    const lines = [...sky.querySelectorAll(".say-sky-lines line")].map((l) => {
      const p = (n) => Number(l.getAttribute(n));
      const a = byPos.get(p("x1").toFixed(2) + "," + p("y1").toFixed(2)), b = byPos.get(p("x2").toFixed(2) + "," + p("y2").toFixed(2));
      return { el: l, delay: ms(getComputedStyle(l).animationDelay), newer: Math.max(a?.delay ?? -1, b?.delay ?? -1), matched: !!a && !!b, len: Math.hypot((p("x2") - p("x1")) * svg.width / 100, (p("y2") - p("y1")) * svg.height / 100) };
    });
    // 重新播一次（隐藏再显示，CSS 动画从头来）
    field.style.display = "none"; field.offsetHeight; field.style.display = "";
    const t0 = performance.now();
    const wait = (t) => new Promise((r) => setTimeout(r, Math.max(0, t - (performance.now() - t0))));
    await wait(40);
    const last = starList.reduce((a, b) => (b.delay > a.delay ? b : a));
    const dash = (l) => getComputedStyle(l).strokeDasharray;
    const offset = (l) => parseFloat(getComputedStyle(l).strokeDashoffset);
    const early = { lastStarOpacity: Number(getComputedStyle(last.el).opacity), hiddenLines: lines.every((l) => Math.abs(offset(l.el) - parseFloat(dash(l.el))) < 0.5) };
    const first = lines.reduce((a, b) => (b.delay < a.delay ? b : a));
    await wait(first.delay + 300);
    const mid = { offset: offset(first.el), dash: parseFloat(dash(first.el)), len: first.len };
    const longest = Math.max(...lines.map((l) => l.delay));
    await wait(longest + 900);
    const done = { solid: lines.every((l) => dash(l.el) === "none"), starsBack: starList.every((s) => Math.abs(Number(getComputedStyle(s.el).opacity) - s.b) < 0.01) };
    return { count: starList.length, lineCount: lines.length, matched: lines.every((l) => l.matched), lastStar: last.delay, lines: lines.map(({ delay, newer }) => ({ delay, newer })), early, mid, done };
  })()`);
  assert.equal(result.count, 60, "调试页第二份示例应有 60 颗星");
  assert.ok(result.lineCount > 10 && result.matched, `连线应能对上两端的星：${result.lineCount} 条`);
  const sorted = [...result.lines].sort((a, b) => a.delay - b.delay);
  assert.ok(sorted.every((l, i) => i === 0 || l.newer >= sorted[i - 1].newer), "连线先后应按连上的那颗星多新");
  const firstLine = Math.min(...result.lines.map((l) => l.delay));
  assert.ok(Math.abs(firstLine - (result.lastStar + 500)) <= 1, `第一段连线应在最后一颗星亮起 0.5 秒后开始：${firstLine} / ${result.lastStar}`);
  assert.ok(result.early.lastStarOpacity < 0.15, `还没轮到的星应是暗的：${result.early.lastStarOpacity}`);
  assert.ok(result.early.hiddenLines, "还没轮到的连线应看不见");
  assert.ok(Math.abs(result.mid.dash - result.mid.len) < 1, `虚线长度应等于线在屏幕上的长度：${result.mid.dash} / ${result.mid.len.toFixed(1)}`);
  assert.ok(result.mid.offset > result.mid.len * 0.05 && result.mid.offset < result.mid.len * 0.6, `画到一半的线应只露出一部分：剩 ${result.mid.offset.toFixed(1)} / ${result.mid.len.toFixed(1)}`);
  assert.ok(result.done.solid && result.done.starsBack, "播完连线应是实线、星回到各自的亮度");

  // ③ 减少动态效果：不动
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(base + "/says", 2000);
  const reduced = await browser.evaluate(stars("main"));
  assert.ok(reduced.length > 0 && reduced.every((s) => s.name === "none"), "减少动态效果时星图不该有进场动画");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 一言星图：${real.length} 颗星按收录先后每隔 ${Math.round(step)}ms 依次点亮（2 秒内）；示例 60 颗星亮完 0.5 秒后 ${result.lineCount} 段连线按新旧一段段画出，长度和屏幕上一致、画到一半是一半，播完实线、星回原亮度；减少动态效果时不动`);
} finally {
  browser.close();
}
