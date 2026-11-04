// 浏览器回归测试：文章、手记、思考列表进入页面时每条“对焦浮上”，每次进入页面只播一次（components/reveal.tsx + reveal.css）。
// 检查：① 整页打开时首屏的条目由 CSS 一插进来就按序号依次播（不等脚本），播完之后不会再被藏起来重播（不闪）；
// ② 首屏以下的条目先藏着（waiting），滚到才播，滚回去不重播；③ 关掉页面脚本时首屏照样播、播完全部看得见；
// ④ 站内跳转进来也播；⑤ 减少动态效果时没有动画、直接显示。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const pages = { "/posts": "ul.post-list", "/notes": "ul.note-list", "/thinking": "ul.thinking-list" };

// 页面一开始就装上：每帧记下列表第一条的透明度，看它亮起来以后有没有又被藏起来
const flashProbe = `(() => {
  const log = (window.__revealLog = { peak: 0, dropAfterPeak: 1 });
  const tick = () => {
    const first = [...document.querySelectorAll("main li[data-reveal]")].find((el) => el.checkVisibility());
    if (first) {
      const o = Number(getComputedStyle(first).opacity);
      log.peak = Math.max(log.peak, o);
      if (log.peak > 0.99) log.dropAfterPeak = Math.min(log.dropAfterPeak, o);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

const snapshot = (list) => `(() => {
  const items = [...document.querySelectorAll("${list} > li")].filter((el) => el.checkVisibility());
  return items.map((el) => {
    const r = el.getBoundingClientRect();
    const a = el.getAnimations().find((x) => x.animationName === "reveal-rise");
    return { top: Math.round(r.top), reveal: el.hasAttribute("data-reveal"), state: el.dataset.revealState ?? "none", opacity: Number(getComputedStyle(el).opacity), delay: a?.effect.getTiming().delay ?? null, start: a?.startTime ?? null };
  });
})()`;

const browser = await openBrowser({ port: 9366 });
try {
  await browser.setViewport(1920, 991);
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: flashProbe });

  for (const [path, list] of Object.entries(pages)) {
    await browser.goto(base + path, 2500);
    const items = await browser.evaluate(snapshot(list));
    assert.ok(items.length >= 2, `${path} 列表条目太少，测不了：${items.length}`);
    assert.ok(items.every((i) => i.reveal), `${path} 每条都应带 data-reveal`);
    const first = items.filter((i) => i.top < 991 * 0.92);
    const below = items.filter((i) => i.top >= 991 * 0.92);
    assert.ok(first.length >= 1, `${path} 首屏应有条目`);
    assert.ok(first.every((i) => i.state === "none" && i.opacity > 0.99), `${path} 首屏条目播完应全部可见、不被标成 waiting：${JSON.stringify(first)}`);
    assert.deepEqual(first.map((i) => i.delay), first.map((_, n) => n * 60), `${path} 首屏条目应一条比一条晚 60ms`);
    const flash = await browser.evaluate("window.__revealLog");
    assert.ok(flash.peak > 0.99 && flash.dropAfterPeak > 0.5, `${path} 整页打开时首屏第一条亮起后不该再被藏起来：${JSON.stringify(flash)}`);
    if (below.length) {
      assert.ok(below.every((i) => i.state === "waiting" && i.opacity < 0.01), `${path} 首屏以下的条目应先藏着：${JSON.stringify(below)}`);
      await browser.evaluate("scrollTo(0, document.documentElement.scrollHeight)");
      await sleep(1600);
      const after = await browser.evaluate(snapshot(list));
      const shown = after.filter((i) => i.state === "shown");
      assert.ok(shown.length >= 1 && shown.every((i) => i.opacity > 0.99), `${path} 滚到后应播完并显示：${JSON.stringify(after)}`);
      const delays = shown.map((i) => i.delay);
      assert.ok(Math.min(...delays) === 0, `${path} 滚到才出现的一批应从 0 开始数序号，不是越往下等越久：${delays}`);
      const starts = after.map((i) => i.start);
      await browser.evaluate("scrollTo(0, 0)");
      await sleep(300);
      await browser.evaluate("scrollTo(0, document.documentElement.scrollHeight)");
      await sleep(300);
      const again = await browser.evaluate(snapshot(list));
      assert.deepEqual(again.map((i) => i.start), starts, `${path} 滚走再滚回来不应重播`);
    }
  }

  // 站内跳转进来：首屏条目也播
  await browser.goto(base + "/notes", 2500);
  const navigated = await browser.evaluate(`(async () => {
    document.querySelector('.navigation-List a[href="/posts"]').click();
    for (let i = 0; i < 200; i++) {
      const li = [...document.querySelectorAll("ul.post-list > li")].find((el) => el.checkVisibility());
      if (li) return li.getAnimations().some((a) => a.animationName === "reveal-rise");
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  })()`);
  assert.equal(navigated, true, "从手记站内跳到文章，首屏条目应播进场动画");

  // 关掉页面脚本：首屏照样由 CSS 播，播完没有被藏住的条目
  await browser.send("Emulation.setScriptExecutionDisabled", { value: true });
  await browser.goto(base + "/posts", 2000);
  const noScript = await browser.evaluate(snapshot(pages["/posts"]));
  assert.ok(noScript.filter((i) => i.top < 991).every((i) => i.opacity > 0.99), "没有脚本时首屏条目播完应全部可见");
  assert.ok(noScript.every((i) => i.state === "none"), "没有脚本时不该有条目被标成 waiting");
  await browser.send("Emulation.setScriptExecutionDisabled", { value: false });

  // 减少动态效果：没有动画，直接显示
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(base + "/posts", 2000);
  const reduced = await browser.evaluate(snapshot(pages["/posts"]));
  assert.ok(reduced.every((i) => i.delay === null && i.opacity > 0.99 && i.state === "none"), `减少动态效果时不该有进场动画：${JSON.stringify(reduced)}`);

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("PASS 文章、手记、思考列表：首屏条目一插进来就依次浮上（不等脚本、不闪），以下的滚到才播且只播一次，站内跳转也播，没有脚本时全部可见，减少动态效果时不动");
} finally {
  browser.close();
}
