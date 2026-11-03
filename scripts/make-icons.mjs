// 用站长的头像画（.local/writing/images/icon-source.webp，2026-11-03 站长给的蜡笔画，不进 git）生成站点图标：
//   node scripts/make-icons.mjs [源图] [--preview]
// 写进 apps/web/app/：favicon.ico（16/32/48，PNG 编码）、icon.png（256，圆角方块、四角透明）、apple-icon.png（180，不透明方图，iOS 自己切圆角）。
// 不裁切：16 像素下靠白发、粉脸、紫斗篷三块颜色的整体轮廓认人，裁紧只剩一片纹理（对比图 .local/previews/favicon/icon-crops.png）。
// 蜡笔笔触让 PNG 很大（512 原样 272KB），180 以上用调色板压缩（256 约 29KB，看不出损失）；Next 的 icon 不收 webp。
// 同一套图标也打包到 .local/deploy/icons/，别的博客（比如 Shiro 的 favicon / faviconDark）可以直接拿去用。
// 图标跟着人走、不跟着站点主题走：保留画纸的底色，不加夜空配色。--preview 另出一张 16/32/48 放大对比图到 .local/previews/favicon/。
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const sharp = createRequire(import.meta.url)("sharp");
const root = new URL("..", import.meta.url).pathname;
const source = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? `${root}.local/writing/images/icon-source.webp`;
const app = `${root}apps/web/app/`;
const bundle = `${root}.local/deploy/icons/`;

// 圆角方块：圆角半径占边长 22%（和系统应用图标差不多），四角透明
const png = (image, size) => image.png(size >= 180 ? { palette: true, quality: 85, compressionLevel: 9, effort: 10 } : { compressionLevel: 9 }).toBuffer();
const rounded = (size) => png(sharp(source).resize(size, size, { kernel: "lanczos3" }).composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#fff"/></svg>`), blend: "dest-in" }]), size);
const square = (size) => png(sharp(source).resize(size, size, { kernel: "lanczos3" }).flatten({ background: "#ffffff" }), size);

// ICO 容器里直接放 PNG（Vista 起所有浏览器都认）：6 字节文件头 + 每张 16 字节目录项 + 图片数据
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

const favicon = ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await rounded(size) }))));
const icon = await rounded(256);
const apple = await square(180);
writeFileSync(`${app}favicon.ico`, favicon);
writeFileSync(`${app}icon.png`, icon);
writeFileSync(`${app}apple-icon.png`, apple);

mkdirSync(bundle, { recursive: true });
writeFileSync(`${bundle}favicon.ico`, favicon);
for (const size of [16, 32, 192, 512]) writeFileSync(`${bundle}icon-${size}.png`, await rounded(size));
writeFileSync(`${bundle}apple-touch-icon.png`, apple);
console.log(`已写入 apps/web/app/{favicon.ico, icon.png, apple-icon.png}，打包在 ${bundle}`);

if (process.argv.includes("--preview")) {
  // 每个尺寸按像素放大 8 倍，分别放在深色和浅色的标签栏底色上
  const tiles = [];
  let left = 24;
  for (const size of [16, 32, 48]) {
    const scaled = await sharp(await rounded(size)).resize(size * 8, size * 8, { kernel: "nearest" }).png().toBuffer();
    tiles.push({ input: scaled, top: 24, left }, { input: scaled, top: 24 + 48 * 8 + 24, left });
    left += size * 8 + 24;
  }
  const width = left;
  const height = 24 + 48 * 8 * 2 + 48;
  await sharp({ create: { width, height: height, channels: 4, background: "#00000000" } })
    .composite([
      { input: Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${24 + 48 * 8 + 12}" fill="#2b2b2e"/><rect y="${24 + 48 * 8 + 12}" width="${width}" height="${height}" fill="#f2f2f2"/></svg>`) },
      ...tiles,
    ])
    .png()
    .toFile(`${root}.local/previews/favicon/icon-sizes.png`);
  console.log("预览：.local/previews/favicon/icon-sizes.png（上深色、下浅色；从左到右 16、32、48 像素各放大 8 倍）");
}
