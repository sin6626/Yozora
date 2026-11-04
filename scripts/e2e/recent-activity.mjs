// 浏览器回归测试：首页右栏“最近发生的事”（components/recent-activity.tsx）。
// 2026-11-04 用户要求：不放碎碎念（首页上面已经有碎碎念那一栏，这里重复）和一言（Core 的 /activity/recent 本来就不返回一言）。
// 只剩评论、点赞、新文章、新手记、思考五类；列表不能是空的。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9405 });
try {
  await browser.setViewport(1920, 991);
  for (const path of ["/", "/en"]) {
    await browser.goto(`${base}${path}`);
    await sleep(2500);
    const list = await browser.evaluate(`(() => {
      const timeline = [...document.querySelectorAll(".activity-timeline")].find((el) => el.offsetParent !== null);
      if (!timeline) return null;
      const items = [...timeline.querySelectorAll(".activity-item")];
      return { kinds: [...new Set(items.map((item) => item.dataset.kind))], count: items.length, murmurLinks: timeline.querySelectorAll('a[href$="/murmurs"]').length };
    })()`);
    assert.ok(list && list.count > 0, `${path}：首页“最近发生的事”要有内容：${JSON.stringify(list)}`);
    assert.ok(list.kinds.every((kind) => ["comment", "like", "post", "note", "recent"].includes(kind)), `${path}：只放评论、点赞、新文章、新手记、思考，实际 ${list.kinds}`);
    assert.equal(list.murmurLinks, 0, `${path}：不能有指向碎碎念的链接`);
  }
  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("PASS 最近发生的事：只有评论、点赞、新文章、新手记、思考，没有碎碎念和一言（中文、英文首页）");
} finally {
  browser.close();
}
