// 浏览器回归测试：手机全屏菜单（components/mobile-menu.tsx，2026-11-01 用户要求：要有分级、打开要有过渡）。
// ① 一级是首页、文章、手记、时间线、碎碎念、更多，每个下面列出它的二级：首页 → 后台页面，文章 → 分类，手记 → 话题（带图片），
//    时间线 → 文章 / 手记，更多 → 作品、友链、一言、思考；② 打开时各分组依次浮上（mobile-menu-rise，一组比一组晚）、星座线从上往下画出；
// ③ 点二级链接会跳转并收起菜单；④ 减少动态效果时不播动画。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9372 });

const open = async () => {
  await browser.evaluate(`document.querySelector(".mobile-menu-trigger").click()`);
  await sleep(60);
};
const menu = () => browser.evaluate(`(() => {
  const popup = document.querySelector(".mobile-menu");
  if (!popup) return null;
  const sections = [...popup.querySelectorAll(".mobile-menu-section")];
  return {
    sections: sections.map((section) => ({
      title: section.querySelector(".mobile-menu-heading")?.textContent.trim(),
      children: [...section.querySelectorAll(".mobile-menu-children a")].map((a) => ({ href: a.getAttribute("href"), icon: !!a.querySelector("img") })),
      rise: section.getAnimations().filter((a) => a.animationName === "mobile-menu-rise").map((a) => a.effect.getTiming().delay),
    })),
    line: popup.querySelector(".mobile-menu-line")?.getAnimations().map((a) => a.animationName) ?? [],
  };
})()`);

try {
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/posts`);
  await open();
  const opened = await menu();
  assert.ok(opened, "点汉堡按钮应打开菜单");
  const titles = opened.sections.map((section) => section.title);
  assert.deepEqual(titles.slice(0, 6), ["首页", "文章", "手记", "时间线", "碎碎念", "更多"], `一级顺序：${titles}`);
  const children = Object.fromEntries(opened.sections.map((section) => [section.title, section.children]));
  assert.ok(children["首页"].length > 0, "首页下面应列出后台页面");
  assert.ok(children["文章"].some((child) => child.href.startsWith("/categories/")), "文章下面应列出分类");
  assert.ok(children["手记"].some((child) => child.href.includes("topic=") && child.icon), "手记下面应列出话题并带图片");
  assert.deepEqual(children["时间线"].map((child) => child.href), ["/timeline/posts", "/timeline/notes"]);
  assert.ok(["/projects", "/friends", "/says", "/thinking"].every((href) => children["更多"].some((child) => child.href === href)), "更多下面应有作品、友链、一言、思考");

  const delays = opened.sections.map((section) => section.rise[0]);
  assert.ok(delays.every((delay, i) => typeof delay === "number" && (i === 0 || delay > delays[i - 1])), `各分组应依次浮上：${JSON.stringify(delays)}`);
  assert.ok(opened.line.includes("mobile-menu-line"), `星座线应画出来：${JSON.stringify(opened.line)}`);

  await sleep(1200);
  const category = children["文章"].find((child) => child.href.startsWith("/categories/")).href;
  await browser.evaluate(`document.querySelector('.mobile-menu-children a[href="${category}"]').click()`);
  await sleep(2500);
  assert.equal(decodeURIComponent(await browser.evaluate("location.pathname")), decodeURIComponent(category), "点二级链接应跳过去");
  assert.equal(await menu(), null, "跳转后菜单应收起");

  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(`${base}/posts`);
  await open();
  const reduced = await menu();
  assert.ok(reduced.sections.every((section) => section.rise.length === 0), "减少动态效果时不播浮上动画");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 手机菜单分级（${opened.sections.map((section) => `${section.title} ${section.children.length}`).join("、")}）、依次浮上（${delays.join(" / ")}ms）、星座线、二级链接跳转并收起、减少动态效果不播`);
} finally {
  browser.close();
}
