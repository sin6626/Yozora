// 浏览器回归测试：窄屏和手机的阅读工具（components/article-actions.tsx 的窄屏样子，docs/shiro-gaps.md 第 1 项）。
// 宽度不到 90rem 时右侧悬浮栏放不下，原来整栏隐藏，1366/1280 笔记本和手机读者没有目录、分享、去评论、回到顶部。
// 现在：① 1280×800 与 390×844 下右下角有一枚悬浮的工具胶囊（目录、喜欢、评论、分享、回到顶部），在屏幕内并让开边缘；
// ② 点目录在浮层里显示同一份目录，当前章节高亮，点条目跳过去并收起浮层；③ 往下读时胶囊收起、往上滚时出现；④ 回到顶部；
// ⑤ 手机上评论悬浮窗不超出屏幕；⑥ 1920 宽屏仍是原来的右侧悬浮栏（目录在侧栏里），没有目录按钮、胶囊不悬浮；⑦ 减少动态效果时没有过渡、目录直接跳。
// 不点赞、不发评论（不写日常库）。需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：node scripts/e2e/reading-tools.mjs
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9431 });
const center = (selector) => browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
const click = async (selector) => {
  const [x, y] = await center(selector);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
};
// 用滚轮滚（真实的滚动方向），dy 正数往下
const wheel = async (dy) => {
  for (let i = 0; i < 4; i++) {
    await browser.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 100, y: 300, deltaX: 0, deltaY: dy / 4 });
    await sleep(60);
  }
  await sleep(700);
};
const tools = () => browser.evaluate(`(() => {
  const bar = document.querySelector(".article-actions");
  const r = bar.getBoundingClientRect();
  const visible = (s) => !!document.querySelector(s)?.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  return {
    position: getComputedStyle(bar).position,
    opacity: Number(getComputedStyle(bar).opacity),
    rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    tucked: bar.hasAttribute("data-tucked"),
    toc: visible(".article-actions .is-toc"),
    like: visible(".article-actions .is-like"),
    comment: visible('.article-actions [aria-label^="评论"]'),
    share: visible('.article-actions [aria-label^="分享"]'),
    top: visible(".article-actions .is-top"),
    asideToc: visible(".site-details .article-toc"),
    transition: getComputedStyle(bar).transitionDuration,
  };
})()`);

async function openPost() {
  await browser.goto(`${base}/timeline/posts`, 3000);
  // 富文本演示文章的标题最多，目录最长
  const post = await browser.evaluate(`(() => { const links = [...document.querySelectorAll(".timeline-list a")]; return (links.find((a) => a.href.includes("rich-text-components")) ?? links[0]).getAttribute("href"); })()`);
  await browser.goto(base + post);
  return post;
}

