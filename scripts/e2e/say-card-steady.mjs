// 浏览器回归测试：一言星空的卡片浮出来以后，字不能再跳（2026-11-14 站长录屏：鼠标移到星上，卡片出现快结束时后几行突然往下挪 1px，收起时又跳回来）。
// 原因是卡片左上角落在小数像素上：动画期间字画在卡片自己的图层里、按图层对齐像素，动画一结束改按页面对齐，小数部分越过 0.5 的那几行就差 1px。
// 1 倍屏才看得出来（2 倍屏半像素也能对齐），所以按 1 倍屏测。
// 测法：把动画放慢（CDP Animation.setPlaybackRate），对卡片截一串图，找出每行字的竖直位置（相差不到 0.4px 算没动）：
//   入场：动画走到 70% 以后（字已经清楚、缩放差不到 0.2px），每一帧的行位置都要和播完以后一样；
//   离场：动画最开头 3ms 的几帧（缩放差不到 0.003px）也要和播完时一样。再往后卡片在缩小，字本来就会一像素一像素地挪
//   （离缩放原点远、位置又刚好在半像素附近的那行，收起 9ms 左右就挪了第一步），那是收起动画本身，不算跳。
// 需要先运行 pnpm dev。用法：node scripts/e2e/say-card-steady.mjs
import assert from "node:assert/strict";
import sharp from "sharp";
import { openBrowser, sleep } from "../headless-browser.mjs";

const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const b = await openBrowser({ port: 9496 });

// 截图里每行字的竖直位置：最亮的像素超过 110 的连续 4 行以上算一行字（卡片边框不到 100，底色 25 左右，最暗的日期也有 160），
// 位置取这几行上下各多看 3 行、按亮度加权的中心。不用“超过某个亮度的第一行”当位置：日期这种淡字，图层里画和直接画的抗锯齿深浅略有不同，
// 边缘那一行时有时无，会被当成跳了一行；真的跳 1px 时中心也挪 1px。
async function rows(clip) {
  const { result } = await b.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  const { data, info } = await sharp(Buffer.from(result.data, "base64")).greyscale().raw().toBuffer({ resolveWithObject: true });
  const peak = [], weight = [];
  for (let y = 0; y < info.height; y++) {
    let max = 0, sum = 0;
    for (let x = 10; x < info.width - 10; x++) {
      const v = data[y * info.width + x];
      max = Math.max(max, v);
      sum += Math.max(0, v - 40);
    }
    peak.push(max);
    weight.push(sum);
  }
  const centers = [];
  for (let y = 0, start = -1; y <= info.height; y++) {
    const lit = y < info.height && peak[y] > 110;
    if (lit && start < 0) start = y;
    if (!lit && start >= 0) {
      if (y - start > 3) {
        let total = 0, moment = 0;
        for (let r = Math.max(0, start - 3); r < Math.min(info.height, y + 3); r++) { total += weight[r]; moment += r * weight[r]; }
        centers.push(Math.round((moment / total) * 100) / 100);
      }
      start = -1;
    }
  }
  return centers;
}
const same = (a, b) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= 0.4);

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
    for (const frame of entering) assert.ok(same(frame.tops, steady), `第 ${i} 颗星：卡片入场 ${frame.time}ms 时字的位置和播完后不一样（播完后会跳）：${frame.tops} / ${steady}`);
    await b.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await sleep(300);
    const settled = await rows(clip);
    assert.ok(same(settled, steady), `第 ${i} 颗星：播完后的位置应和第一次一样：${settled} / ${steady}`);

    // 离场放慢 50 倍：刚开始收起的几帧不该先跳回去
    await b.send("Animation.setPlaybackRate", { playbackRate: 0.02 });
    await move(...away);
    const leaving = [];
    for (let t0 = Date.now(); Date.now() - t0 < 2000 && leaving.length < 4;) {
      const state = await cardState(true);
      if (state && state.state === "running" && state.time <= 3) leaving.push({ time: Math.round(state.time * 10) / 10, tops: await rows(clip) });
      else if (state && state.time > 3) break;
    }
    await b.send("Animation.setPlaybackRate", { playbackRate: 1 });
    assert.ok(leaving.length >= 1, `第 ${i} 颗星：离场开头要采到帧`);
    for (const frame of leaving) assert.ok(same(frame.tops, steady), `第 ${i} 颗星：卡片开始收起 ${frame.time}ms 时字跳了位置：${frame.tops} / ${steady}`);
    await sleep(600);
    report.push(`${steady.length} 行`);
  }
  assert.deepEqual(b.errors, [], "页面没有报错");
  console.log(`say-card-steady: 通过（${stars.length} 张卡片入场后段、离场开头字都不动：${report.join("、")}）`);
} finally {
  await b.send("Animation.setPlaybackRate", { playbackRate: 1 }).catch(() => {});
  await b.close();
}
