// 浏览器回归测试：页头站名下面的站长“正在用 / 在听”（components/owner-presence.tsx）。
// 走真实链路：向本地 Core 的云函数 /fn/ps/update POST 一条测试状态（只写 Redis，两分钟过期），
// 页面靠 WebSocket 广播即时显示、刷新后靠 GET 显示；只在顶部铺开时显示、不压住导航、太长用省略号；结束时 DELETE 清空。
// 需要先运行 pnpm dev，并用 node scripts/install-ps-function.mjs 装好云函数（密钥在 .local/presence.json）。用法：pnpm e2e
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = JSON.parse(readFileSync(new URL("../../.local/publish.json", import.meta.url), "utf8")).local.api;
const key = JSON.parse(readFileSync(new URL("../../.local/presence.json", import.meta.url), "utf8")).local.key;
const send = async (method, body = {}) => {
  const response = await fetch(new URL("/fn/ps/update", core), { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ key, ...body }) });
  assert.ok(response.ok, `${method} /fn/ps/update 应当成功（HTTP ${response.status}），先运行 node scripts/install-ps-function.mjs`);
};
const app = { name: "E2E 测试 App" };
const song = { title: "测试歌", artist: "测试歌手" };

const browser = await openBrowser({ port: 9372 });
const presence = () => browser.evaluate(`(() => {
  const el = document.querySelector(".owner-presence");
  if (!el || !el.checkVisibility()) return null;
  const box = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const others = [...document.querySelectorAll(".site-brand-name, .island-nav a, .island-nav button, .island-tools > *")].filter((e) => e.checkVisibility()).map(box);
  const me = box(el);
  const hit = others.some((o) => me.left < o.right && me.right > o.left && me.top < o.bottom && me.bottom > o.top);
  return { text: el.textContent, title: el.title, width: me.right - me.left, truncated: el.scrollWidth > el.clientWidth, hit };
})()`);
const waitFor = async (check, message) => {
  for (let i = 0; i < 40; i++) {
    if (check(await presence())) return;
    await sleep(100);
  }
  assert.fail(message);
};

try {
  await send("DELETE");
  await browser.setViewport(1280, 800);
  await browser.goto(`${base}/posts`);
  assert.equal(await presence(), null, "站长不在时什么都不显示");

  await send("POST", { process: app, media: song });
  await waitFor((p) => p?.text.includes("在用 E2E 测试 App") && p.text.includes("在听 测试歌 – 测试歌手"), "POST 之后 WebSocket 广播即时显示在用的 App 和在听的歌");
  await sleep(400); // 等入场动画（从上方 3px 落下）结束再量位置
  assert.equal((await presence()).hit, false, "不压住站名、导航和右侧工具");

  await send("POST", { process: app, media: { title: "很长的歌名".repeat(20), artist: song.artist } });
  await waitFor((p) => p?.title.includes("很长的歌名很长的歌名"), "换歌也即时更新");
  const long = await presence();
  assert.ok(long.truncated && long.width <= 26 * 16 + 1, `太长时用省略号，最宽 26rem（实际 ${long.width}px）`);
  assert.equal(long.hit, false, "很长时也不压住导航");

  await browser.goto(`${base}/posts`);
  await waitFor((p) => p?.text.includes("在用 E2E 测试 App"), "刷新后从 GET 读出当前状态");
  await browser.evaluate("window.scrollTo(0, 600)");
  await sleep(800);
  assert.equal(await browser.evaluate(`document.querySelector(".site-header").dataset.mode`), "expanded");
  assert.equal(await presence(), null, "往下滚、页头变成导航条后不显示");
  await browser.evaluate("window.scrollTo(0, 0)");
  await sleep(800);

  await send("POST", { process: app, media: { title: null } });
  await waitFor((p) => p && !p.text.includes("在听"), "不放歌后只剩在用的 App");
  await send("DELETE");
  await waitFor((p) => p === null, "清空后消失");

  await browser.goto(`${base}/en/posts`);
  await send("POST", { process: app, media: song });
  await waitFor((p) => p?.text.includes("Using E2E 测试 App") && p.text.includes("Listening to 测试歌 – 测试歌手"), "英文页面用英文措辞");

  assert.deepEqual(browser.errors, [], "页面不应当有报错");
  console.log("PASS 站长正在用 / 在听：广播即时显示、刷新读当前状态、不压导航、长文省略、滚动后隐藏、清空消失、英文措辞");
} finally {
  await send("DELETE").catch(() => {});
  await browser.close();
}
