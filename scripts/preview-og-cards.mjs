// 先用 OG_PREVIEW_DIR=<目录> node scripts/e2e/og-image.mjs 取得实际爬虫元数据和 PNG。
// 再运行 node scripts/preview-og-cards.mjs <目录>。只在本机模拟卡片，不向平台提交 URL。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBrowser } from "./headless-browser.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("请指定 og-image.mjs 的预览输出目录");
const cards = JSON.parse(readFileSync(join(dir, "cards.json"), "utf8"));
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
const css = `
  *{box-sizing:border-box}body{margin:0;background:#16171a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{display:grid;grid-template-columns:1fr 1fr;gap:2px;width:1042px}section{width:520px;padding:22px 20px 17px}
  header{font-size:13px;font-weight:600;letter-spacing:.05em;display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}
  header small{font-size:11px;font-weight:400;letter-spacing:0;opacity:.65}.x{background:#000;color:#e7e9ea}.discord{background:#313338;color:#f2f3f5}
  .x-image{overflow:hidden;border:1px solid #333639;border-radius:16px;position:relative;aspect-ratio:2}
  img{display:block;width:100%}.x-image img{height:100%;object-fit:cover}.x-title{position:absolute;bottom:8px;left:8px;max-width:calc(100% - 16px);font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#080808ce;color:#fff;padding:3px 7px;border-radius:5px}
  .domain{color:#9299a0;font-size:13px;margin-top:6px}.embed{border-left:4px solid #575963;border-radius:4px;background:#2b2d31;padding:11px 14px 14px;max-width:452px}
  .provider{font-size:12px;color:#dbdee1}.title{font-size:16px;line-height:1.3;font-weight:600;color:#49adf6;margin:5px 0}.desc{color:#dbdee1;font-size:14px;line-height:1.4;margin:0 0 11px}.embed img{border-radius:4px}
`;
const b = await openBrowser({ port: 9442 });
try {
  await b.send("Emulation.setDeviceMetricsOverride", {
    width: 1042,
    height: 800,
    deviceScaleFactor: 1.5,
    mobile: false,
  });
  const frameId = (await b.send("Page.getFrameTree")).result.frameTree.frame.id;
  for (const card of cards.filter(({ name }) => ["home", "post", "note"].includes(name))) {
    const src = "data:image/png;base64," + readFileSync(join(dir, card.name + ".png")).toString("base64");
    const sample = `<small>${{ home: "首页", post: "文章", note: "手记" }[card.name]} · 本地样式预览</small>`;
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${css}</style><main>
      <section class="x"><header>X${sample}</header><div class="x-image"><img src="${src}"><div class="x-title">${esc(card.title)}</div></div><div class="domain">来自 ${esc(new URL(card.url).host)}</div></section>
      <section class="discord"><header>Discord${sample}</header><div class="embed"><div class="provider">${esc(card.site)}</div><div class="title">${esc(card.title)}</div><p class="desc">${esc(card.description)}</p><img src="${src}"></div></section>
      </main></html>`;
    await b.send("Page.setDocumentContent", { frameId, html });
    await b.evaluate("Promise.all([...document.images].map(i => i.decode()))");
    for (const [name, selector] of [
      ["compare", "main"],
      ["x", ".x"],
      ["discord", ".discord"],
    ]) {
      const rect = await b.evaluate(
        `document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`,
      );
      const shot = await b.send("Page.captureScreenshot", {
        format: "png",
        clip: { x: rect.x, y: rect.y, width: rect.width, height: Math.ceil(rect.height), scale: 1 },
      });
      writeFileSync(join(dir, `${card.name}-${name}.png`), Buffer.from(shot.result.data, "base64"));
    }
  }
} finally {
  await b.close();
}
