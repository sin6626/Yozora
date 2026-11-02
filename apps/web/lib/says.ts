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

// ---------- 金句星图（components/say-sky.tsx）：每句话一颗星，同一个人说的连成星座 ----------
export type SkyStar = { id: string; x: number; y: number; r: number; group: number };
export type SkyGroup = { name?: string; stars: number[]; edges: [number, number][]; label?: { x: number; y: number } };
// hit：每颗星可悬停的半径；glow：星的光晕亮度。星多时两个都变小，免得互相盖住、糊成一片
export type SkyLayout = { size: number; limit: number; hit: number; glow: number; stars: SkyStar[]; groups: SkyGroup[]; dust: { x: number; y: number; r: number; o: number }[] };

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

// 星图排布（坐标在 size×size 的正方形里，星都在半径 limit 的圆内）。句子再多也装得下：
// ① 先在不限大小的平面上排：星座半径按星数算（星越多越大），说得多的排前面，从中心沿黄金角螺线往外找第一个和已有星座不重叠的位置；
//    没写作者的句子各自是一颗孤星，排在最后；
// ② 再整体缩放到刚好装进星盘（星少时最多放大到 3 倍，免得挤在中间）；星多时星点、可悬停半径跟着变小。
// 星座里第一颗（最早那句）在中心，连线是最小生成树；名字标在星座下方，出圈就标上方。
export function skyLayout(says: Say[], size = 400): SkyLayout {
  const center = size / 2;
  const limit = size / 2 - 22;
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
      const x = distance * Math.cos(step * golden);
      const y = distance * Math.sin(step * golden);
      if (centers.every((other) => Math.hypot(other.x - x, other.y - y) >= other.radius + group.radius + gap)) {
        centers.push({ x, y, radius: group.radius });
        from = step;
        break;
      }
    }
  }

  // ② 缩放进星盘
  const extent = Math.max(...groups.flatMap((group, index) => group.points.map((point) => Math.hypot(centers[index].x + point.x, centers[index].y + point.y))), 0);
  const scale = extent > 0 ? Math.min(3, limit / extent) : 1;
  const shrink = Math.min(1, Math.max(0.45, scale));
  const stars: SkyStar[] = [];
  const result: SkyGroup[] = groups.map((group, index) => {
    const indices = group.members.map((say, order) => {
      const point = group.points[order];
      stars.push({
        id: say.id,
        x: round(center + (centers[index].x + point.x) * scale),
        y: round(center + (centers[index].y + point.y) * scale),
        r: round((2.4 + seededRandom(`${say.id}:r`)() * 1.1) * shrink),
        group: index,
      });
      return stars.length - 1;
    });
    const placed = indices.map((i) => stars[i]);
    const edges = spanningTree(placed).map(([a, b]) => [indices[a], indices[b]] as [number, number]);
    if (!group.name) return { stars: indices, edges };
    const middle = round(placed.reduce((sum, star) => sum + star.x, 0) / placed.length);
    const below = { x: middle, y: round(Math.max(...placed.map((star) => star.y)) + 24) };
    const above = { x: middle, y: round(Math.min(...placed.map((star) => star.y)) - 16) };
    return { name: group.name, stars: indices, edges, label: below.y <= center + limit + 12 ? below : above };
  });

  const random = seededRandom("yozora-dust");
  const dust = Array.from({ length: 110 }, () => {
    const turn = random() * Math.PI * 2;
    const spread = Math.sqrt(random()) * (limit + 14);
    return { x: round(center + spread * Math.cos(turn)), y: round(center + spread * Math.sin(turn)), r: round(0.4 + random() * 0.7), o: round(0.15 + random() * 0.4) };
  });
  const glow = Math.round(0.35 * Math.min(1, Math.sqrt(40 / Math.max(1, stars.length))) * 100) / 100;
  return { size, limit, hit: round(Math.min(12, Math.max(3, (spacing * scale) / 2))), glow, stars, groups: result, dust };
}
