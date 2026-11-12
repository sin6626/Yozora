// 友链申请区“交换名片”（2026-11-12 打磨：原来是一个灰底大框里的六格默认输入框，本站信息只是三行字、不能复制）。
// 现在左边是本站的名片和四行可复制的信息（站点名称、站点地址、头像地址、一句话介绍），右边是对方的名片：
// 站名、介绍边打边预览，头像地址离开输入框时才换，加载不出来就提示；宽屏两列、两张名片之间一条星座线，手机上下排。
// 检查：① 两列并排、名片同高、星座线在两张名片之间；手机上下排、没有星座线；② 复制按钮复制的是那一行显示的值，读屏名字“复制站点地址”等；
// ③ 预览：没填时是占位字，填了跟着变；④ 坏的头像地址给提示、预览退回字母，换成能打开的地址后显示图片、提示消失；
// ⑤ 没填必填项点“寄出名片”不发请求；⑥ 填好后发出的内容（Core POST /links/audit 在浏览器里拦下换成假响应，不写库），
//    成功后表单和预览清空、显示成功；Core 拒绝时显示它的原话；⑦ 没有别的写请求、没有页面报错。
// 需要先运行 pnpm dev（前台 2323、Core 2333，后台开着友链申请）。用法：node scripts/e2e/link-apply.mjs
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = "http://127.0.0.1:2333";
const b = await openBrowser({ port: 9495 });
const sent = [];
const leaked = [];
let reply = { status: 200, body: { ok: 1 } };

