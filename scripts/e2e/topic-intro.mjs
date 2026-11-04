// 后台“话题”的简介和详细描述要出现在手记的话题筛选页（英文页面用 Core 的译文，详细描述标中文），
// 手记详情里的话题要链回话题筛选。期望值从 Core 现读。需要先运行 pnpm dev（WEB_URL、API_URL 可覆盖）。
import assert from "node:assert/strict";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const api = process.env.API_URL ?? "http://127.0.0.1:2333";
const get = async (url) => (await fetch(url)).text();
const unescape = (html) => html.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

const topics = (await (await fetch(`${api}/topics/all`)).json()).data;
const english = new Map((await (await fetch(`${api}/topics/all?lang=en`)).json()).data.map((topic) => [topic.id, topic]));
let checked = 0;
for (const topic of topics) {
  const notes = (await (await fetch(`${api}/notes/topics/${topic.id}?size=1`)).json()).data;
  if (!notes.length) continue;
  const zh = unescape(await get(`${base}/notes?topic=${encodeURIComponent(topic.slug)}`));
  const en = unescape(await get(`${base}/en/notes?topic=${encodeURIComponent(topic.slug)}`));
  if (topic.introduce) assert.ok(zh.includes(`<p class="post-meta">${topic.introduce}</p>`), `中文话题页有简介：${topic.introduce}`);
  if (english.get(topic.id)?.introduce) assert.ok(en.includes(`<p class="post-meta">${english.get(topic.id).introduce}</p>`), "英文话题页用 Core 的译文");
  if (topic.description) {
    assert.ok(zh.includes(`<p class="post-meta">${topic.description}</p>`), "中文话题页有详细描述");
    assert.ok(en.includes(`<p class="post-meta" lang="zh-CN">${topic.description}</p>`), "英文页面的详细描述标中文");
  }
  const detail = await get(`${base}/notes/${notes[0].nid}`);
  assert.ok(detail.includes(`href="/notes?topic=${encodeURIComponent(topic.slug)}"`), "手记详情的话题链回话题筛选");
  checked++;
}
assert.ok(checked > 0, "至少检查了一个有手记的话题");
console.log(`topic-intro: 通过（${checked} 个话题）`);
