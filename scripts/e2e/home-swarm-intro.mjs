// 浏览器回归测试：首页蜂群开场（home-swarm-intro.tsx，2026-11-10 站长定）。
// ① /?swarm 强制播：第一屏先被盖住，CSS 入场不播；光标把第一屏画出来，底部中文进度条（光标数、还剩几个元素）；
//    没有原版的“Y”开场图标和英文控制栏；丛雨的闭眼帧不交给光标画，图片占位是透明的（三层图不会被灰块挡住）；
//    1 倍速在 25 秒内画完，蜂群图层慢慢淡出（中途能采到半透明），播完遮罩、夜空快照、蜂群图层都拿掉，真实页面完全不透明；
// ② 站内跳走再回首页：不播蜂群，照常播 CSS 入场；
// ③ 判断脚本：从外面打开（无来源、navigate）和刷新都播（刷新不管这个标签页播没播过）；同一标签页第二次从外面进、减少动态效果、别的页面不播；Esc 跳过后真实页面在；
//    光标在画的时候读者滚不动（滚轮、PageDown、End），Esc 跳过或引擎加载不了放弃开场后能照常滚；
// ④ 光标图层出现之前，屏幕上每一帧都是一片夜色：页头和首屏插进页面的那一刻已经盖住；流式内容进来时 React 播换页过渡，
//    带名字的页头和正文层会被抬到遮罩上面画（导航栏和首屏先露出来），所以按真实画面的像素检查，不只看样式；
//    无头浏览器的 navigator.webdriver 是 true（其他 e2e 因此不会被开场挡住），这一段用注入脚本把它改成 false 来测。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：node scripts/e2e/home-swarm-intro.mjs
import assert from "node:assert/strict";
import sharp from "sharp";
import { openBrowser, sleep } from "../headless-browser.mjs";
import { clickNav } from "./helpers.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9481 });

// 整页打开后立刻在页面里每 100ms 采一次样，直到开场播完（data-swarm-intro="done"）
const watch = `(async () => {
  const html = document.documentElement;
  const rec = { logoSeen: [], englishSeen: 0, states: [], hud: [], opacity: [], placeholders: [], blinkIgnored: false, sky: false, total: 0, done: 0, cursors: 0, rise: false };
  const t0 = performance.now();
  while (performance.now() - t0 < 30000) {
    const state = html.dataset.swarmIntro ?? "none";
    if (rec.states.at(-1) !== state) rec.states.push(state);
    const description = document.querySelector(".home-hero-description");
    if (description?.getAnimations().some((a) => a.animationName === "home-hero-rise")) rec.rise = true;
    const p = window.SwarmCursors?.progress?.();
    if (p) { rec.total = Math.max(rec.total, p.total); rec.done = Math.max(rec.done, p.done); rec.cursors = Math.max(rec.cursors, p.cursors); }
    const root = window.SwarmCursors?.root?.();
    if (root) {
      const hud = root.querySelector(".yz-hud");
      if (hud && rec.hud.at(-1) !== hud.textContent) rec.hud.push(hud.textContent);
      const intro = root.querySelector(".intro");
      if (intro && getComputedStyle(intro).display !== "none") rec.logoSeen.push({ t: Math.round(performance.now() - t0), hud: !!root.querySelector(".yz-hud"), state, opacity: getComputedStyle(intro).opacity, gone: intro.classList.contains("gone") });
      const english = root.querySelector(".hud");
      if (english && getComputedStyle(english).display !== "none") rec.englishSeen++;
      // 丛雨三层图的占位：前层、后层叠在一起，占位要透明，否则后画的那层在出图前用一块底色挡住先画好的
      const mascots = [...document.querySelectorAll(".home-hero-mascot:not(.is-blink)")].map((img) => img.currentSrc || img.src);
      for (const m of root.querySelectorAll(".m")) {
        const src = m.querySelector("img.md, img")?.src;
        if (src && mascots.includes(src)) rec.placeholders.push(getComputedStyle(m).backgroundColor);
      }
    }
    const host = document.querySelector("swarm-rebuild");
    if (host) rec.opacity.push(Number(getComputedStyle(host).opacity));
    if (document.querySelector(".home-hero-mascot.is-blink")?.hasAttribute("data-swarm-ignore")) rec.blinkIgnored = true;
    if (document.querySelector(".swarm-sky")) rec.sky = true;
    if (state === "done" || state === "none" && rec.states.length > 1) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  rec.seconds = (performance.now() - t0) / 1000;
  rec.placeholders = [...new Set(rec.placeholders)];
  return rec;
})()`;

