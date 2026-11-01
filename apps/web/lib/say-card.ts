// 金句卡片图（一言页“做成卡片”）：在浏览器里用画布画一张 1080×1350 的竖图，可以保存或分享到微信、朋友圈。
// 颜色取夜航岛那套深色设计变量（浅色深色主题下都是深色，换配色时跟着换）；正文用首屏的霞鹜文楷（页面已经按需加载）。
// 不在服务端生成：服务端画中文要带几 MB 的字体文件，浏览器里本来就有。折行规则在 lib/says.ts 的 wrapText。
import { wrapText, type Say } from "./says";

const width = 1080;
const height = 1350;
const margin = 120;
const serif = '"LXGW WenKai", "PingFang SC", serif';

// 设计变量解析成具体颜色；背景去掉透明度（夜航岛底色带 92% 透明度），否则存出来的图是半透明的
function readPalette() {
  const probe = document.createElement("span");
  document.body.append(probe);
  const resolve = (value: string) => {
    probe.style.color = "";
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const opaque = resolve("rgb(from var(--island-bg) r g b)");
  const palette = {
    background: opaque && opaque !== "rgba(0, 0, 0, 0)" ? opaque : resolve("var(--island-bg)"),
    text: resolve("var(--island-fg)"),
    muted: resolve("var(--island-muted)"),
    accent: resolve("var(--island-primary)"),
  };
  probe.remove();
  return palette;
}

// 同一句话每次画出来的星星一样（按 id 播种）
function seeded(seed: string) {
  let state = [...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function drawSayCard(say: Say, { site, date, anonymous }: { site: string; date: string; anonymous: string }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  const palette = readPalette();
  const sans = getComputedStyle(document.body).fontFamily;
  const attribution = `—— ${say.author?.trim() || anonymous}${say.source ? `《${say.source}》` : ""}`;
  // 文楷按字切片下载，画之前把要用的字载好
  await Promise.all([document.fonts.load(`300 64px ${serif}`, say.text + attribution), document.fonts.load(`400 30px ${sans}`, site + date)]);

  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.85, height * 0.08, 0, width * 0.85, height * 0.08, width * 0.9);
  glow.addColorStop(0, palette.accent);
  glow.addColorStop(1, "transparent");
  context.globalAlpha = 0.18;
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  // 星星：大多是小点，少数亮的带十字星芒
  const random = seeded(say.id);
  context.fillStyle = palette.text;
  for (let i = 0; i < 150; i++) {
    const x = random() * width;
    const y = random() * height;
    const size = 0.6 + random() ** 3 * 2.2;
    context.globalAlpha = 0.15 + random() * 0.6;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    if (size > 2.2) {
      context.globalAlpha *= 0.6;
      context.fillRect(x - size * 4, y - 0.5, size * 8, 1);
      context.fillRect(x - 0.5, y - size * 4, 1, size * 8);
    }
  }
  context.globalAlpha = 1;

  // 正文：从 64px 开始，放不下就缩小，最小 40px
  const maxWidth = width - margin * 2;
  let size = 64;
  let lines: string[] = [];
  for (; size >= 40; size -= 2) {
    context.font = `300 ${size}px ${serif}`;
    lines = wrapText(say.text, (value) => context.measureText(value).width, maxWidth);
    if (lines.length * size * 1.7 <= 640) break;
  }
  const lineHeight = size * 1.7;
  context.font = `300 34px ${serif}`;
  const credits = wrapText(attribution, (value) => context.measureText(value).width, maxWidth);
  // 正文 + 署名作为一整块，在引号下方到底部细线之间上下居中，短句不会全挤在上面
  const blockHeight = lines.length * lineHeight + credits.length * 54;
  let y = Math.max(400, 360 + (height - 200 - 360 - blockHeight) / 2);

  // 大引号跟着正文，放在第一行左上方
  context.fillStyle = palette.accent;
  context.globalAlpha = 0.75;
  context.font = `400 200px ${serif}`;
  context.textBaseline = "alphabetic";
  // 弯引号的字形在字框上半部，基线压低一点，引号才贴着第一行
  context.fillText("“", margin - 24, y + 70);
  context.globalAlpha = 1;

  context.font = `300 ${size}px ${serif}`;
  context.fillStyle = palette.text;
  context.textBaseline = "top";
  for (const line of lines) {
    context.fillText(line, margin, y);
    y += lineHeight;
  }

  context.font = `300 34px ${serif}`;
  context.fillStyle = palette.muted;
  for (const line of credits) {
    y += 20;
    context.fillText(line, margin, y);
    y += 34;
  }

  // 底部：站名 | 日期，上面一道细线
  context.globalAlpha = 0.25;
  context.fillRect(margin, height - 170, maxWidth, 1);
  context.globalAlpha = 1;
  context.font = `400 30px ${sans}`;
  context.textBaseline = "alphabetic";
  context.fillStyle = palette.text;
  context.fillText(site, margin, height - 105);
  context.fillStyle = palette.muted;
  context.textAlign = "right";
  context.fillText(date, width - margin, height - 105);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"));
}
