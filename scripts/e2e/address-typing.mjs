// 浏览器回归测试：站内跳转时地址栏路径“删旧打新”（lib/address-typing.ts，2026-11-10 站长定）。
// 无头浏览器没有地址栏，所以在页面加载前包住 history.replaceState / pushState，记下每一次调用写进去的地址和 state：
// ① 首页 → 文章：中间帧依次是 /p /po /pos /post，最后是真实地址；每次都带 Next 的 history.state（__NA），否则 Next 会当成路由更新；
//    中间帧不发请求；访问记录（/pageview）报的路径和来源都是真实地址，不是中间帧；
// ② 动画中途再跳一次：离开的那条历史记录写回真实地址，后退回去地址是对的；
// ③ 减少动态效果时不播。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：node scripts/e2e/address-typing.mjs
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";
import { clickNav } from "./helpers.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9487 });

const recorder = `{
  window.__history = [];
  for (const kind of ["replaceState", "pushState"]) {
    const original = history[kind].bind(history);
    history[kind] = function (state, unused, url) {
      const path = url == null ? location.pathname : new URL(url, location.href).pathname;
      window.__history.push({ kind, path: decodeURIComponent(path), next: !!(state && state.__NA) });
      return original(state, unused, url);
    };
  }
}`;
const takeHistory = () => browser.evaluate("window.__history.splice(0)");
const requested = () => browser.evaluate(`performance.getEntriesByType("resource").map((e) => e.name)`);

try {
  await browser.setViewport(1920, 991);
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: recorder });
  await browser.goto(`${base}/`);
  await takeHistory();
  await browser.evaluate("performance.clearResourceTimings()");

  // ① 首页 → 文章
  assert.equal(await browser.evaluate(clickNav("/posts")), "/posts");
  const calls = await takeHistory();
  const ours = calls.filter((call) => call.kind === "replaceState" && call.path !== "/posts").map((call) => call.path);
  assert.deepEqual(ours, ["/p", "/po", "/pos", "/post"], `中间帧应是删旧打新：${JSON.stringify(calls)}`);
  assert.equal(calls.at(-1).path, "/posts", "最后一次写的是真实地址");
  assert.ok(calls.every((call) => call.next), `每次都应带 Next 的 history.state：${JSON.stringify(calls)}`);
  assert.equal(await browser.evaluate("location.pathname"), "/posts");
  const names = await requested();
  const middle = names.filter((name) => ["/p", "/po", "/pos", "/post"].includes(new URL(name).pathname));
  assert.deepEqual(middle, [], "中间帧不应发请求");
  const pageview = names.map((name) => new URL(name)).find((url) => url.pathname.endsWith("/pageview") && url.searchParams.get("path") === "/posts");
  assert.ok(pageview, `应报一次 /posts 的访问：${names.filter((name) => name.includes("pageview"))}`);
  assert.equal(pageview.searchParams.get("ref"), `${base}/`, "访问记录的来源应是上一页的真实地址，不是中间帧");

  // ② 动画进行中又新增一条历史记录（像 Next 那样带着它的 state 调 pushState）：离开的那条记录要先写回真实地址，
  //    后退回去才是 /notes 而不是中间帧。开发模式下点链接要等数据回来才 push，动画早播完了，所以这里直接 push
  const middleAt = await browser.evaluate(`(async () => {
    document.querySelector('.navigation-List a[href="/notes"]').click();
    for (let i = 0; i < 300 && location.pathname === "/posts"; i++) await new Promise((r) => setTimeout(r, 10));
    for (let i = 0; i < 100 && (location.pathname === "/notes" || location.pathname === "/posts"); i++) await new Promise((r) => setTimeout(r, 5));
    const middle = decodeURIComponent(location.pathname);
    history.pushState(history.state, "", "/timeline");
    return middle;
  })()`);
  assert.ok(middleAt !== "/notes" && middleAt !== "/posts", `push 时应正在播动画：${middleAt}`);
  const back = await browser.evaluate(`new Promise((resolve) => { addEventListener("popstate", () => resolve(location.pathname), { once: true }); history.back(); })`);
  assert.equal(back, "/notes", `后退回去的那条记录应是真实地址 /notes，不是中间帧（push 时显示的是 ${middleAt}）`);
  await sleep(1500);
  assert.equal(await browser.evaluate("location.pathname"), "/notes");
  // 上面手动 push 的那条记录 Next 并不知道，整页回到文章页再继续
  await browser.goto(`${base}/posts`);

  // ③ 减少动态效果时不播
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await takeHistory();
  assert.equal(await browser.evaluate(clickNav("/notes")), "/notes");
  const still = (await takeHistory()).filter((call) => call.path !== "/notes");
  assert.deepEqual(still, [], `减少动态效果时不应有中间帧：${JSON.stringify(still)}`);
  await browser.send("Emulation.setEmulatedMedia", { features: [] });

  assert.deepEqual(browser.errors, [], "不应有页面报错");
  console.log("PASS 地址栏删旧打新：中间帧顺序、带 Next 的 state、不发请求、访问记录用真实地址；中途再跳时离开的记录写回真实地址；减少动态效果不播");
} finally {
  await browser.close();
}
