// 一言（朋友们说过的好句子）的几样纯逻辑：按人分组、抽一句、金句卡片图上的折行。页面在 components/say-list.tsx、say-tools.tsx。

export type Say = { id: string; text: string; author?: string; source?: string; created: string };

// 按说话的人分组计数：说得多的在前，一样多时按列表里先出现的（新的）在前；没写作者的不算
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
