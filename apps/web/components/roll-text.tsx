import type { CSSProperties } from "react";
import "./roll-text.css";

// 逐字翻滚的文字（2026-11-09 站长给的参考录屏）：所在的链接被悬停或键盘聚焦时，每个字往上滚出一行，
// 同一个字从下面滚进来（text-shadow 画在下一行的那份），后面的字依次晚一点开始。样式在 roll-text.css。
// 这里对读屏隐藏（逐字拆开的 span 在有的读屏里会一个字母一个字母念），用的地方要给链接写 aria-label。
// 用在页脚小链接和导航面板底栏（e2e roll-text.mjs）。
export default function RollText({ children }: { children: string }) {
  return (
    <span className="roll-text" aria-hidden="true">
      {Array.from(children).map((char, index) => (
        <span key={index} className="roll-glyph" data-char={char} style={{ "--i": index } as CSSProperties}>
          {char}
        </span>
      ))}
    </span>
  );
}

// 从旧文字滚到新文字（导航面板右栏换分类时用，2026-11-09）：把一段文字拆成一个个 .roll-ch，
// 外层带 data-roll="in" 时每个字从下一行滚上来、data-roll="out" 时往上滚出去（动画在 roll-text.css）。
// from 是这一段开始的时间（毫秒），字与字之间最多 18ms、整段最多错开 180ms，长标题不会滚很久。
// 外面那一格要裁成一行（overflow: hidden），否则滚动中的字会露到上下行。
export function RollChars({ text, from = 0 }: { text: string; from?: number }) {
  const chars = Array.from(text);
  const step = Math.min(18, 180 / Math.max(1, chars.length));
  return chars.map((char, index) => (
    <span key={index} className="roll-ch" style={{ "--d": `${Math.round(from + index * step)}ms` } as CSSProperties}>
      {char}
    </span>
  ));
}
