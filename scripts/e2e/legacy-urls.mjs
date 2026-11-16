// 回归测试：主域名从旧 Shiro 换成 Yozora 以后，Shiro 才有的地址要跳到 Yozora 对应的页面，不能变成 404
// （订阅了 RSS 的读者、搜索引擎收录的话题页和分类页、别人博客里的链接）。2026-11-16 站长决定下掉 Shiro，主域名换成 Yozora。
// 地址取自主域名 access.log 里旧 Shiro 真实有访问的路径：
//   /feed → /feed.xml、/sitemap → /sitemap.xml、/notes/topics → /notes、/notes/topics/<话题> → /notes?topic=<话题>、
//   /posts/<分类> → /categories/<分类>、/projects/<id> → /projects。
// 不开浏览器，只发请求：第一跳必须是永久跳转（308）且指向对的地址，跟到底是 200。
// 需要先运行 pnpm dev（或 WEB_URL 指向线上）。用法：node scripts/e2e/legacy-urls.mjs
import assert from "node:assert/strict";

const web = (process.env.WEB_URL ?? "http://127.0.0.1:2323").replace(/\/+$/, "");
const headers = { "accept-language": "zh-CN" };
const page = async (path) => (await fetch(`${web}${path}`, { headers })).text();

// 分类和话题从页面上现取，测的是真实存在的那个
const category = (await page("/posts")).match(/href="\/posts\/([^/"?]+)\//)?.[1];
const topic = (await page("/notes")).match(/href="\/notes\?topic=([^"&]+)"/)?.[1];
assert.ok(category, "文章列表里能找到分类");
assert.ok(topic, "手记列表里能找到话题");

const cases = [
  ["/feed", "/feed.xml"],
  ["/sitemap", "/sitemap.xml"],
  ["/notes/topics", "/notes"],
  [`/notes/topics/${topic}`, `/notes?topic=${topic}`],
  [`/posts/${category}`, `/categories/${category}`],
  ["/projects/0123456789abcdef01234567", "/projects"],
];

for (const [from, to] of cases) {
  const first = await fetch(`${web}${from}`, { headers, redirect: "manual" });
  const location = first.headers.get("location") ?? "";
  assert.equal(first.status, 308, `${from} 要永久跳转，现在是 ${first.status}`);
  assert.equal(decodeURI(new URL(location, web).pathname + new URL(location, web).search), decodeURI(to), `${from} 跳到 ${location}`);
  const last = await fetch(`${web}${from}`, { headers });
  assert.equal(last.status, 200, `${from} 跟到底是 ${last.status}（${last.url}）`);
}

// 带 & 的分类（旧站的 study&think）也要原样跳过去
const amp = await fetch(`${web}/posts/study&think`, { headers, redirect: "manual" });
assert.equal(amp.status, 308, "/posts/study&think 要永久跳转");
assert.equal(decodeURIComponent(new URL(amp.headers.get("location"), web).pathname), "/categories/study&think");

// 还在用的地址不能被误跳：文章详情、手记列表、话题筛选
const post = (await page("/posts")).match(/href="(\/posts\/[^/"?]+\/[^/"?]+)"/)?.[1];
assert.ok(post, "文章列表里能找到文章");
for (const path of [post, "/notes", `/notes?topic=${topic}`, "/projects"]) {
  const res = await fetch(`${web}${path}`, { headers, redirect: "manual" });
  assert.equal(res.status, 200, `${path} 不该跳转，现在是 ${res.status} ${res.headers.get("location") ?? ""}`);
}

console.log(`legacy-urls: 通过（${cases.length + 1} 个旧 Shiro 地址永久跳转到 Yozora 对应页面，正在用的地址不受影响）`);
