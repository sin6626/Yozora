// 浏览器回归测试：出错兜底页（2026-11-07，docs/shiro-gaps.md 第 4 项）。
// 开发环境的 /debug/crash 渲染时必然抛错：应显示站内错误页（app/[locale]/error.tsx，保留页头导航和页脚），
// 有“重试”（再渲染一次，仍出错就仍是这页）和回首页，不是 Next 默认错误页；外文页面也一样；手机上按钮不出屏。
// 需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const read = `(() => {
  const page = [...document.querySelectorAll(".error-page")].find((node) => node.checkVisibility());
  const buttons = page ? [...page.querySelectorAll("button, a")].filter((node) => node.checkVisibility()) : [];
  const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; };
  return {
    page: !!page,
    heading: page?.querySelector("h1")?.textContent ?? null,
    retry: buttons.find((node) => node.tagName === "BUTTON")?.textContent ?? null,
    home: buttons.find((node) => node.tagName === "A")?.getAttribute("href") ?? null,
    boxes: buttons.map(box),
    header: !!document.querySelector(".site-header"),
    footer: !!document.querySelector(".site-footer"),
    nextDefault: /Application error|This page couldn.t load|Internal Server Error/.test(document.body.innerText),
    width: innerWidth,
  };
})()`;

const browser = await openBrowser({ port: 9441 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/debug/crash`, 6000);
  const zh = await browser.evaluate(read);
  assert.ok(zh.page, "没有显示站内错误页");
  assert.ok(!zh.nextDefault, "落到了 Next 默认错误页");
  assert.ok(zh.header && zh.footer, "站内错误页应保留页头导航和页脚");
  assert.ok(zh.heading, "错误页没有标题");
  assert.ok(zh.retry, "错误页没有“重试”按钮");
  assert.equal(zh.home, "/", "错误页没有回首页链接");

  // 重试：再渲染一次（这个调试页必然再出错），仍是站内错误页，页面不崩
  await browser.evaluate(`[...document.querySelectorAll(".error-page button")].find((node) => node.checkVisibility()).click()`);
  await sleep(3000);
  const again = await browser.evaluate(read);
  assert.ok(again.page && again.header && !again.nextDefault, "重试后应仍是站内错误页");

  // 重试真的会重新向服务端渲染：?once= 只失败第一次，点了重试要换成正常内容（按钮是空操作时这里会失败，Codex 复查指出原来的检查会空过）
  await browser.goto(`${base}/debug/crash?once=${Date.now()}`, 6000);
  assert.ok((await browser.evaluate(read)).page, "第一次渲染应出错");
  await browser.evaluate(`[...document.querySelectorAll(".error-page button")].find((node) => node.checkVisibility()).click()`);
  let recovered = false;
  for (let i = 0; i < 60 && !recovered; i++) {
    await sleep(100);
    recovered = await browser.evaluate(`!!document.querySelector(".debug-crash-ok") && ![...document.querySelectorAll(".error-page")].some((node) => node.checkVisibility())`);
  }
  assert.ok(recovered, "点了重试应重新渲染并显示正常内容");

  // 回首页（站内跳转）
  await browser.goto(`${base}/debug/crash`, 6000);
  await browser.evaluate(`[...document.querySelectorAll(".error-page a")].find((node) => node.checkVisibility()).click()`);
  await sleep(3000);
  assert.equal(await browser.evaluate("location.pathname"), "/", "回首页没有跳到首页");
  assert.ok(await browser.evaluate("!!document.querySelector('.home-hero')"), "回首页后首屏没有出来");

  await browser.goto(`${base}/en/debug/crash`, 6000);
  const en = await browser.evaluate(read);
  assert.ok(en.page && en.header && !en.nextDefault, "英文页面没有站内错误页");
  assert.equal(en.home, "/en", "英文错误页回首页应带语言前缀");

  await browser.setViewport(390, 844);
  await browser.goto(`${base}/debug/crash`, 5000);
  const phone = await browser.evaluate(read);
  assert.ok(phone.page, "手机上没有站内错误页");
  assert.ok(phone.boxes.every((box) => box.left >= 0 && box.right <= phone.width), "手机上按钮超出屏幕");
  console.log("error-page: 通过");
} finally {
  await browser.close();
}
