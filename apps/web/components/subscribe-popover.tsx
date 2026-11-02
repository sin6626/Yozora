"use client";

import { Popover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useT } from "./locale-provider";
import SubscribeForm from "./subscribe-form";
import "./details-sidebar.css";
import "./subscribe-popover.css";

// 邮件订阅浮层：点触发按钮才浮出（一行小标题 + 订阅表单）。首屏的“订阅”按钮和文章侧栏的铃铛共用。
// 打开时鼠标/键盘直接聚焦邮箱输入框；触屏只聚焦浮层，免得一打开就弹出软键盘挡住浮层。
export default function SubscribePopover({ apiUrl, types, triggerClassName, triggerLabel, side = "top", children }: {
  apiUrl: string;
  types: ("post_c" | "note_c")[];
  triggerClassName: string;
  triggerLabel?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  const t = useT().subscribe;
  return (
    <Popover.Root>
      <Popover.Trigger className={triggerClassName} aria-label={triggerLabel} title={triggerLabel}>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="site-action-positioner" side={side} sideOffset={12} collisionPadding={16}>
          <Popover.Popup className="site-action-popup" initialFocus={(type) => (type === "touch" ? true : emailRef.current)}>
            <div className="subscribe-header">
              <Popover.Title className="subscribe-title">{t.title}</Popover.Title>
              <Popover.Close className="subscribe-close" aria-label={t.close}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </Popover.Close>
            </div>
            <SubscribeForm apiUrl={apiUrl} types={types} emailRef={emailRef} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
