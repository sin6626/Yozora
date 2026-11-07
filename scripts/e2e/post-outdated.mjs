// 浏览器回归测试：文章过期提示（2026-11-07，照 Shiro 的 PostOutdate）。
// 最后修改（没改过看发布）超过 60 天的文章，正文前有一条“最后修改于 N 天前”的提示，N 与 Core 的时间对得上；
// 60 天内改过的文章没有；手记没有；开发浮层没有 Next Issue（“现在几点”只在浏览器里读，不能让预渲染报 current-time）。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const day = 86_400_000;
const age = (post) => Math.floor((Date.now() - Date.parse(post.modified || post.created)) / day);
const posts = (await (await fetch(`${core}/posts?size=50`)).json()).data;
const href = (post) => `/posts/${encodeURIComponent(post.category.slug)}/${encodeURIComponent(post.slug)}`;
const old = posts.find((post) => age(post) > 61);
const fresh = posts.find((post) => age(post) < 59);
assert.ok(old, "本地没有超过 60 天没改的文章");
const note = (await (await fetch(`${core}/notes?size=50`)).json()).data.find((item) => age(item) > 61);

const read = `(() => {
  const el = [...document.querySelectorAll(".post-outdated")].find((node) => node.checkVisibility());
  const match = (document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? "").match(/(\\d+)\\s*Issues?/);
  const issues = match ? Number(match[1]) : 0;
  if (!el) return { issues };
  const body = el.closest(".post-list-content")?.querySelector(".article-body, .article-rich");
  return { issues, text: el.innerText, role: el.getAttribute("role"), beforeBody: !!body && !!(el.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) };
})()`;

const browser = await openBrowser({ port: 9440 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}${href(old)}`, 6000);
  const shown = await browser.evaluate(read);
  assert.ok(shown.text, `超过 60 天的文章没有过期提示：${href(old)}`);
  assert.ok(shown.text.includes(`${age(old)} 天前`), `天数不对：${shown.text}（应为 ${age(old)}）`);
  assert.equal(shown.role, "note");
  assert.ok(shown.beforeBody, "提示应在正文前");
  assert.equal(shown.issues, 0, "文章页有 Next Issue");

  if (fresh) {
    await browser.goto(`${base}${href(fresh)}`, 5000);
    assert.equal((await browser.evaluate(read)).text, undefined, `60 天内改过的文章不该有提示：${href(fresh)}`);
  } else console.log("post-outdated: 本地没有 60 天内改过的文章，跳过“新文章没有提示”");

  if (note) {
    await browser.goto(`${base}/notes/${note.nid}`, 5000);
    assert.equal((await browser.evaluate(read)).text, undefined, "手记不该有过期提示");
  }

  // 外文页面同样有（文案由 Core 翻译，这里只看出现且带天数）
  await browser.goto(`${base}/en${href(old)}`, 6000);
  const en = await browser.evaluate(read);
  assert.ok(en.text?.includes(String(age(old))), "英文文章页没有过期提示");

  await browser.setViewport(390, 844);
  await browser.goto(`${base}${href(old)}`, 5000);
  assert.ok((await browser.evaluate(read)).text, "手机上没有过期提示");
  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("post-outdated: 通过");
} finally {
  await browser.close();
}