async function narrow(width, height) {
  await browser.setViewport(width, height);
  await openPost();
  const label = `${width}×${height}`;

  const first = await tools();
  assert.equal(first.position, "fixed", `${label}：工具应当悬浮在屏幕上（position ${first.position}）`);
  assert.ok(first.toc && first.comment && first.share && first.like, `${label}：缺少按钮 ${JSON.stringify(first)}`);
  assert.equal(first.asideToc, false, `${label}：侧栏里的目录应当隐藏（放不下）`);
  assert.ok(first.rect.right <= width - 8 && first.rect.bottom <= height - 8 && first.rect.left >= 8, `${label}：工具应当在右下角屏幕内并离边缘有空隙 ${JSON.stringify(first.rect)}`);
  assert.ok(first.rect.left > width / 3, `${label}：工具应当靠右，不横在正文中间 ${JSON.stringify(first.rect)}`);

  // 读到正文一半：回到顶部出现；打开目录，当前章节高亮
  await browser.evaluate(`(() => { const a = document.querySelector("article"); const r = a.getBoundingClientRect(); scrollTo(0, scrollY + r.top + (r.height - innerHeight) * 0.5); })()`);
  await sleep(900);
  await wheel(-200); // 往上滚一点，胶囊出现
  const mid = await tools();
  assert.equal(mid.tucked, false, `${label}：往上滚时工具应当出现`);
  assert.ok(mid.top, `${label}：读到一半时应当有回到顶部`);
  await click(".article-actions .is-toc");
  await sleep(500);
  const popup = await browser.evaluate(`(() => {
    const box = document.querySelector(".toc-popup");
    if (!box?.checkVisibility()) return null;
    const r = box.getBoundingClientRect();
    return { links: box.querySelectorAll(".article-toc a").length, current: box.querySelector('.article-toc a[aria-current="location"]')?.textContent ?? null, focused: document.activeElement?.getAttribute("aria-current") === "location", rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
  })()`);
  assert.ok(popup, `${label}：点目录按钮应当打开目录浮层`);
  assert.ok(popup.links > 3, `${label}：浮层里应当是正文的目录（${popup.links} 项）`);
  assert.ok(popup.current, `${label}：浮层里当前章节应当高亮`);
  assert.ok(popup.focused, `${label}：打开目录时焦点应当落在当前章节上（顺带滚进可见范围）`);
  assert.ok(popup.rect.left >= 0 && popup.rect.right <= width && popup.rect.top >= 0 && popup.rect.bottom <= height, `${label}：目录浮层应当在屏幕内 ${JSON.stringify(popup.rect)}`);

  // 点目录里靠后的一项：跳过去，浮层收起
  const target = await browser.evaluate(`(() => { const links = document.querySelectorAll(".toc-popup .article-toc a"); const a = links[links.length - 2]; a.scrollIntoView({ block: "nearest" }); return a.getAttribute("href"); })()`);
  await sleep(200);
  await click(`.toc-popup .article-toc a[href="${target}"]`);
  await sleep(1600);
  const landed = await browser.evaluate(`({ open: !!document.querySelector(".toc-popup")?.checkVisibility(), top: document.getElementById(decodeURIComponent(${JSON.stringify(target)}.slice(1))).getBoundingClientRect().top, hash: location.hash })`);
  assert.equal(landed.open, false, `${label}：点目录条目后浮层应当收起`);
  assert.ok(landed.top > 0 && landed.top < 160, `${label}：应当跳到那一节（标题顶 ${landed.top}）`);
  assert.equal(landed.hash, target, `${label}：地址栏应当带上章节锚点`);

  // 往下读收起，往上滚出现
  await browser.evaluate("scrollTo(0, 400)");
  await sleep(300);
  await wheel(600);
  const down = await tools();
  assert.ok(down.tucked && down.opacity < 0.05, `${label}：往下读时工具应当收起，不挡正文 ${JSON.stringify(down)}`);
  await wheel(-300);
  const up = await tools();
  assert.ok(!up.tucked && up.opacity > 0.95, `${label}：往上滚时工具应当出现 ${JSON.stringify(up)}`);

  // 评论悬浮窗在屏幕内（只打开看位置，不发评论）
  await click('.article-actions [aria-label^="评论"]');
  await sleep(600);
  const chat = await browser.evaluate(`(() => { const r = document.querySelector(".chat-popup")?.getBoundingClientRect(); return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
  assert.ok(chat && chat.left >= 0 && chat.right <= width && chat.top >= 0 && chat.bottom <= height, `${label}：评论悬浮窗应当在屏幕内 ${JSON.stringify(chat)}`);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(500);

  // 滚到底：工具仍在，页脚最后一行不被它挡住
  await browser.evaluate("scrollTo(0, document.documentElement.scrollHeight)");
  await sleep(900);
  const bottom = await browser.evaluate(`(() => {
    const bar = document.querySelector(".article-actions").getBoundingClientRect();
    const links = [...document.querySelectorAll(".site-footer a")].filter((a) => a.checkVisibility());
    const hit = links.filter((a) => { const r = a.getBoundingClientRect(); return r.right > bar.left && r.left < bar.right && r.bottom > bar.top && r.top < bar.bottom; });
    return { shown: !document.querySelector(".article-actions").hasAttribute("data-tucked"), covered: hit.map((a) => a.textContent) };
  })()`);
  assert.ok(bottom.shown, `${label}：滚到底时工具应当出现`);
  assert.deepEqual(bottom.covered, [], `${label}：工具挡住了页脚链接`);

  await click(".article-actions .is-top");
  // 平滑滚动的时长随页面长度和机器忙闲变化（长文章在 dev 编译时偶尔超过 1.5 秒），等到回顶或最多 5 秒
  let top = Infinity;
  for (let waited = 0; waited < 5000 && top >= 5; waited += 100) { await sleep(100); top = await browser.evaluate("scrollY"); }
  assert.ok(top < 5, `${label}：点回到顶部后应当回到页面顶端（停在 ${top}）`);
}

try {
  await narrow(1280, 800);
  await narrow(390, 844);

  // 宽屏：原来的右侧悬浮栏，目录在侧栏里，没有目录按钮
  await browser.setViewport(1920, 991);
  await openPost();
  const wide = await tools();
  assert.equal(wide.asideToc, true, "1920 宽屏：目录应当在右侧悬浮栏里");
  assert.equal(wide.toc, false, "1920 宽屏：不应有目录按钮");
  assert.notEqual(wide.position, "fixed", "1920 宽屏：操作栏应当在侧栏里，不单独悬浮");
  await browser.evaluate("scrollTo(0, 1200)");
  await sleep(300);
  await wheel(600);
  assert.ok((await tools()).opacity > 0.95, "1920 宽屏：往下读时侧栏操作不收起");

  // 减少动态效果：没有过渡，目录直接跳
  await browser.setViewport(1280, 800);
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await openPost();
  const still = await tools();
  assert.ok(still.position === "fixed" && /^0s(, 0s)*$/.test(still.transition), `减少动态效果时工具不该有过渡（${still.transition}）`);
  await click(".article-actions .is-toc");
  await sleep(400);
  const target = await browser.evaluate(`(() => { const links = document.querySelectorAll(".toc-popup .article-toc a"); return links[links.length - 2].getAttribute("href"); })()`);
  await browser.evaluate(`document.querySelector('.toc-popup .article-toc a[href="${target}"]').click()`);
  await sleep(120);
  const jumped = await browser.evaluate(`document.getElementById(decodeURIComponent(${JSON.stringify(target)}.slice(1))).getBoundingClientRect().top`);
  assert.ok(jumped > 0 && jumped < 160, `减少动态效果时目录应当直接跳到（120ms 时标题顶 ${jumped}）`);

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("PASS 窄屏阅读工具：1280 与手机下右下角有目录/喜欢/评论/分享/回到顶部，目录浮层高亮当前章节、跳转后收起，往下读收起往上滚出现，评论窗在屏幕内，滚到底不挡页脚；1920 仍是右侧悬浮栏；减少动态效果无过渡");
} finally {
  await browser.close();
}
