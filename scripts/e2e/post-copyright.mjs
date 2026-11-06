// 浏览器回归测试：文章末尾的版权说明（2026-11-06，照 Shiro 的 PostCopyright）。
// 开了“版权注明”的文章：文章标题、作者（个人资料昵称）、完整链接 + 复制、最后修改时间，分隔线下是配置片段 theme/yozora 的 copyright，
// 其中 [文字](地址) 是链接（许可协议要能点）。片段里 copyright 写成空就整块不显示。
// 前提：本地片段填了 copyright（含 creativecommons 链接）。需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const posts = (await (await fetch(`${core}/posts?size=20`)).json()).data;
const post = posts.find((item) => item.copyright !== false);
assert.ok(post, "本地没有开着“版权注明”的文章");
const path = `/posts/${encodeURIComponent(post.category.slug)}/${encodeURIComponent(post.slug)}`;
const owner = (await (await fetch(`${core}/aggregate`)).json()).user.name;

const browser = await openBrowser({ port: 9353 });
try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}${path}`, 6000);
  const block = await browser.evaluate(`(() => {
    const el = [...document.querySelectorAll("#copyright")].find((node) => node.checkVisibility());
    if (!el) return null;
    const license = [...el.querySelectorAll("a")].find((a) => a.href.includes("creativecommons.org"));
    return { text: el.innerText, copy: !!el.querySelector("button"), license: license && { href: license.href, label: license.textContent, target: license.target } };
  })()`);
  assert.ok(block, "文章末尾没有版权说明");
  assert.ok(block.text.includes(post.title), "版权说明里没有文章标题");
  assert.ok(block.text.includes(owner), "版权说明里没有作者名字");
  assert.ok(block.text.includes(path) || block.text.includes(decodeURIComponent(path)), "版权说明里没有文章链接");
  assert.ok(block.copy, "文章链接旁边没有“复制”");
  assert.ok(block.license, "许可协议不是链接");
  assert.ok(block.license.label.includes("CC BY-NC-SA 4.0"), `许可链接文字不对：${block.license.label}`);
  assert.equal(block.license.target, "_blank", "许可链接在新标签页打开");
  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("post-copyright: 通过");
} finally {
  await browser.close();
}
