// 浏览器回归测试：置顶文章、标记过的手记（后台“回忆项”）在列表里的样式（2026-11-01 用户在 /debug 选了“星轨 + 微光”）。
// ① 置顶/回忆：一圈几乎看不见的细线框、不铺底色；标题上方一行小字“置顶 / 回忆”；标题是月光色（和首页强调词同一个 --moonlight），隔一会儿扫过一道微光；
//    左栏仍是日期，没有发光的星；② 一颗带尾迹的小星沿着框的轮廓绕：画在和框重合的 SVG 圆角矩形上，转弯也贴着框，
//    整个 SVG 不超出条目；③ 普通条目没有这些；手记仍按时间排；④ 英文标签；⑤ 减少动态效果时不绕不扫。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9376 });

// 星轨真的在走：隔 400 毫秒读两次头那段描边的偏移量，要变（曾经关键帧里的值浏览器插值不了，动画在跑、星却停在原地）
const moving = async () => {
  const offsets = () => browser.evaluate(`[...document.querySelectorAll(".site-content .entry-orbit-head")].filter((el) => el.checkVisibility()).map((el) => getComputedStyle(el).strokeDashoffset)`);
  const before = await offsets();
  await new Promise((r) => setTimeout(r, 400));
  const after = await offsets();
  return before.length > 0 && before.every((value, i) => value !== after[i]);
};
const entries = () => browser.evaluate(`(() => {
  const content = [...document.querySelectorAll(".site-content")].find((el) => el.offsetParent !== null);
  const probe = document.createElement("span");
  probe.style.color = "var(--moonlight)";
  content.append(probe);
  const moonlight = getComputedStyle(probe).color;
  probe.remove();
  return [...content.querySelectorAll(".post-list .entry, .note-list .entry")].map((entry) => {
    const style = getComputedStyle(entry);
    const box = entry.getBoundingClientRect();
    const orbit = entry.querySelector(".entry-orbit");
    const orbitBox = orbit?.getBoundingClientRect();
    const titleLink = entry.querySelector(".entry-title a");
    return {
      featured: entry.classList.contains("is-featured"),
      label: entry.querySelector(".entry-label")?.textContent.trim() ?? null,
      labelAboveTitle: (() => { const label = entry.querySelector(".entry-label"); return label ? label.getBoundingClientRect().bottom <= entry.querySelector(".entry-title").getBoundingClientRect().top + 1 : null; })(),
      filled: style.backgroundImage !== "none" || style.backgroundColor !== "rgba(0, 0, 0, 0)",
      shadow: style.boxShadow !== "none",
      border: style.borderTopStyle !== "none" && style.borderTopWidth !== "0px",
      glowingDateStar: !!entry.querySelector(".entry-star"),
      day: !!entry.querySelector(".entry-day"),
      titleColor: getComputedStyle(titleLink).color,
      titleFill: getComputedStyle(titleLink).webkitTextFillColor,
      sheen: titleLink.getAnimations().some((a) => a.animationName === "entry-sheen"),
      moonlight,
      orbit: orbit ? {
        inside: orbitBox.left >= box.left - 0.5 && orbitBox.top >= box.top - 0.5 && orbitBox.right <= box.right + 0.5 && orbitBox.bottom <= box.bottom + 0.5,
        matches: Math.abs(orbitBox.width - box.width) < 2 && Math.abs(orbitBox.height - box.height) < 2,
        offset: getComputedStyle(orbit.querySelector(".entry-orbit-head")).strokeDashoffset,
      } : null,
      date: entry.querySelector("time")?.getAttribute("datetime"),
    };
  });
})()`);

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/posts`);
  const posts = await entries();
  const pinned = posts.filter((entry) => entry.featured);
  assert.ok(pinned.length > 0, "本地应有置顶文章");
  for (const entry of pinned) {
    assert.ok(entry.label === "置顶" && entry.labelAboveTitle, `标题上方应有一行“置顶”：${JSON.stringify(entry)}`);
    assert.ok(entry.border && !entry.filled && !entry.shadow, `置顶只有细线框，不铺底色不加阴影：${JSON.stringify(entry)}`);
    assert.ok(!entry.glowingDateStar && entry.day, "左栏仍是日期，没有发光的星");
    assert.ok(entry.sheen, "标题隔一会儿扫过一道微光");
    assert.ok(entry.orbit?.inside && entry.orbit.matches, `星轨画在和框重合的 SVG 上、不超出条目：${JSON.stringify(entry.orbit)}`);
  }
  assert.ok(await moving(), "星轨的小星要真的沿轮廓移动");
  // 标题平时是月光色：微光用渐变填充文字时文字本身透明，所以比较静止时的颜色（减少动态效果下再看一次）
  for (const entry of posts.filter((item) => !item.featured)) assert.ok(!entry.label && !entry.orbit && !entry.border, `普通文章没有这些：${JSON.stringify(entry)}`);

  await browser.goto(`${base}/notes`);
  const notes = await entries();
  const memories = notes.filter((entry) => entry.featured);
  assert.ok(memories.length > 0 && memories.every((entry) => entry.label === "回忆" && entry.orbit?.inside), `标记过的手记同样样式、“回忆”：${JSON.stringify(memories)}`);
  const dates = notes.map((entry) => entry.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "手记仍按时间从新到旧排，标记过的不挪到最前");

  await browser.goto(`${base}/en/posts`);
  assert.ok((await entries()).some((entry) => entry.featured && entry.label === "Pinned"), "英文页面写 Pinned");

  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  for (const palette of ["night", "ink", "galaxy"]) {
    await browser.goto(`${base}/posts?palette=${palette}`);
    const still = (await entries()).filter((entry) => entry.featured);
    assert.ok(still.every((entry) => !entry.sheen) && !(await moving()), "减少动态效果时不绕不扫");
    assert.ok(still.every((entry) => entry.titleColor === entry.moonlight), `${palette}：置顶标题应是月光色 ${still[0]?.moonlight}，实际 ${still.map((entry) => entry.titleColor)}`);
  }

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 置顶 ${pinned.length} 篇、回忆 ${memories.length} 篇：细线框无底色、标题上方小字、月光色标题与微光、星轨贴着框绕、普通条目没有、手记按时间排、英文 Pinned、三套配色月光色、减少动态效果不动`);
} finally {
  browser.close();
}
