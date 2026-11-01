// 星空性能测量（2026-11-01，评估“全站一层星空”原型用）：独立无头浏览器 1920×991，每个场景测 10 秒，
// 统计浏览器全部进程（主进程、页面、显卡进程）累计用掉的 CPU 时间：先测“静置”（页面里不跑任何测量脚本，最接近读者停在页面上读字），
// 再测页面每秒能画多少帧、有没有卡顿的长帧（测帧率的脚本本身会让页面每帧都出图，所以这一段的 CPU 偏高，只作对比）。
// 用法：node scripts/bench-sky.mjs [--gpu]（需先开 pnpm dev；--gpu 让无头浏览器走 Metal 显卡，不加则是软件模拟，显卡开销会被放大）
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { openBrowser, sleep } from "./headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const gpu = process.argv.includes("--gpu");
const seconds = 10;

// 进程树的累计 CPU 时间（秒），ps 的 TIME 列是 分:秒.百分秒
function cpuSeconds(root) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,time="], { encoding: "utf8" }).trim().split("\n").map((line) => line.trim().split(/\s+/));
  const children = new Map();
  for (const [pid, ppid] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const tree = new Set([String(root)]);
  for (const pid of tree) for (const child of children.get(pid) ?? []) tree.add(child);
  return rows.filter(([pid]) => tree.has(pid)).reduce((sum, [, , time]) => {
    const [minutes, rest] = time.split(":");
    return sum + Number(minutes) * 60 + Number(rest);
  }, 0);
}

// 进程树在接下来 seconds 秒里的 CPU% 与能耗（macOS top 的 POWER 列，即活动监视器的“能耗影响”，含显卡占用），各进程相加
async function sample(root) {
  const { stdout } = await promisify(execFile)("top", ["-l", "2", "-s", String(seconds), "-stats", "pid,ppid,cpu,power"]);
  const rows = stdout.split(/^PID.*$/m)[2].trim().split("\n").map((line) => line.trim().split(/\s+/));
  const children = new Map();
  for (const [pid, ppid] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const tree = new Set([String(root)]);
  for (const pid of tree) for (const child of children.get(pid) ?? []) tree.add(child);
  const picked = rows.filter(([pid]) => tree.has(pid));
  return { cpu: picked.reduce((sum, row) => sum + Number(row[2]), 0), power: picked.reduce((sum, row) => sum + Number(row[3]), 0) };
}
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

const frames = `new Promise((done) => {
  const gaps = []; let last = performance.now(); const end = last + ${seconds * 1000};
  const tick = (now) => { gaps.push(now - last); last = now; now < end ? requestAnimationFrame(tick) : done({ fps: Math.round(gaps.length / ${seconds}), longFrames: gaps.filter((g) => g > 50).length }); };
  requestAnimationFrame(tick);
})`;
const scroll = `(() => { const timer = setInterval(() => window.scrollBy(0, 60), 100); setTimeout(() => clearInterval(timer), ${seconds * 1000}); })()`;

const browser = await openBrowser({ port: 9361, args: gpu ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : [] });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`, 6000);
  const renderer = await browser.evaluate(`(() => { const gl = document.createElement("canvas").getContext("webgl"); const info = gl?.getExtension("WEBGL_debug_renderer_info"); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "无 WebGL"; })()`);
  const article = await browser.evaluate(`[...document.querySelectorAll('a[href*="/posts/"]')].map((a) => a.getAttribute("href")).find((href) => href.split("/").length >= 4)`);
  console.log(`显卡：${renderer}`);
  const scenes = [["首页第一屏 静止", "/", null], ["文章列表 静止", "/posts", null], ["文章详情 静止", article, null], ["文章详情 滚动", article, scroll]];
  for (const [name, path, action] of scenes) {
    await browser.goto(`${base}${path}`, 6000);
    await sleep(1000);
    const percent = (from) => `${((cpuSeconds(browser.pid) - from) / seconds * 100).toFixed(1).padStart(5)}%`;
    // 静置：测三次取中位数，开发模式下热更新连接、在线状态轮询等会让单次读数跳动
    let idle = "             —";
    if (!action) {
      const runs = [];
      for (let run = 0; run < 3; run++) runs.push(await sample(browser.pid));
      idle = `${median(runs.map((run) => run.cpu)).toFixed(1).padStart(5)}%  能耗 ${median(runs.map((run) => run.power)).toFixed(1).padStart(5)}`;
    }
    const before = cpuSeconds(browser.pid);
    if (action) await browser.evaluate(action);
    const result = await browser.evaluate(frames);
    console.log(`${name.padEnd(10, "　")}  静置 CPU ${idle}  测帧时 CPU ${percent(before)}  ${result.fps} 帧/秒  长帧 ${result.longFrames}  画布 ${await browser.evaluate("document.querySelectorAll('canvas').length")}`);
  }
} finally {
  await browser.close();
}
