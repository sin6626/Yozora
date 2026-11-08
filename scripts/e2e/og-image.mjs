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

// 爬虫不执行页面脚本。只解析它们各自收到的 HTML head，不测试水合后的 DOM。
const browser = await openBrowser({ port: 9442 });
const manifest = [];
try {
  for (const [name, path] of pages) {
    for (const bot of ["Twitterbot/1.0", "Discordbot/2.0"]) {
      const res = await fetch(base + path, { headers: { "User-Agent": bot } });
      assert.equal(res.status, 200);
      const head = (await res.text()).split("</head>", 1)[0];
      const tags = await browser.evaluate(`Object.fromEntries([...new DOMParser().parseFromString(${JSON.stringify(head)}, "text/html").head.querySelectorAll("meta")].map(m => [m.getAttribute("property") ?? m.name, m.content]))`);
      const url = new URL(tags["og:image"]);
      assert.equal(new URL(tags["og:url"]).href, new URL(path, url.origin).href, `${bot}: ${path} 的永久地址错误`);
      assert.equal(url.searchParams.get("type"), name === "home" ? null : name === "note" ? "note" : "post");
      assert.equal(tags["og:type"], name === "home" ? "website" : "article");
      for (const key of ["og:title", "og:site_name", "og:description", "og:image:alt"]) assert.ok(tags[key]?.trim(), `${bot}: ${path} 缺 ${key}`);
      assert.equal(tags["twitter:card"], "summary_large_image");
      for (const field of ["title", "description", "image", "image:alt"]) assert.equal(tags["twitter:" + field], tags["og:" + field]);
      assert.equal(tags["og:image:type"], "image/png");
      assert.equal(tags["og:image:width"], "1200");
      assert.equal(tags["og:image:height"], "630");
      assert.equal(url.searchParams.get("lang"), name === "post-en" ? "en" : null);
      if (bot.startsWith("Discord")) continue;
      const image = await fetch(base + url.pathname + url.search);
      assert.equal(image.status, 200);
      assert.equal(image.headers.get("content-type"), "image/png");
      const png = Buffer.from(await image.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
      assert.ok(png.length < 5_000_000);
      if (process.env.OG_PREVIEW_DIR) {
        mkdirSync(process.env.OG_PREVIEW_DIR, { recursive: true });
        writeFileSync(join(process.env.OG_PREVIEW_DIR, name + ".png"), png);
        manifest.push({ name, title: tags["og:title"], description: tags["og:description"], site: tags["og:site_name"], url: tags["og:url"] });
      }
    }
  }
  if (process.env.OG_PREVIEW_DIR) writeFileSync(join(process.env.OG_PREVIEW_DIR, "cards.json"), JSON.stringify(manifest, null, 2));

  // 参数不对时不报 500
  for (const query of ["?type=post&category=nope&slug=nope", "?type=note&nid=abc", "?type=nope"]) {
    assert.equal((await fetch(`${base}/api/og${query}`)).status, 404, `/api/og${query} 应为 404`);
  }
  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("og-image: 通过");
} finally {
  await browser.close();
}
