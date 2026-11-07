// 浏览器回归测试：手记详情的头图与横幅（2026-11-07，参考 Shiro 的 NoteHeadCover / NoteBanner）。
// 头图与横幅本地库没有数据，用 /debug 的示例检查（真实组件）。截图存 .local/previews/note-extras/。
// 需要先运行 pnpm dev。用法：node scripts/e2e/note-extras.mjs
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const shots = new URL("../../.local/previews/note-extras/", import.meta.url);
mkdirSync(shots, { recursive: true });

const shot = async (browser, name) => {
  const { data } = (await browser.send("Page.captureScreenshot", { format: "jpeg", quality: 82 })).result;
  writeFileSync(new URL(name, shots), Buffer.from(data, "base64"));
};

const browser = await openBrowser({ port: 9455 });
try {
  // 头图与横幅：/debug 示例（真实组件）
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/debug`, 5000);
  const demo = await browser.evaluate(`(() => {
    const box = document.querySelector("#debug-note-extras");
    box.scrollIntoView();
    const img = box.querySelector(".note-cover img");
    const banners = [...box.querySelectorAll(".note-banner")];
    return {
      cover: img && img.complete && img.naturalWidth > 0,
      coverBeforeTitle: !!img && !!(img.compareDocumentPosition(box.querySelector("h1")) & Node.DOCUMENT_POSITION_FOLLOWING),
      mask: img && getComputedStyle(img.parentElement).maskImage,
      types: banners.map((el) => el.dataset.type),
      roles: banners.map((el) => el.getAttribute("role")),
      borders: new Set(banners.map((el) => getComputedStyle(el).borderColor)).size,
      icons: banners.every((el) => el.querySelector("svg")),
      multiline: banners.at(-1).getBoundingClientRect().height > banners[0].getBoundingClientRect().height,
    };
  })()`);
  await sleep(500);
  await shot(browser, "cover-banner-debug.jpg");
  assert.ok(demo.cover, "调试页头图没加载");
  assert.ok(demo.coverBeforeTitle, "头图应在标题上方");
  assert.match(demo.mask, /gradient/, "头图底部没有渐隐");
  assert.deepEqual(demo.types, ["info", "warning", "error", "success", "secondary"]);
  assert.ok(demo.roles.every((role) => role === "note"));
  assert.equal(demo.borders, 5, "五种横幅颜色应各不相同");
  assert.ok(demo.icons && demo.multiline, "横幅缺图标或没有保留换行");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("note-extras: 通过");
} finally {
  await browser.close();
}