const waitFor = async (expression, ms = 8000) => {
  for (let t = 0; t < ms; t += 150) { if (await b.evaluate(expression).catch(() => false)) return true; await sleep(150); }
  return false;
};
const type = async (name, text) => {
  await b.evaluate(`(() => { const el = document.querySelector('.link-apply-form input[name=${name}]'); el.focus(); el.select() })()`);
  await b.send("Input.insertText", { text });
};
const blur = () => b.evaluate(`document.activeElement.blur()`);
const box = (selector) => b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height } })()`);
const preview = () => b.evaluate(`(() => {
  const root = document.querySelector('.link-apply-preview');
  const img = root.querySelector('img');
  return { name: root.querySelector('h3').textContent, intro: root.querySelector('p')?.textContent, emptyName: root.hasAttribute('data-empty-name'), emptyIntro: root.hasAttribute('data-empty-intro'), img: img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 } : null, letter: root.querySelector('.is-letter')?.textContent ?? null }
})()`);
const submit = () => b.evaluate(`document.querySelector('.link-apply-form button[type=submit]').click()`);

try {
  await b.send("Fetch.enable", { patterns: [{ urlPattern: `${core}/*` }] });
  b.listeners.push((m) => {
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    if (request.method === "POST" && new URL(request.url).pathname === "/links/audit") {
      sent.push(JSON.parse(request.postData));
      return b.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: reply.status,
        responseHeaders: [
          { name: "Access-Control-Allow-Origin", value: new URL(web).origin },
          { name: "Access-Control-Allow-Credentials", value: "true" },
          { name: "Content-Type", value: "application/json" },
        ],
        body: Buffer.from(JSON.stringify(reply.body)).toString("base64"),
      });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) leaked.push(`${request.method} ${request.url}`);
    b.send("Fetch.continueRequest", { requestId });
  });

  // ① 宽屏：两列并排，两张名片同一高度，星座线在两张名片之间
  await b.setViewport(1920, 991);
  await b.goto(`${web}/friends`, 4000);
  assert.ok(await waitFor(`!!document.querySelector('.link-apply-form')`), "后台开着友链申请，右边有表单（没开就先在后台打开）");
  const mine = await box(".link-apply-mine .friend-card");
  const yours = await box(".link-apply-preview .friend-card");
  assert.ok(yours.left > mine.right, "宽屏两张名片左右并排");
  assert.ok(Math.abs(mine.top - yours.top) < 1 && Math.abs(mine.height - yours.height) < 2, `两张名片同一高度（${mine.top}/${yours.top}，${mine.height}/${yours.height}）`);
  const bridge = await b.evaluate(`(() => {
    const card = document.querySelector('.link-apply-mine .friend-card');
    const style = getComputedStyle(card, '::after');
    const r = card.getBoundingClientRect();
    return { content: style.content, left: r.right + parseFloat(style.left) - r.width, width: parseFloat(style.width) }
  })()`);
  assert.notEqual(bridge.content, "none", "两张名片之间有星座线");
  assert.ok(bridge.left > mine.right && bridge.left + bridge.width < yours.left, `星座线在两张名片之间（${bridge.left}–${bridge.left + bridge.width}，名片 ${mine.right}/${yours.left}）`);

  // ② 本站信息四行，每行的复制按钮复制的就是这一行显示的值
  const rows = await b.evaluate(`[...document.querySelectorAll('.link-apply-info > div')].map((row) => ({ label: row.querySelector('dt').textContent, value: row.querySelector('dd > span').getAttribute('title'), button: row.querySelector('button').getAttribute('aria-label') }))`);
  assert.deepEqual(rows.map((row) => row.label), ["站点名称", "站点地址", "头像地址", "一句话介绍"]);
  assert.deepEqual(rows.map((row) => row.button), rows.map((row) => `复制${row.label}`), "复制按钮的读屏名字带上是哪一行");
  assert.match(rows[1].value, /^https?:\/\//);
  assert.match(rows[2].value, /^https?:\/\//);
  await b.evaluate(`navigator.clipboard.writeText = (text) => { window.__copied = text; return Promise.resolve() }`);
  for (const [index, row] of rows.entries()) {
    await b.evaluate(`document.querySelectorAll('.link-apply-info button')[${index}].click()`);
    await sleep(100);
    assert.equal(await b.evaluate(`window.__copied`), row.value, `复制${row.label}`);
  }
  assert.equal(await b.evaluate(`document.querySelectorAll('.link-apply-info button')[3].getAttribute('aria-label')`), "已复制", "复制后读屏念“已复制”");

  // ③ 预览：没填是占位字，填了跟着变
  assert.deepEqual(await preview(), { name: "你的站点", intro: "一句话介绍会写在这里", emptyName: true, emptyIntro: true, img: null, letter: "✦" });
  await type("name", "星屑小站");
  await type("description", "收集夜里的碎光");
  let card = await preview();
  assert.equal(card.name, "星屑小站");
  assert.equal(card.intro, "收集夜里的碎光");
  assert.equal(card.emptyName || card.emptyIntro, false, "填了以后不再是淡淡的占位字");
  assert.equal(card.letter, "星", "没头像时圆里是站名第一个字");

  // ④ 头像：边打不换（不去请求半截地址），离开输入框才换；加载不出来就提示，换成能打开的地址后显示图片
  await type("avatar", "https://127.0.0.1:1/missing.png");
  assert.equal((await preview()).img, null, "还在打字时不换头像");
  await blur();
  assert.ok(await waitFor(`!!document.querySelector('.link-apply-hint.is-warn')`), "坏的头像地址给提示");
  card = await preview();
  assert.equal(card.img, null, "加载不出来的头像退回字母");
  assert.equal(card.letter, "星");
  await type("avatar", rows[2].value);
  await blur();
  assert.ok(await waitFor(`(() => { const img = document.querySelector('.link-apply-preview img'); return !!img && img.complete && img.naturalWidth > 0 })()`), "能打开的头像显示在预览里");
  assert.equal(await b.evaluate(`document.querySelector('.link-apply-hint.is-warn')`), null, "换好以后提示消失");

  // ⑤ 必填项没填：浏览器拦下，不发请求
  await submit();
  await sleep(400);
  assert.equal(sent.length, 0, "缺站点地址和名字时不发请求");

  // ⑥ Core 拒绝：显示它的原话（中文页面），表单不清空
  await type("author", "小星");
  await type("url", "https://stardust.example");
  await type("email", "me@stardust.example");
  reply = { status: 422, body: { message: ["网址无法访问"] } };
  await submit();
  assert.ok(await waitFor(`document.querySelector('.link-apply-status.is-error')?.textContent === '网址无法访问'`), "显示 Core 的原话");
  assert.equal((await preview()).name, "星屑小站", "失败时不清空");

  // 成功：发出的内容正确，表单和预览清空，显示成功
  reply = { status: 200, body: { ok: 1 } };
  await submit();
  assert.ok(await waitFor(`!!document.querySelector('.link-apply-status.is-done')`), "显示成功");
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.at(-1), { author: "小星", name: "星屑小站", url: "https://stardust.example", avatar: rows[2].value, description: "收集夜里的碎光", email: "me@stardust.example" });
  card = await preview();
  assert.equal(card.emptyName && card.emptyIntro, true, "成功后预览回到占位字");
  assert.equal(card.img, null, "成功后预览没有头像");
  assert.equal(await b.evaluate(`[...document.querySelectorAll('.link-apply-form input')].every((input) => input.value === '')`), true, "成功后表单清空");

  // ① 手机：上下排，没有星座线
  await b.setViewport(390, 844);
  await sleep(300);
  const phoneMine = await box(".link-apply-info");
  const phoneYours = await box(".link-apply-preview .friend-card");
  assert.ok(phoneYours.top > phoneMine.bottom, "手机上你的名片排在本站信息下面");
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.link-apply-mine .friend-card'), '::after').content`), "none", "手机上没有星座线");

  assert.deepEqual(leaked, [], "除了拦下的申请，没有别的写请求");
  assert.deepEqual(b.errors, [], "页面没有报错");
  console.log("link-apply: 通过");
} finally {
  await b.close();
}