const after = () => browser.evaluate(`(() => {
  const title = document.querySelector(".home-hero-title > span");
  return {
    state: document.documentElement.dataset.swarmIntro ?? "none",
    host: !!document.querySelector("swarm-rebuild"),
    cover: !!document.querySelector(".swarm-cover"),
    sky: !!document.querySelector(".swarm-sky"),
    ignored: document.querySelectorAll("[data-swarm-ignore]").length,
    opacity: getComputedStyle(title).opacity,
    rise: document.querySelector(".home-hero-description").getAnimations().some((a) => a.animationName === "home-hero-rise"),
    // 伪元素遮罩（脚本接手前的那层）不能还留着
    pseudo: getComputedStyle(document.body, "::after").content,
  };
})()`);

const stateNow = () => browser.evaluate(`document.documentElement.dataset.swarmIntro ?? "none"`);
// 读者自己滚：屏幕正中滚一下滚轮，再按 PageDown、End，返回之后的滚动位置
const userScroll = async () => {
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 960, y: 500 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 960, y: 500, deltaX: 0, deltaY: 800 });
  for (const [key, code] of [["PageDown", 34], ["End", 35]]) {
    await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: code });
    await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code });
  }
  await sleep(600);
  return browser.evaluate("scrollY");
};
const jsErrors = () => browser.errors.filter((e) => !/Download the React DevTools|\\[HMR\\]|\\[Fast Refresh\\]/.test(e));

