// 浏览器回归测试：详情页“返回来时的那一页”（2026-11-15 站长：点进文章后只能用浏览器后退）。
// 文章、手记、页面的标题上方（面包屑左边），从站内别的页面点进来时有一个“← 返回首页 / 时间线 / 搜索结果……”，写明回哪去，
// 点了走浏览器后退（回去停在原来看到的位置）；从站外直接打开时不出现。去处读浏览器自己的历史（Navigation API），按钮写的和后退去的是同一页。
// 窄屏（不到 90rem）右下角阅读工具条最前面也有一个返回按钮，宽屏侧栏里没有（标题上方那个够用）。
// 需要先运行 pnpm dev。用法：node scripts/e2e/back-link.mjs
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { openBrowser, sleep } from "../headless-browser.mjs";

const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const shots = new URL("../../.local/previews/back-link/", import.meta.url);
mkdirSync(shots, { recursive: true });
const b = await openBrowser({ port: 9490 });
const waitFor = async (expression, ms = 40000) => {
  for (let t = 0; t < ms; t += 200) { if (await b.evaluate(expression).catch(() => false)) return true; await sleep(200); }
  return false;
};
const shot = async (name) => {
  const { result } = await b.send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  writeFileSync(new URL(`${name}.jpg`, shots), Buffer.from(result.data, "base64"));
};
const backLink = `(() => { const a = document.querySelector(".detail-back"); return a?.checkVisibility() ? { text: a.innerText.trim(), path: new URL(a.href).pathname + new URL(a.href).search } : null })()`;
// 站内点一个链接（Next 客户端跳转），等地址变过去、返回链接出现
const open = async (selector) => {
  const href = await b.evaluate(`(() => { const a = document.querySelector('${selector}'); a.scrollIntoView({ block: "center" }); return a.getAttribute("href") })()`);
  await sleep(600);
  const y = await b.evaluate("scrollY");
  await b.evaluate(`document.querySelector('${selector}[href="${href}"]').click()`);
  assert.ok(await waitFor(`location.pathname === ${JSON.stringify(href)}`), `跳到 ${href}`);
  return { href, y };
};

