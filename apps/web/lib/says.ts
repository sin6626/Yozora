// 一言（朋友们说过的好句子）的几样纯逻辑：按人分组、抽一句、金句卡片图上的折行、金句星图排布。页面在 components/say-list.tsx、say-sky.tsx、say-tools.tsx。

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

// 抽一句：随机挑一条，有得选时不和上一次抽到的重复
export function drawSay<T extends { id: string }>(says: T[], previousId?: string, random = Math.random) {
  const pool = says.length > 1 ? says.filter((say) => say.id !== previousId) : says;
  return pool.length ? pool[Math.floor(random() * pool.length)] : undefined;
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
export type SkyLayout = { size: number; limit: number; stars: SkyStar[]; groups: SkyGroup[]; dust: { x: number; y: number; r: number; o: number }[] };

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

// 星图排布（坐标在 size×size 的正方形里，星都在半径 limit 的圆内）：
// 每个人一个星座，说得多的排在前面，按向日葵种子那样的黄金角螺线铺开，互相不挤；没写作者的句子各自是一颗孤星。
// 星座里第一颗（最早的那句）在星座中心，其余随机散在周围，两颗星至少隔 16，连线是最小生成树；名字标在星座下方。
export function skyLayout(says: Say[], size = 400): SkyLayout {
  const center = size / 2;
  const limit = size / 2 - 22;
  const groups = [
    ...authorsOf(says).map(({ name }) => ({ name, members: says.filter((say) => say.author?.trim() === name) })),
    ...says.filter((say) => !say.author?.trim()).map((say) => ({ name: undefined, members: [say] })),
  ];
  const stars: SkyStar[] = [];
  const result: SkyGroup[] = groups.map((group, index) => {
    const distance = groups.length === 1 ? 0 : limit * 0.7 * Math.sqrt((index + 0.5) / groups.length);
    const angle = index * golden + 0.6;
    const cx = center + distance * Math.cos(angle);
    const cy = center + distance * Math.sin(angle);
    const radius = Math.min(72, 12 + 13 * Math.sqrt(group.members.length));
    const members = [...group.members].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
    const indices = members.map((say, order) => {
      const random = seededRandom(say.id);
      let [x, y] = [cx, cy];
      for (let tries = 0; tries < 40; tries++) {
        const spread = order === 0 && tries === 0 ? 0 : Math.sqrt(random()) * radius;
        const turn = random() * Math.PI * 2;
        [x, y] = [cx + spread * Math.cos(turn), cy + spread * Math.sin(turn)];
        if (Math.hypot(x - center, y - center) <= limit && stars.every((star) => Math.hypot(star.x - x, star.y - y) >= 16)) break;
      }
      stars.push({ id: say.id, x: round(x), y: round(y), r: round(2.4 + random() * 1.1), group: index });
      return stars.length - 1;
    });
    const points = indices.map((i) => stars[i]);
    const edges = spanningTree(points).map(([a, b]) => [indices[a], indices[b]] as [number, number]);
    if (!group.name) return { stars: indices, edges };
    const lowest = Math.max(...points.map((point) => point.y));
    const middle = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const below = { x: round(middle), y: round(lowest + 24) };
    const above = { x: round(middle), y: round(Math.min(...points.map((point) => point.y)) - 16) };
    return { name: group.name, stars: indices, edges, label: Math.hypot(below.x - center, below.y - center) <= limit + 10 ? below : above };
  });
  const random = seededRandom("yozora-dust");
  const dust = Array.from({ length: 110 }, () => {
    const turn = random() * Math.PI * 2;
    const spread = Math.sqrt(random()) * (limit + 14);
    return { x: round(center + spread * Math.cos(turn)), y: round(center + spread * Math.sin(turn)), r: round(0.4 + random() * 0.7), o: round(0.15 + random() * 0.4) };
  });
  return { size, limit, stars, groups: result, dust };
}
