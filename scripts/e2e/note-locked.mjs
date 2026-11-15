// 浏览器回归测试：加密手记（2026-11-12）。原来解锁后只换出光秃秃的正文，没有标题、心情、目录、评论、相邻手记；锁着时只是一个表单。
// 现在：锁着时是“月亮藏在云后面”的锁（不露标题），输错密码横线变红、提示、焦点回到输入框；输对后整页换成普通手记的样子，
// 密码存在这篇的 httpOnly 会话 Cookie 里，刷新仍是解锁的。
// 2026-11-15 站长定“标题加锁”：带密码的手记照常出现在手记列表、首页、时间线、前后手记里，标题前一把小锁，列表里摘要的位置换成
// “上了锁，输入密码才能读”，没有阅读时长；RSS 和站点地图不收；点进去是锁页。
// 本地库没有加密手记：测试直接往本地 Mongo 插一篇 nid 990012 的临时手记（不经 Core 接口，所以不发订阅邮件，也不触发 AI 摘要），
// 再用库里本地 Webhook 的密钥给前台发一个签名的 NOTE_CREATE，让首页、时间线这些缓存的列表马上更新；跑完删掉手记并发 NOTE_DELETE。
// 截图存 .local/previews/note-locked/。
// 需要先运行 pnpm dev。用法：node scripts/e2e/note-locked.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { openBrowser, sleep } from "../headless-browser.mjs";

const { MongoClient } = createRequire(new URL("../../apps/core/package.json", import.meta.url))("mongodb");
const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const mongo = new MongoClient(process.env.MONGO_URL ?? "mongodb://127.0.0.1:27018", { directConnection: true });
const db = mongo.db(process.env.MONGO_DB ?? "shrio-import-20261014");
const shots = new URL("../../.local/previews/note-locked/", import.meta.url);
mkdirSync(shots, { recursive: true });

const nid = 990012;
const password = "e2e-月亮";
const title = "e2e 加密手记（测试会自动删除）";
await mongo.connect();
const topic = await db.collection("topics").findOne({}, { sort: { _id: 1 } });
const notes = db.collection("notes");
await notes.deleteOne({ nid });
const { insertedId } = await notes.insertOne({
  nid, title, password, isPublished: true, allowComment: true, commentsIndex: 0,
  text: "第一段正文。\n\n## 云后面\n\n第二段正文。", contentFormat: "markdown", images: [], meta: null,
  mood: "平静", weather: "晴", topicId: topic?._id ?? null, count: { read: 0, like: 0 },
  created: new Date(), modified: null, publicAt: null, bookmark: false,
});
const noteId = insertedId.toHexString();
// 像 Core 一样给前台发签名的 Webhook（HMAC-SHA256 原始请求体），让缓存的列表马上换上新数据
const hook = await db.collection("webhooks").findOne({ payloadUrl: `${base}/api/webhooks/mix-space`, enabled: true });
assert.ok(hook?.secret, "本地 Core 要有指向前台的 Webhook");
const notify = async (event) => {
  const body = JSON.stringify({ id: noteId });
  const res = await fetch(`${base}/api/webhooks/mix-space`, { method: "POST", body, headers: { "content-type": "application/json", "x-webhook-event": event, "x-webhook-signature256": createHmac("sha256", hook.secret).update(body).digest("hex") } });
  assert.equal(res.status, 200, `${event} Webhook 要被接受`);
};
await notify("NOTE_CREATE");

const readLock = `(() => {
  const lock = document.querySelector(".note-lock");
  const input = document.querySelector(".note-lock-input");
  return {
    lock: Boolean(lock?.checkVisibility()),
    heading: lock?.querySelector("h1")?.textContent,
    leaked: document.body.innerText.includes(${JSON.stringify(title)}),
    error: document.querySelector(".note-lock-error")?.textContent ?? "",
    lineError: document.querySelector(".note-lock-line")?.hasAttribute("data-error") ?? false,
    focused: document.activeElement === input,
    inputEmpty: input?.value === "",
    detail: Boolean(document.querySelector(".note-detail")),
  };
})()`;
const submit = async (browser, value) => {
  await browser.evaluate(`document.querySelector(".note-lock-input").focus()`);
  await browser.send("Input.insertText", { text: value });
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
};
const shot = async (browser, name) => {
  const { result } = await browser.send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  writeFileSync(new URL(`${name}.jpg`, shots), Buffer.from(result.data, "base64"));
};
const waitFor = async (browser, expression, ms = 15000) => {
  for (let t = 0; t < ms; t += 200) { if (await browser.evaluate(expression)) return true; await sleep(200); }
  return false;
};

