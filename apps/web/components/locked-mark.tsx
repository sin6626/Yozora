import { Lock } from "lucide-react";
import "./locked-mark.css";

// 带密码手记标题前的小锁（2026-11-15 站长定“标题加锁”）：手记列表、首页、时间线、话题卡片、左侧时间线、前后手记、导航面板共用。
// 图标对读屏隐藏，旁边一句“需要密码”只给读屏。没有 hooks，服务端、客户端组件都能用。
export default function LockedMark({ label }: { label: string }) {
  return (
    <span className="locked-mark">
      <Lock aria-hidden="true" strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
