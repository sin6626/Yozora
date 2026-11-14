// 首页第一屏下面那块（最新文章、手记、碎碎念、最近发生的事）要和首屏一起在页面骨架里（2026-11-14 站长：首屏好了下面也该好了，
// 不然一往下滑还在读）。数据来自 Next 缓存的 getHomeFeed，生产构建时被预渲染进页面骨架，所以服务端最先发出的 HTML 里就有：
// 没有占位（.home-room-pending 只在缓存读不到、退回现取时才出现），内容也不在流式补发的 <div hidden id="S:…"> 里。
// 开发模式不预渲染、缓存内容也照样流式补发，所以这项只能对生产服务器测：next build + next start，或 beta。
// 用法：WEB_URL=http://127.0.0.1:2340 node scripts/e2e/home-first-html.mjs（不开浏览器）
import assert from "node:assert/strict";

const base = process.env.WEB_URL;
assert.ok(base && !/:2323\b/.test(base), "要对生产服务器测（next start 或 beta），用 WEB_URL 指定；开发模式（2323）不预渲染");

// 先打开一次让缓存热起来，再取真正要检查的那次
await fetch(base + "/");
const html = await (await fetch(base + "/")).text();
const room = html.indexOf('class="home-room"');
assert.ok(room > 0, "页面里要有首屏下面那块");
const streamed = html.indexOf('<div hidden id="S:', room);
const before = streamed < 0 ? html.slice(room) : html.slice(room, streamed);
assert.ok(!html.includes("home-room-pending"), "不该出现等待占位：首屏下面那块应当已经在页面骨架里");
for (const [what, marker] of [["文章、手记", "home-timeline-item"], ["碎碎念", "home-murmurs"], ["最近发生的事", "activity-timeline"]]) {
  assert.ok(before.includes(marker), `${what}应当在最先发出的 HTML 里，而不是之后流式补发`);
}
console.log("home-first-html: 通过（首屏下面的文章、手记、碎碎念、最近发生的事和首屏一起在页面骨架里）");