try {
  await browser.setViewport(1920, 991);

  // ④ 页头和首屏第一次插进页面时，记下那一刻有没有被盖住（在页面所有脚本之前注入）
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: `{
    window.__firstSeen = {};
    new MutationObserver(() => {
      for (const name of ["site-header", "home-hero"]) {
        if (window.__firstSeen[name] || !document.querySelector("." + name) || !document.body) continue;
        const cover = getComputedStyle(document.body, "::after");
        window.__firstSeen[name] = { mark: document.documentElement.dataset.swarmIntro ?? "none", covered: cover.content !== "none" && cover.position === "fixed" && cover.opacity === "1" };
      }
    }).observe(document, { childList: true, subtree: true });
  }` });
  // 录屏：从开始导航到光标图层插进页面（页面里记下的时刻）之间的每一帧，最亮的像素都不能超过夜色（没有文字、导航栏）
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: `new MutationObserver((list, observer) => {
    if (!document.querySelector("swarm-rebuild")) return;
    window.__swarmAt = performance.timeOrigin + performance.now();
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true })` });
  const darkUntilSwarm = async (url, label) => {
    const frames = [];
    const onFrame = (m) => {
      if (m.method !== "Page.screencastFrame") return;
      frames.push({ at: m.params.metadata.timestamp * 1000, data: m.params.data });
      browser.send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
    };
    await browser.evaluate("window.__swarmAt = null").catch(() => {});
    browser.listeners.push(onFrame);
    await browser.send("Page.startScreencast", { format: "png", maxWidth: 960, maxHeight: 496 });
    if (url) await browser.goto(url, 0); else { await browser.send("Page.reload"); }
    let swarmAt = null;
    for (let i = 0; i < 100 && !swarmAt; i++) { await sleep(100); swarmAt = await browser.evaluate("window.__swarmAt ?? null").catch(() => null); }
    await browser.send("Page.stopScreencast");
    browser.listeners.splice(browser.listeners.indexOf(onFrame), 1);
    assert.ok(swarmAt, `${label}：光标图层应出现`);
    // 新页面第一次绘制之前的帧还是上一页（about:blank 或刷新前的页面），不算
    const paintAt = await browser.evaluate(`performance.timeOrigin + (performance.getEntriesByName("first-paint")[0]?.startTime ?? 0)`);
    let checked = 0;
    for (const frame of frames.filter((f) => f.at >= paintAt && f.at < swarmAt)) {
      // 左下角开发模式的 Next 标志不算页面内容，底部 50px 不看
      const image = sharp(Buffer.from(frame.data, "base64"));
      const { width, height } = await image.metadata();
      const cropped = await image.extract({ left: 0, top: 0, width, height: height - 50 }).toBuffer(); // stats() 不认 extract，要先出图
      const { channels } = await sharp(cropped).stats();
      const brightest = Math.max(...channels.slice(0, 3).map((c) => c.max));
      if (brightest >= 70 && process.env.SWARM_FRAME_DIR) (await import("node:fs")).writeFileSync(`${process.env.SWARM_FRAME_DIR}/leak-${Math.round(frame.at - frames[0].at)}.png`, Buffer.from(frame.data, "base64"));
      assert.ok(brightest < 70, `${label}：光标开始画之前第 ${Math.round(frame.at - frames[0].at)}ms 的画面露出了页面（最亮 ${brightest}）`);
      checked++;
    }
    assert.ok(checked >= 3, `${label}：应采到光标开始前的几帧：${checked}/${frames.length}`);
    return checked;
  };
  const coveredFirst = async (label) => {
    const seen = await browser.evaluate("window.__firstSeen");
    for (const name of ["site-header", "home-hero"]) assert.deepEqual(seen[name], { mark: "pending", covered: true }, `${label}：${name} 出现的那一刻整页应已被夜色盖住：${JSON.stringify(seen)}`);
  };

  // ① 强制播一次
  await browser.send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  const darkFrames = await darkUntilSwarm(`${base}/?swarm`, "强制播");
  const run = await browser.evaluate(watch);
  await coveredFirst("强制播");
  assert.ok(run.states.includes("playing") && run.states.at(-1) === "done", `应从 playing 播到 done：${JSON.stringify(run.states)}`);
  assert.equal(run.rise, false, "开场期间首屏不应再播 CSS 入场");
  // 只看采样期间有没有露出来过：机器忙时采样晚开始，那时图标元素可能已经被引擎拿掉，取不到值不算失败
  assert.deepEqual(run.logoSeen, [], `原版“Y”开场图标不应露出来：${JSON.stringify(run.logoSeen.slice(0, 5))}`);
  assert.equal(run.englishSeen, 0, "原版英文控制栏不应露出来");
  assert.ok(run.hud.some((text) => /\d+ 个光标/.test(text)) && run.hud.some((text) => /还剩 \d+ \/ \d+ 个元素/.test(text)), `底部应显示光标数和剩余元素：${JSON.stringify(run.hud.slice(0, 8))}`);
  assert.ok(run.hud.some((text) => text.includes("全部画完")), `画完应显示用时：${JSON.stringify(run.hud.slice(-4))}`);
  assert.ok(run.total >= 20 && run.done === run.total, `第一屏的元素都应画完：${run.done}/${run.total}`);
  assert.ok(run.cursors >= 10, `应有一群光标：${run.cursors}`);
  assert.ok(run.blinkIgnored, "丛雨的闭眼帧不应交给光标画");
  assert.ok(run.placeholders.length > 0 && run.placeholders.every((bg) => bg === "rgba(0, 0, 0, 0)"), `图片占位应透明（否则叠层图被灰块挡住）：${JSON.stringify(run.placeholders)}`);
  assert.ok(run.sky, "开场期间应有夜空快照");
  assert.ok(run.seconds < 25, `1 倍速第一屏应在 25 秒内画完：${run.seconds.toFixed(1)}s`);
  assert.ok(run.opacity.some((value) => value > 0.05 && value < 0.95), `蜂群图层应慢慢淡出，而不是一下消失：${JSON.stringify(run.opacity.slice(-25))}`);

  await sleep(1500);
  const done = await after();
  assert.deepEqual(
    { state: done.state, host: done.host, cover: done.cover, sky: done.sky, ignored: done.ignored, opacity: done.opacity, rise: done.rise },
    { state: "done", host: false, cover: false, sky: false, ignored: 0, opacity: "1", rise: false },
    `播完后应只剩真实页面：${JSON.stringify(done)}`,
  );
  assert.equal(done.pseudo, "none", "伪元素遮罩不应留着");

  // ② 站内跳走再回来：不播蜂群，照常播入场
  assert.equal(await browser.evaluate(clickNav("/timeline")), "/timeline");
  assert.equal(await browser.evaluate(clickNav("/", 200)), "/");
  const back = await after();
  assert.equal(back.state, "none", "站内跳回首页不应播蜂群");
  assert.equal(back.host, false);
  assert.ok(back.rise, "站内跳回首页应播 CSS 入场");

  assert.deepEqual(jsErrors(), [], "不应有页面报错");

  // ③ 判断脚本：把 navigator.webdriver 改成 false，像普通读者那样打开
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: `Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false })` });
  const pointer = await browser.evaluate(`matchMedia("(hover: hover) and (pointer: fine)").matches`);
  assert.ok(pointer, "无头浏览器应当是有鼠标的桌面环境，否则下面测不到");
  await browser.evaluate("sessionStorage.clear()");

  await browser.goto(`${base}/`, 300);
  assert.ok(["pending", "playing"].includes(await stateNow()), "从外面打开首页应准备播");
  await coveredFirst("从外面打开");
  // 光标开始画以后（引擎开始前会自己把页面滚一遍来扫描，那段不算）：读者滚轮、PageDown、End 都滚不动，光标只画第一屏，滚走了画面就乱了（2026-11-14 站长）
  let drawing = false;
  for (let i = 0; i < 150 && !drawing; i++) {
    drawing = await browser.evaluate(`(() => { const p = window.SwarmCursors?.progress?.(); return !!p && p.started && !p.complete })()`);
    if (!drawing) await sleep(100);
  }
  assert.ok(drawing, "光标应开始画");
  assert.equal(await browser.evaluate("scrollY"), 0, "光标开始画时页面在顶上");
  assert.equal(await userScroll(), 0, "开场期间读者不应能滚动页面");
  assert.equal(await stateNow(), "playing", "滚动不应打断开场");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(1200);
  const skipped = await after();
  assert.deepEqual({ state: skipped.state, host: skipped.host, cover: skipped.cover, opacity: skipped.opacity }, { state: "done", host: false, cover: false, opacity: "1" }, `Esc 跳过后应露出真实页面：${JSON.stringify(skipped)}`);
  assert.ok((await userScroll()) > 0, "跳过开场后应能照常滚动");

  await browser.goto(`${base}/`, 300);
  assert.equal(await stateNow(), "none", "同一标签页第二次打开不应再播");

  // 刷新：这个标签页已经播过（sessionStorage 有标记）也要播
  assert.equal(await browser.evaluate(`sessionStorage.getItem("swarm-intro")`), "1");
  await darkUntilSwarm(null, "刷新");
  await coveredFirst("刷新");
  const replay = await browser.evaluate(watch);
  assert.equal(replay.states.at(-1), "done", `刷新后应播完：${JSON.stringify(replay.states)}`);

  await browser.evaluate("sessionStorage.clear()");
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(`${base}/`, 300);
  assert.equal(await stateNow(), "none", "减少动态效果时不应播");
  await browser.send("Emulation.setEmulatedMedia", { features: [] });

  await browser.evaluate("sessionStorage.clear()");
  await browser.goto(`${base}/posts`, 300);
  assert.equal(await stateNow(), "none", "别的页面不应播");

  // 引擎脚本加载不了：放弃开场，页面不能一直锁着不让滚
  await browser.send("Network.enable");
  await browser.send("Network.setBlockedURLs", { urls: ["*swarm-cursors.js*"] });
  await browser.goto(`${base}/?swarm`, 300);
  let gaveUp = false;
  for (let i = 0; i < 80 && !gaveUp; i++) { gaveUp = (await stateNow()) === "none"; if (!gaveUp) await sleep(100); }
  await browser.send("Network.setBlockedURLs", { urls: [] });
  assert.ok(gaveUp, "引擎加载不了时应放弃开场");
  assert.ok((await userScroll()) > 0, "放弃开场后应能照常滚动");

  console.log(`PASS 首页蜂群开场：光标开始前 ${darkFrames} 帧都是夜色；强制播 ${run.seconds.toFixed(1)}s 画完 ${run.total} 个元素、${run.cursors} 个光标，进度条、透明占位、慢慢淡出；刷新也播、页头和首屏出现时已盖住；站内跳回、第二次从外面进、减少动态效果、别的页面不播；开场期间滚不动，Esc 跳过或放弃开场后能滚；Esc 跳过`);
} finally {
  await browser.close();
}
