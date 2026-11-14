// 浏览器回归测试：全站读取中的小火箭（components/page-loading.tsx）。
// 各页面正文包在 Suspense 里，服务端先发出带读取占位的外壳，正文随后流式送到、由 React 的内联脚本换上。
// 测试关掉页面脚本，让读取占位一直留在屏幕上，检查：铺满页头以下一屏、80px 火箭在动、
// Innei 那句话带「」、读屏念“正在读取…”、一出现就开始淡入（不等待）、“重试”十秒后才出现。
// 首页第一屏下面那块（最新文章、手记、碎碎念、最近发生的事）和首屏一起到（2026-11-14 站长：首屏好了下面也该好了，不然一往下滑还在读）：
// 数据来自 Next 缓存 getHomeFeed、不包 Suspense，关掉脚本也已经在页面里，没有小火箭、没有等待占位。
// 生产构建的预渲染另有 scripts/e2e/home-first-html.mjs（对 next start 或 beta 测）。
// 打开脚本时读完就换成正文；/debug 检查深浅主题火苗颜色、减少动态效果时火箭不动。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";

const browser = await openBrowser({ port: 9356 });
try {
  await browser.setViewport(1920, 991);
  await browser.send("Emulation.setScriptExecutionDisabled", { value: true });
  const measure = `(() => {
    const el = [...document.querySelectorAll(".page-loading")].find((e) => e.checkVisibility());
    if (!el) return null;
    const header = document.querySelector(".site-header").getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const rocket = el.querySelector(".page-loading-rocket");
    const retry = el.querySelector(".page-loading-retry");
    const running = (sel) => [...el.querySelectorAll(sel)].every((n) => n.getAnimations().some((a) => a.playState === "running"));
    const result = {
      role: el.getAttribute("role"),
      sr: el.querySelector(".sr-only")?.textContent,
      quote: el.querySelector(".page-loading-quote")?.textContent,
      quoteHidden: el.querySelector(".page-loading-quote")?.getAttribute("aria-hidden"),
      rocketWidth: rocket.getBoundingClientRect().width,
      top: box.top + scrollY,
      height: box.height,
      screen: innerHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) * 16,
      belowHeader: box.top >= header.bottom - 1,
      fade: (({ delay, duration } = {}) => ({ delay, duration }))(el.getAnimations().find((a) => a.animationName === "page-loading-in")?.effect.getTiming()),
      moving: running(".craft") && running(".flame") && running(".trail line"),
      retryBefore: getComputedStyle(retry).visibility,
      retryHref: retry.getAttribute("href"),
    };
    for (const a of retry.getAnimations()) a.currentTime = 10_500; // 跳到第十秒之后
    result.retryAfter = getComputedStyle(retry).visibility;
    return result;
  })()`;

  for (const path of ["/posts", "/about", "/en/notes"]) {
    await browser.goto(base + path);
    const loading = await browser.evaluate(measure);
    assert.ok(loading, `${path} 没有显示读取中的小火箭`);
    assert.equal(loading.role, "status");
    assert.equal(loading.sr, path.startsWith("/en") ? "Loading…" : "正在读取…", `${path} 读屏文字不对：${loading.sr}`);
    assert.equal(loading.quote, "「当第一颗卫星飞向大气层外，我们便以为自己终有一日会征服宇宙。」");
    assert.equal(loading.quoteHidden, "true", "那句话只是装饰，读屏不念");
    assert.equal(Math.round(loading.rocketWidth), 80, `火箭应当 80px 宽，实际 ${loading.rocketWidth}`);
    assert.ok(loading.belowHeader, `${path} 读取区应当在页头下面`);
    assert.ok(loading.height >= loading.screen - 1, `${path} 读取区应当铺满页头以下一屏：${loading.height} < ${loading.screen}`);
    assert.equal(loading.fade.delay, 0, "读取区一出现就开始淡入，不再等 200ms");
    assert.ok(loading.fade.duration <= 250, `淡入要快，读得快时也看得见：${loading.fade.duration}ms`);
    assert.ok(loading.moving, "火箭、火苗、尾迹都应当在动");
    assert.equal(loading.retryBefore, "hidden", "“重试”一开始不该出现");
    assert.equal(loading.retryAfter, "visible", "十秒后“重试”应当出现");
    assert.equal(loading.retryHref, "", "“重试”整页重新打开当前地址");
  }

  // 首页：先开着脚本打开一次（让缓存热起来），再关掉脚本打开，看服务端发出的页面里是不是已经有内容
  // （流式补上的部分要靠脚本换上，关掉脚本就只剩占位）
  await browser.send("Emulation.setScriptExecutionDisabled", { value: false });
  await browser.goto(base + "/");
  await browser.send("Emulation.setScriptExecutionDisabled", { value: true });
  await browser.goto(base + "/");
  const home = await browser.evaluate(`(() => {
    const room = document.querySelector(".home-room");
    return {
      rockets: room.querySelectorAll(".page-loading").length,
      pending: room.querySelectorAll(".home-room-pending").length,
      posts: room.querySelectorAll(".home-main .home-timeline-item").length,
      murmurs: room.querySelectorAll(".home-murmurs > li").length,
      activity: room.querySelectorAll(".activity-item").length + room.querySelectorAll(".home-side-activity .post-empty:not([role=status])").length,
    };
  })()`);
  assert.equal(home.rockets, 0, "首页第一屏下面不该有小火箭");
  assert.equal(home.pending, 0, `首页第一屏下面应当和首屏一起到，不该是等待占位：${JSON.stringify(home)}`);
  assert.ok(home.posts > 0 && home.murmurs > 0 && home.activity > 0, `首页一打开就应当已有文章、手记、碎碎念和最近发生的事：${JSON.stringify(home)}`);

  // 手机：那句话只在逗号处换行，不把“终有一日”拆开
  await browser.setViewport(390, 844);
  await browser.goto(base + "/notes");
  const lines = await browser.evaluate(`(() => {
    const text = [...document.querySelectorAll(".page-loading-quote")].find((e) => e.checkVisibility()).firstChild;
    const range = document.createRange();
    const rows = [];
    for (let i = 0; i < text.length; i++) {
      range.setStart(text, i); range.setEnd(text, i + 1);
      const top = Math.round(range.getBoundingClientRect().top);
      if (!rows.length || Math.abs(rows.at(-1).top - top) > 4) rows.push({ top, text: "" });
      rows.at(-1).text += text.data[i];
    }
    return rows.map((r) => r.text);
  })()`);
  assert.deepEqual(lines, ["「当第一颗卫星飞向大气层外，", "我们便以为自己终有一日会征服宇宙。」"], `手机上那句话换行不对：${lines.join(" / ")}`);
  await browser.setViewport(1920, 991);

  // 正常打开：读完就换成正文
  await browser.send("Emulation.setScriptExecutionDisabled", { value: false });
  await browser.goto(base + "/posts");
  const replaced = await browser.evaluate(`(async () => {
    for (let i = 0; i < 200; i++) {
      const visible = [...document.querySelectorAll(".page-loading")].some((e) => e.checkVisibility());
      if (!visible && document.querySelector("main h1")?.checkVisibility()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  })()`);
  assert.ok(replaced, "读完后读取占位应当换成正文");

  // 调试页：深浅主题的火苗颜色
  await browser.goto(base + "/debug");
  const sample = `(() => {
    const el = document.querySelector("#debug-page-loading .page-loading");
    const css = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolve = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
    const out = {
      flame: getComputedStyle(el.querySelector(".flame")).fill,
      moonlight: resolve(css.getPropertyValue("--moonlight")),
      primary: resolve(css.getPropertyValue("--primary")),
    };
    probe.remove();
    return out;
  })()`;
  const dark = await browser.evaluate(sample);
  assert.equal(dark.flame, dark.moonlight, "深色主题火苗是月光色");
  await browser.evaluate(`document.documentElement.dataset.theme = "light"`);
  const light = await browser.evaluate(sample);
  assert.equal(light.flame, light.primary, "浅色主题火苗是强调色");

  // 减少动态效果：火箭和火苗不动，尾迹静止显示
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(base + "/debug");
  const reduced = await browser.evaluate(`(() => {
    const el = document.querySelector("#debug-page-loading .page-loading");
    return {
      still: [".craft", ".flame", ".trail line"].every((s) => [...el.querySelectorAll(s)].every((n) => n.getAnimations().length === 0)),
      trail: getComputedStyle(el.querySelector(".trail line")).opacity,
    };
  })()`);
  assert.ok(reduced.still, "减少动态效果时火箭不该动");
  assert.equal(reduced.trail, "0.45");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("PASS 读取中显示铺满页头以下一屏的小火箭（80px、「」那句话、读屏“正在读取…”、一出现就淡入、十秒后露出重试），首页第一屏下面那块和首屏一起到、没有读取占位，手机上只在逗号处换行，读完换成正文；深浅火苗、减少动态效果正常");
} finally {
  browser.close();
}
