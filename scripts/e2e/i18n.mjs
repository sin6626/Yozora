// 浏览器回归测试：站点语言（2026-10-30）。
// ① 入口规则（真实请求）：/zh/… 跳回不带前缀；没选过语言时按浏览器首选语言跳到 /en、/ja；手动选过（Cookie）以选择为准；
//    旧的文章翻译链接 ?lang=ja 跳到 /ja；未知地址 404。
// ② 页面：/en 下界面是英文、<html lang="en">、站内链接带 /en 前缀；文章正文有翻译时显示译文，没有时显示中文原文并标 lang="zh-CN"。
// ③ 语言菜单：选日本語 → 地址换成 /ja/…、记住选择、界面变日文；再选中文回到不带前缀的地址。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const request = (path, headers = {}) => fetch(base + path, { redirect: "manual", headers });
const target = (response) => response.headers.get("location")?.replace(base, "");

let response = await request("/zh/posts?page=1");
assert.deepEqual([response.status, target(response)], [308, "/posts?page=1"], "/zh/… 跳回不带前缀的地址");
response = await request("/posts", { "accept-language": "en-US,en;q=0.9" });
assert.deepEqual([response.status, target(response)], [307, "/en/posts"], "英文浏览器跳到 /en");
response = await request("/", { "accept-language": "ja,en;q=0.8" });
assert.deepEqual([response.status, target(response)], [307, "/ja"], "日文浏览器跳到 /ja");
response = await request("/posts", { "accept-language": "fr-FR,zh-CN;q=0.8" });
assert.equal(response.status, 200, "首选中文（或不支持的语言之后是中文）时留在原地址");
response = await request("/posts", { "accept-language": "en-US", cookie: "NEXT_LOCALE=zh" });
assert.equal(response.status, 200, "手动选过中文时不再按浏览器语言跳转");
response = await request("/posts", { "accept-language": "zh-CN", cookie: "NEXT_LOCALE=ja" });
assert.deepEqual([response.status, target(response)], [307, "/ja/posts"], "手动选过日文时跳到 /ja");
response = await request("/posts/study%26think/zod?lang=ja");
assert.deepEqual([response.status, target(response)], [308, "/ja/posts/study%26think/zod"], "旧的 ?lang 翻译链接跳到对应语言");
for (const path of ["/en/nope/x/y", "/a/b/c"]) assert.equal((await request(path)).status, 404, `${path} 应为 404`);

const browser = await openBrowser({ port: 9362 });
try {
  await browser.send("Network.clearBrowserCookies");
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/en/posts`, 4500);
  const page = await browser.evaluate(`(() => {
    const main = [...document.querySelectorAll("main")].find((e) => e.checkVisibility());
    const links = [...document.querySelectorAll("header a[href^='/'], main a[href^='/']")].filter((a) => a.checkVisibility()).map((a) => a.getAttribute("href"));
    return { lang: document.documentElement.lang, h1: main.querySelector("h1").textContent, links, first: main.querySelector(".entry-title a")?.getAttribute("href") };
  })()`);
  assert.equal(page.lang, "en");
  assert.equal(page.h1, "Posts");
  assert.ok(page.links.length > 5, "页面上有站内链接");
  assert.deepEqual(page.links.filter((href) => href !== "/en" && !href.startsWith("/en/")), [], "/en 页面的站内链接都带 /en 前缀");

  // 正文跟着语言：要么是 AI 译文（带翻译说明），要么是中文原文（带“只有中文”说明，标题和正文标 zh-CN），二者必居其一
  await browser.goto(base + page.first, 5000);
  const article = await browser.evaluate(`(() => {
    const main = [...document.querySelectorAll("main")].find((e) => e.checkVisibility());
    const notes = [...main.querySelectorAll(".ai-note")].map((e) => e.textContent);
    return { notes, h1Lang: main.querySelector("h1").getAttribute("lang"), bodyLang: main.querySelector(".post-list-content > div[lang]")?.getAttribute("lang") ?? null, languages: main.querySelector(".article-languages a[aria-current]")?.textContent ?? null };
  })()`);
  const translated = article.notes.some((text) => text.startsWith("Translated from Chinese by AI"));
  const original = article.notes.includes("This one is only available in Chinese for now.");
  assert.ok(translated !== original, `正文要么是译文要么是原文：${JSON.stringify(article)}`);
  if (original) assert.deepEqual([article.h1Lang, article.bodyLang], ["zh-CN", "zh-CN"], "显示中文原文时标明语言");
  if (translated) assert.equal(article.languages, "English", "语言分段里当前是 English");

  // 语言菜单：切到日本語，再切回中文。
  // 2026-11-04 用户要求先播报、再换页面（原来是先整页换过去、新页面再播报，显得傻）：点了以后菜单先收起，
  // 还在当前页时夜航岛用新语言播报一句（只有一行，不再有第二行说明），播完再整页换过去；换过去以后不再播报
  const choose = (name) => browser.evaluate(`(async () => {
    document.querySelector(".site-header .language-trigger").click();
    for (let i = 0; i < 40 && !document.querySelector(".language-item"); i++) await new Promise((r) => setTimeout(r, 50));
    [...document.querySelectorAll(".language-item")].find((item) => item.textContent.includes(${JSON.stringify(name)})).click();
  })()`);
  const announcing = () => browser.evaluate(`({ path: location.pathname, menu: !!document.querySelector(".language-menu"), title: document.querySelector(".island-activity-text strong")?.textContent ?? null, lines: document.querySelectorAll(".island-activity-text > *").length })`);
  await browser.goto(`${base}/en/notes`, 4000);
  await choose("日本語");
  await sleep(700);
  assert.deepEqual(await announcing(), { path: "/en/notes", menu: false, title: "日本語に切り替えました", lines: 1 }, "先在当前页播报（菜单已收起、用新语言、只有一行），页面还没换");
  await sleep(4500);
  const ja = await browser.evaluate(`({ path: location.pathname, lang: document.documentElement.lang, h1: [...document.querySelectorAll("main h1")].find((e) => e.checkVisibility())?.textContent, cookie: document.cookie, island: document.querySelector(".island-activity")?.textContent ?? "" })`);
  assert.equal(ja.path, "/ja/notes");
  assert.equal(ja.lang, "ja");
  assert.equal(ja.h1, "手記");
  assert.match(ja.cookie, /NEXT_LOCALE=ja/);
  assert.equal(ja.island, "", "换过去以后不再播报");
  await choose("中文");
  await sleep(4500);
  const zh = await browser.evaluate(`({ path: location.pathname, lang: document.documentElement.lang, h1: [...document.querySelectorAll("main h1")].find((e) => e.checkVisibility())?.textContent, cookie: document.cookie })`);
  assert.deepEqual([zh.path, zh.lang, zh.h1], ["/notes", "zh-CN", "手记"]);
  assert.match(zh.cookie, /NEXT_LOCALE=zh/);
  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS i18n entry redirects, cookie preference, legacy ?lang links, /en chrome and links, article ${translated ? "translation" : "Chinese fallback"}, language menu round trip (announce first, then switch)`);
} finally {
  browser.close();
}
