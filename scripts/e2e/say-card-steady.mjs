// 浏览器回归测试：一言星空的卡片浮出来以后，字不能再跳（2026-11-14 站长录屏：鼠标移到星上，卡片出现快结束时后几行突然往下挪 1px，收起时又跳回来）。
// 原因是卡片左上角落在小数像素上：动画期间字画在卡片自己的图层里、按图层对齐像素，动画一结束改按页面对齐，小数部分越过 0.5 的那几行就差 1px。
// 1 倍屏才看得出来（2 倍屏半像素也能对齐），所以按 1 倍屏测。
// 测法：把动画放慢（CDP Animation.setPlaybackRate），对卡片截一串图，按亮的行找出每行字的上沿：
//   入场：动画走到 70% 以后（字已经清楚、缩放差不到 0.2px），每一帧的行位置都要和播完以后一样；
//   离场：动画刚开始的几帧（缩放、模糊还几乎没变）也要和播完时一样。
// 需要先运行 pnpm dev。用法：node scripts/e2e/say-card-steady.mjs
import assert from "node:assert/strict";
import sharp from "sharp";
import { openBrowser, sleep } from "../headless-browser.mjs";

const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const b = await openBrowser({ port: 9496 });

// 截图里每行字的上沿（灰度大于 140 的像素多于 2 个算有字，连续 4 行以上算一行字）
async function rows(clip) {
  const { result } = await b.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  const { data, info } = await sharp(Buffer.from(result.data, "base64")).greyscale().raw().toBuffer({ resolveWithObject: true });
  const tops = [];
  let start = -1;
  for (let y = 0; y < info.height; y++) {
    let lit = 0;
    for (let x = 10; x < info.width - 10; x++) if (data[y * info.width + x] > 140) lit++;
    if (lit > 2 && start < 0) start = y;
    if (lit <= 2 && start >= 0) {
      if (y - start > 3) tops.push(start);
      start = -1;
    }
  }
  return tops.join(",");
}

const cardState = (leaving) => b.evaluate(`(() => {
  const card = [...document.querySelectorAll('.say-sky-card')].find((c) => c.hasAttribute('data-leaving') === ${leaving} && c.checkVisibility());
  const a = card?.getAnimations()[0];
  return a ? { time: a.currentTime, state: a.playState } : null;
})()`);
const move = (x, y) => b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const away = [6, 500];

try {
  await b.setViewport(1920, 991, 1);
  await b.goto(`${web}/says`, 4000);
  await sleep(3000); // 等星星依次亮完
  await b.send("Animation.enable");
  const stars = await b.evaluate(`[...document.querySelectorAll('.say-sky')].filter((s) => s.checkVisibility()).flatMap((s) => [...s.querySelectorAll('.say-star')]).map((s) => { const r = s.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })`);
  assert.ok(stars.length >= 3, `一言页要有几颗星：${stars.length}`);
  const report = [];
  for (const [i, [x, y]] of stars.entries()) {
    // 先正常播一次，量出卡片位置和播完后的行位置
    await move(x, y);
    await sleep(700);
    const rect = await b.evaluate(`(() => { const r = [...document.querySelectorAll('.say-sky-card')].find((c) => !c.hasAttribute('data-leaving') && c.checkVisibility()).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()`);
    const clip = { x: Math.floor(rect.x) - 4, y: Math.floor(rect.y) - 4, width: Math.ceil(rect.width) + 8, height: Math.ceil(rect.height) + 8 };
    const steady = await rows(clip);
    await move(...away);
    await sleep(700);

    // 入场放慢 5 倍
    await b.send("Animation.setPlaybackRate", { playbackRate: 0.2 });
    await move(x, y);
    const entering = [];
    for (let t0 = Date.now(); Date.now() - t0 < 2400;) {
      const state = await cardState(false);
      if (!state || state.state !== "running") break;
      const tops = await rows(clip);
      if (state.time >= 170) entering.push({ time: Math.round(state.time), tops });
    }
    assert.ok(entering.length >= 2, `第 ${i} 颗星：入场后段要采到几帧：${entering.length}`);
    for (const frame of entering) assert.equal(frame.tops, steady, `第 ${i} 颗星：卡片入场 ${frame.time}ms 时字的位置和播完后不一样（播完后会跳）`);
    await b.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await sleep(300);
    assert.equal(await rows(clip), steady, `第 ${i} 颗星：播完后的位置应和第一次一样`);

    // 离场放慢 20 倍：刚开始收起的几帧不该先跳回去
    await b.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
    await move(...away);
    const leaving = [];
    for (let t0 = Date.now(); Date.now() - t0 < 2000 && leaving.length < 4;) {
      const state = await cardState(true);
      if (state && state.state === "running" && state.time <= 12) leaving.push({ time: Math.round(state.time * 10) / 10, tops: await rows(clip) });
      else if (state && state.time > 12) break;
    }
    await b.send("Animation.setPlaybackRate", { playbackRate: 1 });
    assert.ok(leaving.length >= 1, `第 ${i} 颗星：离场开头要采到帧`);
    for (const frame of leaving) assert.equal(frame.tops, steady, `第 ${i} 颗星：卡片开始收起 ${frame.time}ms 时字跳了位置`);
    await sleep(600);
    report.push(`${steady.split(",").length} 行`);
  }
  assert.deepEqual(b.errors, [], "页面没有报错");
  console.log(`say-card-steady: 通过（${stars.length} 张卡片入场后段、离场开头字都不动：${report.join("、")}）`);
} finally {
  await b.send("Animation.setPlaybackRate", { playbackRate: 1 }).catch(() => {});
  await b.close();
}
