// 独立的无头 Chromium（Playwright 缓存里的 headless shell），经 DevTools 协议驱动，不碰用户自己的浏览器。
// 截图脚本和浏览器回归测试共用。
// 浏览器配置目录每次新建在系统临时目录里，关闭时删掉（只删这次自己建的那一个）；原来固定用 /tmp/sin-headless-<端口>
// 且从不清理，攒到 34 个、2.8G（2026-10-30 清理过）。脚本中途崩溃时会留下一个，名字仍以 sin-headless- 开头。
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// args：额外的启动参数（例如测性能时开显卡）；返回值里的 pid 是浏览器主进程，测 CPU 时要连同子进程一起算
export async function openBrowser({ port = 9333, args = [] } = {}) {
  const profile = mkdtempSync(join(tmpdir(), `sin-headless-${port}-`));
  const proc = spawn(bin, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", ...args, "about:blank"], { stdio: "ignore" });
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  const cleanup = () => exited.then(() => rmSync(profile, { recursive: true, force: true }));
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(200); } }
  if (!targets) { proc.kill(); await cleanup(); throw new Error("无头浏览器没有启动"); }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else listeners.forEach((l) => l(m)); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  const errors = [];
  listeners.push((m) => { if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 4000)); if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 2000)); });

  return {
    pid: proc.pid,
    send,
    errors,
    listeners,
    async setViewport(width, height, dpr = 1) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: width < 640 });
    },
    // 整页打开（不是站内跳转），等 load 事件后再多等一会儿让客户端水合
    async goto(url, wait = 3500) {
      const loaded = new Promise((r) => listeners.push((m) => m.method === "Page.loadEventFired" && r()));
      await send("Page.navigate", { url });
      await loaded; await sleep(wait);
    },
    // 在页面里执行表达式（可 await），返回值按 JSON 取回；页面里抛错时这里也抛
    async evaluate(expression) {
      const { result } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    // 等浏览器进程退出后再删它的配置目录（还在写文件时删会删不干净）
    close() { ws.close(); proc.kill(); return cleanup(); },
  };
}
