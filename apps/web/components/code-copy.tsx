"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "./locale-provider";

// Markdown 代码块的复制按钮，外观和交互照富文本（Haklex）的：16px 图标，复制后 2 秒显示对勾。样式在 post-detail.css
export default function CodeCopy({ code }: { code: string }) {
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
    <button type="button" className="code-copy" aria-label={copied ? t.copied : t.copy} onClick={copy}>
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}
