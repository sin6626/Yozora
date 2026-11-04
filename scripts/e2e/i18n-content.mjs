// 浏览器回归测试：英文页面上的后台内容也换成了 Core 里的译文（2026-10-30）。
// 原来只翻了界面文字：分类名、文章与手记标题、心情天气、话题、页面标题、站点那句话、作品都还是中文。
// 现在前台带 ?lang= 向 Core 取内容（AI 翻译 + 翻译条目），站点描述和作品用配置片段 yozora 的 i18n；
// 站长和读者自己写的话（碎碎念、思考、一言、评论、朋友们的介绍）保持中文，但要标 lang="zh-CN"。
// 检查：这些页面（含导航的五个悬停面板）里看得见的文字，凡是含汉字的，都必须在标了中文（或其他非英文）语言的元素里。
// 代码块和行内代码里的字符串是代码，不算。需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const pages = ["/en", "/en/posts", "/en/notes", "/en/timeline", "/en/notes/1", "/en/about", "/en/projects", "/en/murmurs", "/en/thinking", "/en/says", "/en/friends"];
const scan = (selector) => `(() => {
  const roots = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((root) => root.checkVisibility());
  const found = new Set();
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const element = node.parentElement;
      if (!element || !element.checkVisibility() || element.closest("code, pre")) continue;
      const lang = element.closest("[lang]")?.getAttribute("lang") ?? "";
      if (lang && !lang.startsWith("en")) continue;
      const text = node.textContent.trim();
      if (/\\p{Script=Han}/u.test(text)) found.add(text.slice(0, 40));
    }
  }
  return [...found];
})()`;

async function hover(label) {
  const [x, y] = await browser.evaluate(`(() => {
    const trigger = [...document.querySelectorAll(".navigation-List .navigation-Trigger")].find((t) => t.textContent.trim().startsWith(${JSON.stringify(label)}));
    const r = trigger.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y + 80 });
  await sleep(500);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(900);
}

const browser = await openBrowser({ port: 9366 });
try {
  await browser.setViewport(1920, 991);
  const failures = [];
  for (const path of pages) {
    await browser.goto(base + path, 4500);
    const found = await browser.evaluate(scan(".site-header, main, .site-footer"));
    if (found.length) failures.push(`${path}：${found.join(" / ")}`);
  }
  await browser.goto(`${base}/en/notes`, 4500);
  for (const label of ["Home", "Posts", "Notes", "Timeline", "More"]) {
    await hover(label);
    const found = await browser.evaluate(scan(".navigation-Popup"));
    if (found.length) failures.push(`导航“${label}”面板：${found.join(" / ")}`);
  }
  assert.deepEqual(failures, [], "英文页面上有没标语言的中文");
  // 几样有代表性的内容确实换成了译文（不是被删掉）
  await browser.goto(`${base}/en/posts`, 4500);
  // 分类链接后面跟着篇数（<span class="tag-count">），只取前面的名字
  const posts = await browser.evaluate(`[...document.querySelectorAll("main .post-categories a")].filter((a) => a.checkVisibility()).map((a) => a.firstChild.textContent.trim())`);
  assert.ok(posts.includes("Ramblings") && posts.includes("Technology"), `分类名应是译文：${posts.join(", ")}`);
  const footerMotto = await browser.evaluate(`document.querySelector(".site-footer-motto").textContent.trim()`);
  assert.equal(footerMotto, "The stars overhead are the stars within.", "页脚那句话应是英文");
  await browser.goto(`${base}/en`, 4500);
  const motto = await browser.evaluate(`document.querySelector(".home-hero-scroll small").textContent.trim()`);
  assert.equal(motto, "Even late at night, the moon and stars keep me company.", "首屏底部的站点描述应是译文");
  await browser.goto(`${base}/en/murmurs`, 4500);
  assert.equal(await browser.evaluate(`[...document.querySelectorAll(".murmur-body")].every((body) => body.getAttribute("lang") === "zh-CN")`), true, "碎碎念标为中文");
  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 英文页面 ${pages.length} 页与五个导航面板没有未标语言的中文；分类名、站点那句话是译文，碎碎念标为中文`);
} finally {
  browser.close();
}
