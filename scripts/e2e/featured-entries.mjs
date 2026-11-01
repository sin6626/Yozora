// 浏览器回归测试：置顶文章、标记过的手记（后台“回忆项”）在列表里的“北极星卡片”样式（2026-11-01 与用户约定）。
// ① 置顶文章：一张带星光的卡片（有底色和描边），左栏是会呼吸的北极星 + 小字日期，标题旁“置顶”前面一颗小星；普通文章没有这些；
// ② 标记过的手记：同样的卡片、“回忆”标签，星星是月光色；手记仍按时间排，不挪到最前；③ 英文页面标签是英文；④ 减少动态效果时星星不呼吸。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9376 });

const entries = () => browser.evaluate(`(() => {
  const content = [...document.querySelectorAll(".site-content")].find((el) => el.offsetParent !== null);
  return [...content.querySelectorAll(".post-list .entry, .note-list .entry")].map((entry) => {
    const style = getComputedStyle(entry);
    const star = entry.querySelector(".entry-star");
    return {
      featured: entry.classList.contains("is-featured"),
      badge: entry.querySelector(".badge")?.textContent.trim() ?? null,
      badgeStar: !!entry.querySelector(".badge svg"),
      background: style.backgroundImage !== "none" || style.backgroundColor !== "rgba(0, 0, 0, 0)",
      border: style.borderTopStyle !== "none" && style.borderTopWidth !== "0px",
      star: star ? { glow: getComputedStyle(star).boxShadow !== "none", color: getComputedStyle(star).backgroundColor, breathing: star.getAnimations().length > 0 } : null,
      date: entry.querySelector("time")?.getAttribute("datetime"),
    };
  });
})()`);

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/posts`);
  const posts = await entries();
  const pinned = posts.filter((entry) => entry.badge === "置顶");
  assert.ok(pinned.length > 0, "本地应有置顶文章");
  for (const entry of pinned) {
    assert.ok(entry.featured && entry.background && entry.border && entry.badgeStar, `置顶文章应是带底色、描边的卡片，“置顶”前有小星：${JSON.stringify(entry)}`);
    assert.ok(entry.star?.glow && entry.star.breathing, `置顶文章左栏应是会呼吸、发光的北极星：${JSON.stringify(entry.star)}`);
  }
  for (const entry of posts.filter((item) => !item.badge)) assert.ok(!entry.featured && !entry.star && !entry.border, `普通文章不应有北极星样式：${JSON.stringify(entry)}`);

  await browser.goto(`${base}/notes`);
  const notes = await entries();
  const memories = notes.filter((entry) => entry.featured);
  assert.ok(memories.length > 0 && memories.every((entry) => entry.badge === "回忆" && entry.star?.glow), `标记过的手记应有北极星卡片和“回忆”：${JSON.stringify(memories)}`);
  assert.notEqual(memories[0].star.color, pinned[0].star.color, "手记的星星是月光色，和文章的强调色不同");
  const dates = notes.map((entry) => entry.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "手记仍按时间从新到旧排，标记过的不挪到最前");

  await browser.goto(`${base}/en/posts`);
  assert.ok((await entries()).some((entry) => entry.featured && entry.badge === "Pinned"), "英文页面写 Pinned");

  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(`${base}/posts`);
  assert.ok((await entries()).filter((entry) => entry.featured).every((entry) => !entry.star.breathing), "减少动态效果时星星不呼吸");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 北极星卡片：置顶文章 ${pinned.length} 篇、标记过的手记 ${memories.length} 篇（月光色星星、按时间排）、英文标签、减少动态效果不呼吸`);
} finally {
  browser.close();
}
