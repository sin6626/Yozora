// 一言（朋友们说过的好句子）的几样纯逻辑：按人分组、金句卡片图上的折行、金句星图排布。页面在 components/say-list.tsx、say-sky.tsx、say-tools.tsx。

export type Say = { id: string; text: string; author?: string; source?: string; created: string };

// 按说话的人分组计数（金句星图的星座）：说得多的在前，一样多时按列表里先出现的（新的）在前；没写作者的不算
export function authorsOf(says: Say[]) {
  const counts = new Map<string, number>();
  for (const say of says) {
    const author = say.author?.trim();
    if (author) counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

// 不能放在行首的标点：放不下时挂在上一行末尾（中文排版的“避头”）
const closing = /^[，。、；：？！,.;:?!）)」』》〉】”’…—～]/;

// 卡片图上的折行：中日文一个字一个单位，英文和数字连成一个词不拆；measure 量一段文字的宽度（画布的 measureText）
export function wrapText(text: string, measure: (value: string) => number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const units = paragraph.match(/[A-Za-z0-9'’\-_.@/]+ ?|\s+|./gu) ?? [];
    let line = "";
    for (const unit of units) {
      if (!line && /^\s+$/.test(unit)) continue;
      const next = line + unit;
      if (!line || measure(next.trimEnd()) <= maxWidth || closing.test(unit)) {
        line = next;
        continue;
      }
      lines.push(line.trimEnd());
      line = unit.trimStart();
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// ---------- 金句星图（components/say-sky.tsx）：一整屏星空，每句话一颗星，同一个人说的连成星座 ----------
// x、y 是在画面里的百分比（画面多宽多高都能放），r 是星的半径（像素），b 是亮度（新的一句最亮）
export type SkyStar = { id: string; x: number; y: number; r: number; b: number; group: number };
export type SkyGroup = { name?: string; stars: number[]; edges: [number, number][] };
// 画面的设计尺寸（像素）与四周留白；实际画面按百分比伸缩。竖屏底部留出那句话卡片的位置
export type SkyFrame = { width: number; height: number; padX: number; padTop: number; padBottom: number };
// hit：每颗星可悬停的半径（像素）；glow：星的光晕亮度。星多时两个都变小，免得互相盖住、糊成一片
export type SkyLayout = { width: number; height: number; hit: number; glow: number; stars: SkyStar[]; groups: SkyGroup[] };

// 横屏（电脑）和竖屏（手机）各排一份，页面按屏幕方向显示其中一份
export const skyFrames = {
  wide: { width: 1600, height: 760, padX: 110, padTop: 60, padBottom: 80 },
  tall: { width: 390, height: 660, padX: 44, padTop: 84, padBottom: 236 },
} satisfies Record<string, SkyFrame>;

// 按字符串播种的随机数：同一句话、同一个人每次都落在同一个位置
export function seededRandom(seed: string) {
  let state = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value * 10) / 10;
const golden = Math.PI * (3 - Math.sqrt(5));
const spacing = 16;

// 星座的连线：最小生成树（像真实星座那样把最近的星串起来，不交叉成网）
function spanningTree(points: { x: number; y: number }[]) {
  const edges: [number, number][] = [];
  const joined = new Set(points.length ? [0] : []);
  while (joined.size < points.length) {
    let best: [number, number] | undefined;
    let bestDistance = Infinity;
    for (const from of joined) {
      points.forEach((point, to) => {
        if (joined.has(to)) return;
        const distance = Math.hypot(point.x - points[from].x, point.y - points[from].y);
        if (distance < bestDistance) [best, bestDistance] = [[from, to], distance];
      });
    }
    if (!best) break;
    edges.push(best);
    joined.add(best[1]);
  }
  return edges;
}

// 一个星座里的星：第一颗（最早那句）在中心，其余按句子 id 播种散在半径 radius 内，彼此至少隔 spacing（试 60 次找不到就取离别的星最远的那次）
function scatter(members: Say[], radius: number) {
  const points: { x: number; y: number }[] = [];
  for (const [order, say] of members.entries()) {
    const random = seededRandom(say.id);
    let best = { x: 0, y: 0, gap: -1 };
    for (let tries = 0; order > 0 && tries < 60 && best.gap < spacing; tries++) {
      const spread = Math.sqrt(random()) * radius;
      const turn = random() * Math.PI * 2;
      const candidate = { x: spread * Math.cos(turn), y: spread * Math.sin(turn) };
      const gap = Math.min(...points.map((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y)));
      if (gap > best.gap) best = { ...candidate, gap };
    }
    points.push({ x: best.x, y: best.y });
  }
  return points;
}

// 星图排布。句子再多也装得下：
// ① 先在不限大小的平面上排：星座半径按星数算（星越多越大），说得多的排前面，从中心沿黄金角螺线往外找第一个和已有星座不重叠的位置；
//    螺线按能放星的区域的宽高比压扁，排出来的一团和它一样宽扁；没写作者的句子各自是一颗孤星，排在最后；
// ② 再整体缩放到刚好铺满画面（星少时最多放大到 5 倍）；星多时星点、可悬停半径、光晕跟着变小。
// 星座里第一颗（最早那句）在中心，连线是最小生成树。新的句子亮、旧的暗一些（最暗 0.7，免得和背景里的星混在一起）。
export function skyLayout(says: Say[], frame: SkyFrame = skyFrames.wide): SkyLayout {
  const { width, height, padX, padTop, padBottom } = frame;
  // 按去掉留白后能放星的那块区域的宽高比压扁螺线
  const stretch = Math.sqrt((width - padX * 2) / (height - padTop - padBottom));
  const groups = [
    ...authorsOf(says).map(({ name }) => ({ name, members: says.filter((say) => say.author?.trim() === name) })),
    ...says.filter((say) => !say.author?.trim()).map((say) => ({ name: undefined, members: [say] })),
  ].map((group) => {
    const members = [...group.members].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
    const radius = spacing * Math.max(0.5, 0.8 * Math.sqrt(members.length));
    return { ...group, members, radius, points: scatter(members, radius) };
  });

  // ① 螺线上找位置。半径和上一个一样时从上一个的落点接着找（前面放不下的地方现在也放不下），否则从中心重找，好填进大星座之间的空隙
  const gap = spacing * 1.25;
  const centers: { x: number; y: number; radius: number }[] = [];
  let from = 0;
  for (const [index, group] of groups.entries()) {
    if (index > 0 && group.radius !== groups[index - 1].radius) from = 0;
    for (let step = from; ; step++) {
      const distance = spacing * 0.6 * Math.sqrt(step);
      const x = distance * Math.cos(step * golden) * stretch;
      const y = (distance * Math.sin(step * golden)) / stretch;
      if (centers.every((other) => Math.hypot(other.x - x, other.y - y) >= other.radius + group.radius + gap)) {
        centers.push({ x, y, radius: group.radius });
        from = step;
        break;
      }
    }
  }

  // ② 缩放铺满画面（以所有星的外框为准，外框中心对准画面中心）
  const points = groups.flatMap((group, index) => group.points.map((point) => ({ x: centers[index].x + point.x, y: centers[index].y + point.y })));
  const [left, right] = [Math.min(...points.map((point) => point.x)), Math.max(...points.map((point) => point.x))];
  const [top, bottom] = [Math.min(...points.map((point) => point.y)), Math.max(...points.map((point) => point.y))];
  const scale = Math.min(5, (width - padX * 2) / Math.max(right - left, 1e-6), (height - padTop - padBottom) / Math.max(bottom - top, 1e-6));
  const shrink = Math.min(1, Math.max(0.45, scale));
  const toX = (x: number) => width / 2 + (x - (left + right) / 2) * scale;
  const toY = (y: number) => padTop + (height - padTop - padBottom) / 2 + (y - (top + bottom) / 2) * scale;
  const percent = (value: number, total: number) => Math.round((value / total) * 10000) / 100;
  const order = [...says].sort((a, b) => Date.parse(a.created) - Date.parse(b.created)).map((say) => say.id);
  const age = new Map(order.map((id, index) => [id, order.length > 1 ? index / (order.length - 1) : 1]));

  const stars: SkyStar[] = [];
  const result: SkyGroup[] = groups.map((group, index) => {
    const placed = group.members.map((say, rank) => {
      const point = group.points[rank];
      return { id: say.id, x: toX(centers[index].x + point.x), y: toY(centers[index].y + point.y) };
    });
    const indices = placed.map((star) => {
      stars.push({
        id: star.id,
        x: percent(star.x, width),
        y: percent(star.y, height),
        r: round((2.4 + seededRandom(`${star.id}:r`)() * 1.1) * shrink),
        b: Math.round((0.7 + 0.3 * (age.get(star.id) ?? 1)) * 100) / 100,
        group: index,
      });
      return stars.length - 1;
    });
    const edges = spanningTree(placed).map(([a, b]) => [indices[a], indices[b]] as [number, number]);
    return group.name ? { name: group.name, stars: indices, edges } : { stars: indices, edges };
  });

  const glow = Math.round(0.35 * Math.min(1, Math.sqrt(40 / Math.max(1, stars.length))) * 100) / 100;
  // 可悬停半径：最近两颗星距离的一半（最多 14），保证互不盖住
  let closest = Infinity;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) closest = Math.min(closest, Math.hypot(((stars[i].x - stars[j].x) / 100) * width, ((stars[i].y - stars[j].y) / 100) * height));
  }
  return { width, height, hit: Math.floor(Math.min(28, closest) * 5) / 10, glow, stars, groups: result };
}

// 那句话的卡片放在星的哪一边：右、左、上、下四边，每边沿着星滑五个位置（f 是卡片相对星挪了自己的几成：
// 左右时是往上挪、上下时是往左挪），挑出不出画面、盖住别的星最少的一个；一样少时偏向居中、先右后左再上下。
// width、height 传画面实际的像素大小（没量到时用设计尺寸），卡片约 336×200 像素；星的可悬停范围碰到卡片也算盖住。
// 星很密时总会盖住几颗，换一颗星后就能悬停到。
export type CardPlace = { side: "right" | "left" | "above" | "below"; f: number };
const cardSides = ["right", "left", "above", "below"] as const;
export function placeCard(layout: Pick<SkyLayout, "width" | "height" | "hit" | "stars">, starIndex: number, card = { width: 336, height: 200 }): CardPlace {
  const star = layout.stars[starIndex];
  const w = (card.width / layout.width) * 100;
  const h = (card.height / layout.height) * 100;
  const [gapX, gapY] = [((layout.hit + 12) / layout.width) * 100, ((layout.hit + 12) / layout.height) * 100];
  const [padX, padY] = [(layout.hit / layout.width) * 100, (layout.hit / layout.height) * 100];
  let best: { place: CardPlace; cost: number } | undefined;
  for (const [order, side] of cardSides.entries()) {
    for (const f of [0.5, 0.3, 0.7, 0.08, 0.92]) {
      const left = side === "right" ? star.x + gapX : side === "left" ? star.x - gapX - w : star.x - f * w;
      const top = side === "above" ? star.y - gapY - h : side === "below" ? star.y + gapY : star.y - f * h;
      const outside = Math.max(0, -left) + Math.max(0, left + w - 100) + Math.max(0, -top) + Math.max(0, top + h - 100);
      const covered = layout.stars.filter((other, index) => index !== starIndex && other.x > left - padX && other.x < left + w + padX && other.y > top - padY && other.y < top + h + padY).length;
      const cost = outside * 100 + covered * 10 + Math.abs(f - 0.5) + order * 0.01;
      if (!best || cost < best.cost) best = { place: { side, f }, cost };
    }
  }
  return best!.place;
}
