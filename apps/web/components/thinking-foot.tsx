"use client";

import { MessageCircle } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useT } from "./locale-provider";

// 一条思考的底部：赞、踩、评论三个小图标排成一行，点评论在下面展开这条的评论区（服务端已渲染好，这里只管显隐）。
export default function ThinkingFoot({ attitude, count, children }: { attitude: ReactNode; count: number; children?: ReactNode }) {
  const t = useT().thinking;
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="thinking-foot">
      <div className="thinking-actions">
        {attitude}
        {children && (
          <button className="thinking-action" type="button" aria-label={t.comments(count)} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            <MessageCircle size={15} aria-hidden="true" />
            {count > 0 && count}
          </button>
        )}
      </div>
      {children && <div className="thinking-comments" id={id} hidden={!open}>{children}</div>}
    </div>
  );
}
