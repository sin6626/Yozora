// 请求检查：RSS 全文（2026-11-07，docs/shiro-gaps.md 第 5 项）。不开浏览器。
// /feed.xml 是合法 XML（xmllint）；最多 10 条、文章和手记都有；每条有描述和 content:encoded 全文；
// 链接以后台“网站地址”开头、能打开；正文里没有脚本；条目和 Core 公开列表一致（没有草稿、加密手记）。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const response = await fetch(`${base}/feed.xml`);
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type") ?? "", /application\/rss\+xml/);
const xml = await response.text();
execFileSync("xmllint", ["--noout", "-"], { input: xml });

const site = (await (await fetch(`${core}/aggregate`)).json()).url.web_url.replace(/\/$/, "");
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => ({
  link: body.match(/<link>([^<]*)<\/link>/)?.[1],
  description: body.match(/<description>([^<]*)<\/description>/)?.[1],
  content: body.match(/<content:encoded><!\[CDATA\[([\s\S]*)\]\]><\/content:encoded>/)?.[1],
}));
assert.ok(items.length > 0 && items.length <= 10, `条数 ${items.length}`);
assert.ok(xml.includes('xmlns:content="http://purl.org/rss/1.0/modules/content/"'));
const posts = items.filter((item) => item.link?.startsWith(`${site}/posts/`));
const notes = items.filter((item) => item.link?.startsWith(`${site}/notes/`));
assert.ok(posts.length && notes.length, "文章和手记都要有");
assert.equal(posts.length + notes.length, items.length, "链接都以后台网站地址开头");
for (const item of items) {
  assert.ok(item.description?.trim(), `${item.link} 没有描述`);
  assert.ok(item.content && /<(p|h\d|ul|ol|pre|blockquote|table)\b/.test(item.content), `${item.link} 没有全文 HTML`);
  assert.ok(!/<script|javascript:/i.test(item.content), `${item.link} 正文里有脚本`);
  assert.equal((await fetch(item.link.replace(site, base), { redirect: "manual" })).status, 200, `${item.link} 打不开`);
}

// 和 Core 公开列表一致：手记是公开列表里最新的那些（加密、定时、草稿不在公开列表里），文章只有已发布的
const publicNotes = (await (await fetch(`${core}/notes?size=10`)).json()).data.map((note) => `${site}/notes/${note.nid}`);
for (const note of notes) assert.ok(publicNotes.includes(note.link), `${note.link} 不在公开手记列表里`);
const publicPosts = (await (await fetch(`${core}/posts?size=50`)).json()).data.map((post) => `${site}/posts/${encodeURIComponent(post.category.slug)}/${encodeURIComponent(post.slug)}`);
for (const post of posts) assert.ok(publicPosts.includes(post.link), `${post.link} 不在公开文章列表里`);
console.log(`feed: ok（${posts.length} 篇文章、${notes.length} 篇手记）`);