const browser = await openBrowser({ port: 9481 });
try {
  await browser.send("Network.enable");
  await browser.setViewport(1920, 991);

  // 列表里：标题加一把锁，没有摘要和阅读时长，链到锁页
  const href = `/notes/${nid}`;
  await browser.goto(`${base}/notes`, 4000);
  // 开发模式第一次编译改过的组件时，流式送来的列表要十几秒才换上（之前藏在隐藏的块里，innerText 仍读得到字），所以等它真的看得见
  assert.ok(await waitFor(browser, `document.querySelector('.entry a[href$="${href}"]')?.checkVisibility() === true`, 40000), "手记列表里要有这篇");
  const entry = await browser.evaluate(`(() => {
    const card = document.querySelector('.entry a[href$="${href}"]').closest(".entry");
    return {
      title: card.querySelector(".entry-title").innerText,
      lock: Boolean(card.querySelector(".entry-title .locked-mark svg")?.checkVisibility()),
      lockLabel: card.querySelector(".entry-title .locked-mark .sr-only")?.textContent,
      excerpt: [...card.querySelectorAll(".entry-excerpt")].map((p) => p.innerText),
      ai: Boolean(card.querySelector(".entry-ai")),
      minutes: Boolean(card.querySelector('[title="阅读时长"]')),
    };
  })()`);
  assert.ok(entry.title.includes(title), "列表显示标题");
  assert.ok(entry.lock, "标题前有一把锁");
  assert.equal(entry.lockLabel, "需要密码", "锁给读屏念“需要密码”");
  assert.deepEqual(entry.excerpt, ["上了锁，输入密码才能读"], "摘要的位置换成提示，没有正文开头");
  assert.equal(entry.ai || entry.minutes, false, "没有 AI 摘要和阅读时长");
  await shot(browser, "list-1920");
  // 从列表点进去是锁页（开发模式第一次编译完可能整页刷新一次，点之前再等一下）
  assert.ok(await waitFor(browser, `document.querySelector('.entry a[href$="${href}"]')?.checkVisibility() === true`, 40000), "点之前列表还在");
  await browser.evaluate(`document.querySelector('.entry a[href$="${href}"]').click()`);
  assert.ok(await waitFor(browser, `document.querySelector(".note-lock")?.checkVisibility() === true`, 40000), "点进去是锁页");
  // 锁页也有“返回来时的那一页”（back-link.tsx）：从手记列表点进来写“返回手记”
  assert.ok(await waitFor(browser, `document.querySelector(".detail-back")?.innerText.trim() === "返回手记"`, 20000), `锁页有“← 返回手记”：${await browser.evaluate(`document.querySelector(".detail-back")?.innerText ?? null`)}`);
  // 首页手记、时间线（都在 Next 缓存里，靠上面的 Webhook 更新）
  const lockedLink = (selector) => `(() => { const a = document.querySelector('${selector} a[href$="${href}"]'); return Boolean(a?.checkVisibility() && a.closest("li")?.querySelector(".locked-mark svg")?.checkVisibility()) })()`;
  await browser.goto(`${base}/`, 3000);
  assert.ok(await waitFor(browser, lockedLink(".home-timeline"), 40000), "首页手记里带锁");
  await browser.evaluate(`document.querySelector('.home-timeline a[href$="${href}"]').scrollIntoView({ block: "center" })`);
  await sleep(1200);
  await shot(browser, "home-1920");
  await browser.goto(`${base}/timeline`, 3000);
  assert.ok(await waitFor(browser, lockedLink(".timeline-list"), 40000), "时间线里带锁");
  await sleep(1500);
  await shot(browser, "timeline-1920");
  // 前后手记：比它早的那篇“较新”一侧就是它，带锁
  const older = await notes.findOne({ nid: { $ne: nid }, isPublished: true, $or: [{ password: null }, { password: "" }, { password: { $exists: false } }], created: { $lte: new Date() } }, { sort: { created: -1 } });
  await browser.goto(`${base}/notes/${older.nid}`, 5000);
  assert.ok(await waitFor(browser, `document.querySelector('.neighbor-nav a[href$="${href}"] .locked-mark svg')?.checkVisibility() === true`, 40000), "前后手记里带锁");
  await browser.evaluate(`document.querySelector(".neighbor-nav").scrollIntoView({ block: "center" })`);
  await sleep(800);
  await shot(browser, "neighbor-1920");
  // RSS、站点地图不收
  for (const path of ["/feed.xml", "/sitemap.xml"]) {
    const text = await (await fetch(`${base}${path}`)).text();
    assert.ok(!text.includes(href) && !text.includes(title), `${path} 不收带密码的手记`);
  }
  await browser.goto(`${base}/notes/${nid}`, 4000);

  const locked = await browser.evaluate(readLock);
  assert.ok(locked.lock, "锁着时要显示锁");
  assert.equal(locked.heading, "这一页藏在云后面");
  assert.equal(locked.leaked, false, "锁着时页面里不能出现手记标题");
  assert.equal(locked.detail, false);
  await shot(browser, "locked-1920-dark");

  // 输错：横线变红、有提示、清空并把焦点放回输入框，仍然锁着
  await submit(browser, "wrong-password");
  assert.ok(await waitFor(browser, `document.querySelector(".note-lock-error")?.textContent.length > 0`), "输错要有提示");
  const wrong = await browser.evaluate(readLock);
  assert.equal(wrong.error, "密码不对，再想想？");
  assert.ok(wrong.lineError, "输错时横线要标出错");
  assert.ok(wrong.focused && wrong.inputEmpty, "输错后清空并聚焦输入框");
  assert.equal(wrong.leaked, false);
  await shot(browser, "locked-1920-wrong");

  // 输对：整页换成普通手记（标题、心情天气、话题面包屑、目录、喜欢与评论、侧栏操作）
  await submit(browser, password);
  assert.ok(await waitFor(browser, `document.querySelector(".note-detail .post-detail-title")?.textContent === ${JSON.stringify(title)}`), "输对后要显示手记标题");
  await waitFor(browser, `Boolean(document.querySelector(".note-detail #comments"))`);
  const open = await browser.evaluate(`(() => ({
    lock: Boolean(document.querySelector(".note-lock")),
    meta: document.querySelector(".note-detail .detail-meta")?.innerText ?? "",
    crumb: [...document.querySelectorAll(".note-detail .detail-crumb a")].map((a) => a.textContent),
    body: document.querySelector(".note-detail .post-list-content")?.innerText.includes("第二段正文"),
    toc: [...document.querySelectorAll(".site-details .article-toc a")].map((a) => a.textContent),
    comments: Boolean(document.querySelector(".note-detail #comments")),
    like: Boolean(document.querySelector(".note-detail .article-end")),
    actions: Boolean(document.querySelector(".note-detail .article-actions")),
  }))()`);
  assert.equal(open.lock, false);
  assert.match(open.meta, /平静/);
  assert.match(open.meta, /晴/);
  if (topic) assert.deepEqual(open.crumb, ["手记", topic.name]);
  assert.ok(open.body, "正文要在");
  assert.deepEqual(open.toc, ["云后面"]);
  assert.deepEqual({ comments: open.comments, like: open.like, actions: open.actions }, { comments: true, like: true, actions: true }, "评论、喜欢、侧栏操作都要在");
  await sleep(800);
  await shot(browser, "unlocked-1920");

  // 密码存在这篇的会话 Cookie：httpOnly、关掉浏览器就没；刷新还是解锁的
  const { result } = await browser.send("Network.getCookies", { urls: [base] });
  const cookie = result.cookies.find((c) => c.name === `note-unlock-${nid}`);
  assert.ok(cookie, "要写入解锁 Cookie");
  assert.ok(cookie.httpOnly && cookie.session && cookie.path === "/", "Cookie 要 httpOnly、会话级、全站路径");
  await browser.goto(`${base}/notes/${nid}`, 4000);
  assert.equal(await browser.evaluate(`document.querySelector(".note-detail .post-detail-title")?.textContent`), title, "刷新后仍是解锁的");

  // 截图：浅色主题与手机上的锁
  await browser.send("Network.deleteCookies", { name: `note-unlock-${nid}`, url: base });
  await browser.evaluate(`localStorage.setItem("theme", "light")`);
  await browser.goto(`${base}/notes/${nid}`, 4000);
  assert.ok((await browser.evaluate(readLock)).lock, "删掉 Cookie 后又锁上");
  await shot(browser, "locked-1920-light");
  await browser.evaluate(`localStorage.removeItem("theme")`);
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/notes/${nid}`, 4000);
  const phone = await browser.evaluate(`(() => { const r = document.querySelector(".note-lock-form").getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; })()`);
  assert.ok(phone.left >= 16 && phone.right <= phone.width - 16, "手机上表单不贴边");
  await shot(browser, "locked-390");
  assert.deepEqual(browser.errors.filter((e) => !/Transition was skipped/.test(e)), [], "页面不能报错");
  console.log("note-locked: 通过");
} finally {
  await browser.close();
  await notes.deleteOne({ _id: insertedId });
  await notify("NOTE_DELETE").catch((error) => console.error("NOTE_DELETE 没发出去，缓存里可能还留着测试手记：", error.message));
  await mongo.close();
}
