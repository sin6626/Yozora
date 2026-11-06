// 首屏“丛雨抱着 Sin”的素材处理：生图得到的品红底 PNG → 三层透明 WebP（.local/mascot/，不进 git：丛雨是同人图，只给站长自己的站用）。
// 导出后传到图床，把三个地址填进配置片段 theme/yozora 的 hero.mascot（back / blink / front），首页才会出现。
// 用法：node scripts/prepare-mascot.mjs <带字的完整构图.png> <去掉字的后层.png> <闭眼的后层.png>
// 三张图画布尺寸、人物位置必须一致。生图单独画的“只有手”那层位置总会变，所以手直接从完整构图里原位取：
//   back  = 完整构图，只把字母那几块换成后层同位置的像素（把字擦掉，露出后面的身体）；
//   front = 完整构图里压在字上的手（肤色区域）；
//   blink = 只有闭眼那一小块（闭眼帧与后层不同的地方，羽化边缘），平时透明。
// 最后打印字母在输出图里的位置，供 home-hero.css 换算 em。
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
// sharp 是 Next 自带的图片处理依赖，不单独安装
const sharp = createRequire(createRequire(join(root, "apps/web/package.json")).resolve("next/package.json"))("sharp");

const [referencePath, backPath, blinkPath] = process.argv.slice(2);
if (!blinkPath) throw new Error("需要三个参数：带字的完整构图、去掉字的后层、闭眼的后层");

const outDir = join(root, ".local/mascot");
const outWidth = 600;
const key = [255, 0, 255];
// 与品红的颜色距离小于 near 视为背景，大于 far 视为人物，中间是发丝等半透明边缘
const near = 70;
const far = 150;

async function keyOut(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0, q = 0; p < data.length; p += 3, q += 4) {
    const distance = Math.hypot(data[p] - key[0], data[p + 1] - key[1], data[p + 2] - key[2]);
    const alpha = Math.min(1, Math.max(0, (distance - near) / (far - near)));
    // 半透明边缘按 C = αF + (1-α)K 反推原色，去掉渗进来的品红
    for (let c = 0; c < 3; c++) {
      out[q + c] = alpha > 0 ? Math.min(255, Math.max(0, Math.round((data[p + c] - (1 - alpha) * key[c]) / alpha))) : 0;
    }
    out[q + 3] = Math.round(alpha * 255);
  }
  return { data: out, width: info.width, height: info.height };
}

const reference = await keyOut(referencePath);
const back = await keyOut(backPath);
const blink = await keyOut(blinkPath);
const { width, height } = reference;
const pixel = (layer, i) => [layer.data[i * 4], layer.data[i * 4 + 1], layer.data[i * 4 + 2]];

// 方框内计数用积分图，用来做“成片才算”和向外扩
function boxCounter(mask) {
  const s = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0, row = 0; x < width; x++) {
      row += mask[y * width + x];
      s[(y + 1) * (width + 1) + x + 1] = s[y * (width + 1) + x + 1] + row;
    }
  }
  return (x, y, r) => {
    const [x0, y0, x1, y1] = [Math.max(0, x - r), Math.max(0, y - r), Math.min(width - 1, x + r), Math.min(height - 1, y + r)];
    return s[(y1 + 1) * (width + 1) + x1 + 1] - s[y0 * (width + 1) + x1 + 1] - s[(y1 + 1) * (width + 1) + x0] + s[y0 * (width + 1) + x0];
  };
}

function grow(mask, test) {
  const count = boxCounter(mask);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = test(count, x, y) ? 1 : 0;
  return out;
}