try {
  await b.setViewport(1920, 991);

  // ① 从首页点进文章：“← 返回首页”，点了回首页、停在原来的位置
  await b.goto(`${web}/`, 3000);
  assert.ok(await waitFor(`Boolean(document.querySelector('.home-timeline a.card-link[href^="/posts/"]')?.checkVisibility())`), "首页有文章");
  const fromHome = await open('.home-timeline a.card-link[href^="/posts/"]');
  assert.ok(await waitFor(`Boolean(${backLink})`), "文章页有返回链接");
  assert.deepEqual(await b.evaluate(backLink), { text: "返回首页", path: "/" }, "写明回首页，链接也指向首页");
  assert.equal(await b.evaluate(`document.querySelector(".detail-back")?.closest(".detail-top")?.querySelector(".detail-crumb") !== null`), true, "在面包屑那一行、面包屑左边");
  // 和旁边的面包屑链接一个样子（标题区的链接默认带下划线，面包屑和返回都不要）
  const looks = await b.evaluate(`(() => { const style = (el) => { const cs = getComputedStyle(el); return { decoration: cs.textDecorationLine, size: cs.fontSize, color: cs.color } }; return { back: style(document.querySelector(".detail-back")), crumb: style(document.querySelector(".detail-crumb a")) } })()`);
  assert.deepEqual(looks.back, looks.crumb, `返回和面包屑链接样子一致：${JSON.stringify(looks)}`);
  await shot("post-from-home");
  await b.evaluate(`document.querySelector(".detail-back").click()`);
  assert.ok(await waitFor(`location.pathname === "/"`), "点了回到首页");
  await sleep(1200);
  const y = await b.evaluate("scrollY");
  assert.ok(Math.abs(y - fromHome.y) < 80, `回去停在原来的位置（原来 ${fromHome.y}，现在 ${y}）`);

  // ② 从时间线点进手记：“← 返回时间线”
  await b.goto(`${web}/timeline`, 3000);
  assert.ok(await waitFor(`Boolean(document.querySelector('.timeline-list a.card-link[href^="/notes/"]')?.checkVisibility())`), "时间线有手记");
  await open('.timeline-list a.card-link[href^="/notes/"]');
  assert.ok(await waitFor(`${backLink}?.text === "返回时间线"`), `手记页写“返回时间线”：${JSON.stringify(await b.evaluate(backLink))}`);

  // ②b 从一篇手记点到另一篇（左侧时间线）：“← 返回上一页”。两边都有返回链接时，Next 在 useInsertionEffect 里 pushState，
  // 浏览器当场发 currententrychange，订阅回调要是直接让 React 更新会报 “useInsertionEffect must not schedule updates”
  const before = b.errors.length;
  assert.ok(await waitFor(`Boolean(document.querySelector('.note-timeline a:not([aria-current])')?.checkVisibility())`), "左侧时间线有别的手记");
  await open('.note-timeline a:not([aria-current])');
  assert.ok(await waitFor(`${backLink}?.text === "返回上一页"`), `手记到手记写“返回上一页”：${JSON.stringify(await b.evaluate(backLink))}`);
  await sleep(1500);
  assert.deepEqual(b.errors.slice(before), [], "手记到手记跳转时不能报错");

  // ③ 从搜索结果点进文章：“← 返回搜索结果”，点了回到带关键词的结果页
  await b.goto(`${web}/posts?q=${encodeURIComponent("的")}`, 3000);
  assert.ok(await waitFor(`Boolean(document.querySelector('.entry a.card-link[href^="/posts/"]')?.checkVisibility())`), "搜索有结果");
  await open('.entry a.card-link[href^="/posts/"]');
  assert.ok(await waitFor(`${backLink}?.text === "返回搜索结果"`), `写“返回搜索结果”：${JSON.stringify(await b.evaluate(backLink))}`);
  await b.evaluate(`document.querySelector(".detail-back").click()`);
  assert.ok(await waitFor(`location.pathname === "/posts" && new URLSearchParams(location.search).get("q") === "的"`), "回到带关键词的结果页");

  // ④ 宽屏右侧操作栏里没有返回按钮
  await b.evaluate(`history.forward()`);
  assert.ok(await waitFor(`location.pathname.startsWith("/posts/") && Boolean(document.querySelector(".article-actions"))`), "前进回到文章");
  assert.equal(await b.evaluate(`Boolean(document.querySelector(".article-actions .is-back")?.checkVisibility())`), false, "宽屏侧栏里不放返回按钮");

  // ⑤ 从站外直接打开：没有返回链接
  await b.send("Page.navigate", { url: "about:blank" });
  await sleep(500);
  const article = fromHome.href;
  await b.goto(`${web}${article}`, 4000);
  assert.ok(await waitFor(`Boolean(document.querySelector(".post-detail-title")?.checkVisibility())`), "直接打开的文章显示出来");
  await sleep(1000);
  assert.equal(await b.evaluate(`Boolean(document.querySelector(".detail-back"))`), false, "从站外直接打开时没有返回链接");

  // ⑥ 手机：从菜单进页面（关于我等），标题上方和右下角阅读工具条都有返回
  await b.setViewport(390, 844);
  await b.goto(`${web}/`, 3000);
  assert.ok(await waitFor(`Boolean(document.querySelector(".mobile-menu-trigger")?.checkVisibility())`), "手机有菜单按钮");
  await b.evaluate(`document.querySelector(".mobile-menu-trigger").click()`);
  assert.ok(await waitFor(`Boolean(document.querySelector(".mobile-menu-section .mobile-menu-children a")?.checkVisibility())`), "菜单里有页面");
  const page = await b.evaluate(`(() => { const a = document.querySelector(".mobile-menu-section .mobile-menu-children a"); const href = a.getAttribute("href"); a.click(); return href })()`);
  assert.ok(await waitFor(`location.pathname === ${JSON.stringify(page)}`), `进到页面 ${page}`);
  assert.ok(await waitFor(`${backLink}?.text === "返回首页"`), `页面标题上方写“返回首页”：${JSON.stringify(await b.evaluate(backLink))}`);
  const toolbar = `(() => { const button = document.querySelector(".article-actions .is-back"); return button?.checkVisibility() ? button.getAttribute("aria-label") : null })()`;
  await b.evaluate(`scrollTo(0, 300)`);
  assert.ok(await waitFor(`${toolbar} === "返回首页"`), `阅读工具条里有返回按钮：${await b.evaluate(toolbar)}`);
  await shot("page-390");
  await b.evaluate(`document.querySelector(".article-actions .is-back").click()`);
  assert.ok(await waitFor(`location.pathname === "/"`), "点工具条的返回回到首页");

  assert.deepEqual(b.errors.filter((e) => !/Transition was skipped/.test(e)), [], "页面不能报错");
  console.log("back-link: 通过（首页、时间线、搜索结果来的写明去处并回到原位置，站外直接打开不显示，宽屏侧栏不放，手机工具条有返回）");
} finally {
  await b.close();
}
