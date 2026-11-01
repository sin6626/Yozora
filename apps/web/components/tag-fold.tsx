"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

// 宽屏右栏的标签：先是最常用的那组（children），下面是收起来的其余标签（rest），最下面一个“展开全部 N 个 / 收起”按钮。
// 其余标签用 grid 行高从 0 过渡到内容高（details-sidebar.css 的 .tag-fold），上面那组不动；收起时 inert，不能用 Tab 进到看不见的标签。
export default function TagFold({ rest, showLabel, hideLabel, children }: { rest: ReactNode; showLabel: string; hideLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      {children}
      <div id={id} className="tag-fold" data-open={open ? "" : undefined} inert={!open}>
        <div className="tag-fold-inner">{rest}</div>
      </div>
      <button type="button" className="tag-fold-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        {open ? hideLabel : showLabel}
        <ChevronDown className="tag-drawer-arrow" size={14} aria-hidden="true" />
      </button>
    </>
  );
}
