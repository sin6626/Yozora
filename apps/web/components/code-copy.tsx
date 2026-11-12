"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "./locale-provider";

// 复制按钮：16px 图标，复制后 2 秒显示对勾。Markdown 代码块用它（外观照富文本 Haklex 的，样式在 post-detail.css），
// 友链申请区本站信息的每一行也用它（传读屏名字和类名）
export default function CodeCopy({ code, label, className = "code-copy" }: { code: string; label?: string; className?: string }) {
  const t = useT().codeBlock;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }, () => {});
  }

  return (
    <button type="button" className={className} aria-label={copied ? t.copied : (label ?? t.copy)} onClick={copy}>
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}
