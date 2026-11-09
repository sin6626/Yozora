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