// 字母：完整构图里是奶白、后层同位置不是奶白的像素（头发高光和字母几乎同色，但两张图里都有，靠这一点排除）。
// 再要求成片：21×21 方框里八成五是字母才算笔画中心（笔画约 38px 粗），离笔画中心 14px 内的都算字母，
// 最后向外扩 3px 吃掉抗锯齿边
const isCream = ([r, g, b]) => r > 235 && g > 226 && g - b > 12 && r - g < 16;
const cream = new Uint8Array(width * height);
for (let i = 0; i < cream.length; i++) cream[i] = isCream(pixel(reference, i)) && !isCream(pixel(back, i)) ? 1 : 0;
const strokeCenter = grow(cream, (count, x, y) => count(x, y, 10) > 441 * 0.85);
const nearStroke = boxCounter(strokeCenter);
const letterCore = cream.map((v, i) => (v && nearStroke(i % width, Math.floor(i / width), 14) > 0 ? 1 : 0));
const letters = grow(letterCore, (count, x, y) => count(x, y, 3) > 0);

// 手：离字母 40px 以内的肤色像素（含指甲和指缝阴影）。只取压在字上的这一圈：
// 手的其余部分后层里原样就有；前层画在闭眼帧上面，取到脸会把闭着的眼睛盖回去
const nearLetters = boxCounter(letterCore);
const skin = new Uint8Array(width * height);
for (let i = 0; i < skin.length; i++) {
  const [r, g, b] = pixel(reference, i);
  const isSkin = r > 190 && r - b > 18 && g - b > 4 && r - g > 12 && r - g < 75;
  if (isSkin && !letterCore[i] && reference.data[i * 4 + 3] > 200 && nearLetters(i % width, Math.floor(i / width), 40) > 0) skin[i] = 1;
}
// 先开运算去掉字母边上那圈和肤色相近的抗锯齿细线（≤ 3px），再闭运算补手上的小洞
const opened = grow(grow(skin, (count, x, y) => count(x, y, 2) === 25), (count, x, y) => count(x, y, 2) > 0);
const hands = grow(grow(opened, (count, x, y) => count(x, y, 2) > 0), (count, x, y) => count(x, y, 2) === 25);
const box = (() => {
  let top = height, bottom = 0, left = width, right = 0;
  letterCore.forEach((v, i) => {
    if (!v) return;
    const [x, y] = [i % width, Math.floor(i / width)];
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
  });
  return { top, bottom, left, right };
})();

// 闭眼：闭眼帧与后层差别大的地方（只有眼睛），扩 14px 再羽化 10px
const eyes = new Uint8Array(width * height);
for (let i = 0; i < eyes.length; i++) {
  const [a, b] = [pixel(blink, i), pixel(back, i)];
  eyes[i] = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 60 ? 1 : 0;
}
const eyeCore = grow(grow(eyes, (count, x, y) => count(x, y, 3) > 20), (count, x, y) => count(x, y, 14) > 0);
const eyeCount = boxCounter(eyeCore);

const layers = { back: Buffer.alloc(width * height * 4), front: Buffer.alloc(width * height * 4), blink: Buffer.alloc(width * height * 4) };
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const o = i * 4;
    (letters[i] ? back.data : reference.data).copy(layers.back, o, o, o + 4);
    if (hands[i]) reference.data.copy(layers.front, o, o, o + 4);
    const feather = eyeCount(x, y, 10) / 441;
    if (feather > 0) {
      blink.data.copy(layers.blink, o, o, o + 3);
      layers.blink[o + 3] = Math.round(blink.data[o + 3] * feather);
    }
  }
}

// 三层按后层的可见范围统一裁切
let left = width, top = height, right = 0, bottom = 0;
for (let i = 0; i < width * height; i++) {
  if (layers.back[i * 4 + 3] > 8) {
    const [x, y] = [i % width, Math.floor(i / width)];
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
}
const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
const scale = outWidth / crop.width;

mkdirSync(outDir, { recursive: true });
for (const [name, data] of Object.entries(layers)) {
  const info = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract(crop)
    .resize({ width: outWidth })
    .webp({ quality: 86, alphaQuality: 90, effort: 6 })
    .toFile(join(outDir, `${name}.webp`));
  console.log(name, `${info.width}x${info.height}`, `${(info.size / 1024).toFixed(1)}KB`);
}
const at = (v, origin) => +((v - origin) * scale).toFixed(1);
console.log("字母在输出图里（像素）", { left: at(box.left, crop.left), right: at(box.right, crop.left), top: at(box.top, crop.top), bottom: at(box.bottom, crop.top) });
