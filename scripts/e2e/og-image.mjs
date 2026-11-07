// 浏览器回归测试：分享图（2026-11-07，docs/shiro-gaps.md 第 2 项）。
// 首页、一篇文章、一篇手记（和英文文章页）的 <head> 里有 og:image 与 twitter:card=summary_large_image，
// og:image 地址请求返回 200、image/png、PNG 头里的尺寸是 1200×630；外文页面的分享图地址带语言。
// 设 OG_PREVIEW_DIR 时把几张图存下来给站长看。需要先运行 pnpm dev。用法：pnpm e2e
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBrowser } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = process.env.CORE_URL ?? "http://127.0.0.1:2333";
const post = (await (await fetch(`${core}/posts?size=1`)).json()).data[0];
const note = (await (await fetch(`${core}/notes?size=1`)).json()).data[0];
const postPath = `/posts/${encodeURIComponent(post.category.slug)}/${encodeURIComponent(post.slug)}`;
const pages = [["home", "/"], ["post", postPath], ["note", `/notes/${note.nid}`], ["post-en", `/en${postPath}`]];

const read = `(() => {
  const meta = (key) => document.head.querySelector(\`meta[property="\${key}"], meta[name="\${key}"]\`)?.content ?? null;
  return { image: meta("og:image"), width: meta("og:image:width"), card: meta("twitter:card"), twitterImage: meta("twitter:image"), title: meta("og:title") };
})()`;

const browser = await openBrowser({ port: 9442 });
try {
  await browser.setViewport(1920, 991);
  for (const [name, path] of pages) {
    await browser.goto(`${base}${path}`, 5000);
    const meta = await browser.evaluate(read);
    assert.ok(meta.image, `${path} 的 <head> 里没有 og:image`);
    assert.equal(meta.card, "summary_large_image", `${path} 的 twitter:card 不对：${meta.card}`);
    assert.equal(meta.twitterImage, meta.image, `${path} 的 twitter:image 应与 og:image 相同`);
    assert.equal(meta.width, "1200");
    if (name === "post-en") assert.match(meta.image, /[?&]lang=en\b/, "英文页面的分享图要带 lang=en");
    else assert.doesNotMatch(meta.image, /[?&]lang=/, "中文页面的分享图不带 lang");

    // 绝对地址的主机是后台“网站地址”，本地就是开发服务；换成 base 去请求
    const url = new URL(meta.image);
    const res = await fetch(`${base}${url.pathname}${url.search}`);
    assert.equal(res.status, 200, `${meta.image} 返回 ${res.status}`);
    assert.equal(res.headers.get("content-type"), "image/png");
    const png = Buffer.from(await res.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), "PNG", "不是 PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], `${path} 的分享图尺寸不对`);
    if (process.env.OG_PREVIEW_DIR) {
      mkdirSync(process.env.OG_PREVIEW_DIR, { recursive: true });
      writeFileSync(join(process.env.OG_PREVIEW_DIR, `${name}.png`), png);
    }
  }

  // 参数不对时不报 500
  for (const query of ["?type=post&category=nope&slug=nope", "?type=note&nid=abc", "?type=nope"]) {
    assert.equal((await fetch(`${base}/api/og${query}`)).status, 404, `/api/og${query} 应为 404`);
  }
  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("og-image: 通过");
} finally {
  await browser.close();
}
