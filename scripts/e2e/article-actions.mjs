// 浏览器回归测试：文章目录下的操作栏（components/article-actions.tsx）与阅读胶囊里的日期、进度。
// ① 有喜欢、评论（边读边聊的悬浮窗，调试页有示例消息流）、分享、回到顶部（后台开了订阅时还有订阅）；② 回到顶部在页面顶部时隐藏，往下读后出现，进度环跟着读的进度走；
// ③ 夜航岛阅读胶囊显示发布日期和百分比；④ 分享用系统分享面板（Web Share API），不支持时复制链接并由夜航岛播报“链接已复制”；
// ⑤ 目录比屏幕长时目录自己滚动，操作栏仍在屏幕内；⑥ 侧栏的心和文末“喜欢这篇”共用状态（点赞请求在页面里用替身拦截，不写日常库）；⑦ 点目录平滑滚动、标题停在夜航岛下方；⑧ 滚到页面最底下时悬浮栏不被页脚挡住；⑨ 点回到顶部会回到页面顶端。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9340 });
const click = async (selector) => {
  const [x, y] = await browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
};

try {
  await browser.setViewport(1920, 991);
  await browser.send("Browser.grantPermissions", { origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await browser.goto(`${base}/timeline/posts`, 3000);
  // 优先用目录最长的富文本演示文章：目录比屏幕长时操作栏也必须留在屏幕里
  const post = await browser.evaluate(`(() => { const links = [...document.querySelectorAll(".timeline-list a")]; return (links.find((a) => a.href.includes("rich-text-components")) ?? links[0]).getAttribute("href"); })()`);
  await browser.goto(base + post);

  const top = await browser.evaluate(`({
    like: !!document.querySelector(".article-actions .is-like"),
    share: !!document.querySelector('.article-actions [aria-label^="分享"]'),
    comment: !!document.querySelector('.article-actions [aria-label^="评论"]'),
    topVisible: document.querySelector(".article-actions .is-top").hasAttribute("data-visible"),
  })`);
  assert.ok(top.like && top.share && top.comment, `操作栏缺少按钮：${JSON.stringify(top)}`);
  assert.equal(top.topVisible, false, "在页面顶部时“回到顶部”应当隐藏");

  await browser.evaluate(`(() => { const a = document.querySelector("article"); const r = a.getBoundingClientRect(); scrollTo(0, scrollY + r.top + (r.height - innerHeight) * 0.5); })()`);
  await sleep(1200);
  const reading = await browser.evaluate(`({
    topVisible: document.querySelector(".article-actions .is-top").hasAttribute("data-visible"),
    ring: Number(document.querySelector(".article-action-ring-bar").getAttribute("stroke-dashoffset")) / Number(document.querySelector(".article-action-ring-bar").getAttribute("stroke-dasharray")),
    percent: document.querySelector(".island-percent")?.textContent ?? "",
    date: document.querySelector(".island-date")?.textContent ?? "",
    actionsBottom: document.querySelector(".article-actions").getBoundingClientRect().bottom,
  })`);
  assert.ok(reading.topVisible, "往下读后“回到顶部”应当出现");
  assert.ok(reading.actionsBottom <= 991, `目录很长时操作栏也应当在屏幕内（底边 ${reading.actionsBottom}）`);
  assert.ok(reading.ring > 0.2 && reading.ring < 0.8, `读到正文一半时进度环应当画了一半左右（剩余比例 ${reading.ring}）`);
  assert.match(reading.percent, /^\d+%$/, `阅读胶囊应当显示百分比：${reading.percent}`);
  assert.ok(Number.parseInt(reading.percent) > 20 && Number.parseInt(reading.percent) < 80, `读到正文一半时百分比应当在中间：${reading.percent}`);
  assert.match(reading.date, /^\d{2}\/\d{2}$/, `阅读胶囊应当显示发布日期：${reading.date}`);

  // 分享：支持 Web Share API 时调起系统分享面板（替身记下参数，不真的弹出）；不支持时复制链接并由夜航岛播报
  await browser.evaluate(`Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.__shared = data; } })`);
  await click('.article-actions [aria-label^="分享"]');
  await sleep(300);
  const native = await browser.evaluate("window.__shared ?? null");
  assert.ok(native && native.title && decodeURI(native.url).endsWith(decodeURI(post)), `应当用系统分享面板分享本文：${JSON.stringify(native)}`);
  await browser.evaluate(`Object.defineProperty(navigator, "share", { configurable: true, value: undefined })`);
  await click('.article-actions [aria-label^="分享"]');
  await sleep(500);
  const shared = await browser.evaluate(`(async () => ({ island: document.querySelector(".island").innerText, clip: await navigator.clipboard.readText() }))()`);
  assert.match(shared.island, /链接已复制/, `不支持系统分享时夜航岛应当播报“链接已复制”：${shared.island}`);
  assert.ok(shared.clip.endsWith(decodeURI(post)) || decodeURI(shared.clip).endsWith(decodeURI(post)), `剪贴板应当是本文地址：${shared.clip}`);

  // 点赞：替身拦截 /activity/like（不写库），点侧栏的心，文末按钮也应当变成已喜欢
  const id = await browser.evaluate(`(() => {
    const original = window.fetch;
    window.fetch = (input, init) => String(input).endsWith("/activity/like") ? Promise.resolve(new Response("{}", { status: 200 })) : original(input, init);
    return Object.keys(localStorage).find((key) => key.startsWith("liked:")) ?? null;
  })()`);
  assert.equal(id, null, "测试前本地不应有点赞记录");
  await click(".article-actions .is-like");
  await sleep(800);
  const liked = await browser.evaluate(`({ aside: document.querySelector(".article-actions .is-like").getAttribute("aria-pressed"), end: document.querySelector(".like-button")?.textContent ?? "" })`);
  assert.equal(liked.aside, "true", "点侧栏的心后应当变成已喜欢");
  assert.match(liked.end, /谢谢你的喜欢/, `文末按钮应当同步变成已喜欢：${liked.end}`);
  await browser.evaluate(`Object.keys(localStorage).filter((key) => key.startsWith("liked:")).forEach((key) => localStorage.removeItem(key))`);

  // 2026-10-29 的 bug：点目录是瞬移过去的。现在平滑滚动：点下后 150ms 应当还在半路，结束时标题停在夜航岛下方（不被挡住）
  await browser.evaluate("scrollTo(0, 0)");
  await sleep(600);
  const target = await browser.evaluate(`(() => { const links = document.querySelectorAll(".article-toc a"); return links[Math.floor(links.length / 2)].getAttribute("href"); })()`);
  await browser.evaluate(`document.querySelector('.article-toc a[href="${target}"]').scrollIntoView({ block: "nearest" })`);
  await click(`.article-toc a[href="${target}"]`);
  await sleep(150);
  // 2026-10-29 的 bug：点目录时地址栏换锚点（replaceState）被 Next 当成路由更新，整页跑了一遍换页动画（失焦淡出再上浮），
  // 目录跟着消失再出现，连续点相近的两项时页面上下抖
  const pageAnimations = await browser.evaluate(`document.getAnimations().map((a) => a.animationName).filter((name) => /^page-/.test(name))`);
  assert.deepEqual(pageAnimations, [], `点目录不应触发换页动画：${pageAnimations.join("、")}`);
  const midway = await browser.evaluate("scrollY");
  await sleep(1500);
  const landed = await browser.evaluate(`({ y: scrollY, top: document.getElementById(decodeURIComponent(${JSON.stringify(target)}.slice(1))).getBoundingClientRect().top, island: document.querySelector(".island").getBoundingClientRect().bottom, hash: location.hash })`);
  assert.ok(midway > 50 && midway < landed.y - 50, `点目录应当平滑滚动（150ms 时 ${midway}，终点 ${landed.y}）`);
  assert.ok(landed.top > landed.island && landed.top < 140, `跳转后标题应当停在夜航岛下方（标题顶 ${landed.top}，岛底 ${landed.island}）`);
  assert.equal(landed.hash, target, "地址栏应当带上章节锚点");

  // 评论悬浮窗：不滚动页面，光标进输入框；点框外的文章就关（2026-10-29 用户要求，原来点外面不关），Esc 也能关
  await browser.evaluate("scrollTo(0, 1500)");
  await sleep(600);
  await click('.article-actions [aria-label^="评论"]');
  await sleep(600);
  const chat = await browser.evaluate(`({ y: scrollY, open: !!document.querySelector(".chat-popup")?.checkVisibility(), focus: document.activeElement?.closest(".chat-popup") ? document.activeElement.tagName : null, guest: !!document.querySelector(".chat-popup textarea") })`);
  assert.ok(chat.open, "点评论按钮应当打开悬浮窗");
  assert.equal(chat.y, 1500, `打开评论悬浮窗不应滚动页面（scrollY ${chat.y}）`);
  assert.ok(!chat.guest || chat.focus === "TEXTAREA", `打开后光标应当在输入框里（现在在 ${chat.focus}）`);
  await click("article p");
  await sleep(500);
  assert.ok(await browser.evaluate(`!document.querySelector(".chat-popup")?.checkVisibility()`), "点框外的文章应当关闭悬浮窗");
  await click('.article-actions [aria-label^="评论"]');
  await sleep(600);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(500);
  assert.ok(await browser.evaluate(`!document.querySelector(".chat-popup")?.checkVisibility()`), "按 Esc 应当关闭悬浮窗");

  // 2026-10-29 的 bug：滚到页面最底下时页脚（z-index 1）盖住悬浮栏下半截，喜欢/分享/回顶点不了、目录末尾几项不能悬停
  await browser.evaluate("scrollTo(0, document.documentElement.scrollHeight)");
  await sleep(1200);
  const covered = await browser.evaluate(`[".article-actions .is-like", ".article-actions .is-top", ".article-toc li:last-child a"].filter((selector) => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    return !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })`);
  assert.deepEqual(covered, [], `滚到底时这些元素被挡住了：${covered.join("、")}`);

  await sleep(2500);
  await click(".article-actions .is-top");
  await sleep(1500);
  assert.ok(await browser.evaluate("scrollY") < 5, "点回到顶部后应当回到页面顶端");

  // 调试页的示例消息流：按时间排、站长在右侧、打开时停在最新一条；点“回复”出现回复对象并亮起那条，× 取消
  await browser.goto(`${base}/debug`);
  await browser.evaluate(`document.querySelector(".debug-chat .article-action").scrollIntoView({ block: "center" })`);
  await sleep(400);
  // 2026-10-29 的 bug：打开时消息流先停在最上面，打开动画结束后才跳到最新一条，内容“弹一下”。
  // 逐帧记录最新一条在消息区里的相对位置（按比例算，不受浮层缩放入场影响），从出现起就该停在底部、不再变化。
  await browser.evaluate(`(() => {
    window.__chat = [];
    const t0 = performance.now();
    const tick = () => {
      const scroller = document.querySelector(".chat-scroller");
      const last = document.querySelector(".chat-message:last-of-type");
      if (scroller && last && scroller.checkVisibility()) {
        const box = scroller.getBoundingClientRect();
        window.__chat.push(Math.round(((last.getBoundingClientRect().bottom - box.top) / box.height) * 100) / 100);
      }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await click(".debug-chat .article-action");
  await sleep(1000);
  const positions = await browser.evaluate("window.__chat");
  assert.ok(positions.length > 3, "没采到浮层打开过程");
  assert.ok(Math.max(...positions) - Math.min(...positions) < 0.03 && positions[0] <= 1, `打开时消息流不应跳动（最新一条的相对位置逐帧：${positions.join(" ")}）`);
  const stream = await browser.evaluate(`(() => {
    const scroller = document.querySelector(".chat-scroller");
    const owner = document.querySelector(".chat-message[data-owner]");
    return {
      ids: [...document.querySelectorAll(".chat-message")].map((li) => li.dataset.id),
      ownerRight: owner.querySelector(".chat-avatar").getBoundingClientRect().x > owner.querySelector(".chat-bubble").getBoundingClientRect().x,
      // 消息区是 column-reverse（底部 scrollTop 为 0），直接看最新一条是否落在可视区内
      atBottom: (() => { const box = scroller.getBoundingClientRect(); const last = document.querySelector(".chat-message:last-of-type").getBoundingClientRect(); return last.bottom <= box.bottom && last.bottom > box.bottom - 80; })(),
    };
  })()`);
  assert.deepEqual(stream.ids, ["c1", "c2", "c3", "c4", "c5", "c6"], `消息应当按时间排成一条流：${stream.ids}`);
  assert.ok(stream.ownerRight, "站长的消息应当在右侧");
  assert.ok(stream.atBottom, "打开时应当停在最新一条");
  await browser.evaluate(`document.querySelector('.chat-message[data-id="c1"]').scrollIntoView({ block: "center" })`);
  await sleep(200);
  await click('.chat-message[data-id="c1"] .chat-bubble');
  await click('.chat-message[data-id="c1"] .chat-reply');
  await sleep(300);
  const replying = await browser.evaluate(`({ chip: document.querySelector(".chat-replying")?.innerText ?? "", lit: document.querySelector('.chat-message[data-id="c1"]').hasAttribute("data-replying"), focus: document.activeElement?.tagName })`);
  assert.match(replying.chip, /@路过的星星/, `点回复后输入框上方应当显示回复对象：${replying.chip}`);
  assert.ok(replying.lit && replying.focus === "TEXTAREA", `被回复的那条应当亮起、光标回到输入框：${JSON.stringify(replying)}`);
  await click('.chat-replying button');
  await sleep(200);
  assert.ok(await browser.evaluate(`!document.querySelector(".chat-replying") && !document.querySelector("[data-replying]")`), "取消后回复对象和高亮都应当清掉");

  console.log(`PASS 文章操作栏：按钮齐全、回到顶部随进度出现（剩余 ${reading.ring.toFixed(2)}）、胶囊显示 ${reading.date} 与 ${reading.percent}、系统分享与复制兜底、喜欢状态同步、目录平滑跳转不触发换页动画、评论悬浮窗（不滚页面、点框外或 Esc 关闭；示例消息流打开时不跳、回复）、滚到底不被页脚挡住、回到顶部`);
} finally {
  browser.close();
}
