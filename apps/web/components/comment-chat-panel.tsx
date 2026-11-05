"use client";

import { Popover } from "@base-ui/react/popover";
import { MessagesSquare, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import CommentForm, { type CommentRefType } from "./comment-form";
import type { FormOptions } from "./comments";
import { useT } from "./locale-provider";

type ReplyTarget = { id: string; author: string };

// 评论悬浮窗外壳：侧栏的评论按钮 + 浮在它左边的聊天窗（消息流由服务端渲染后作为 children 传进来）。
// 不滚动页面，读者读到哪儿还在哪儿；点框外、按 Esc、点 × 或再点按钮都会关掉（滚动页面不会关）。
// 消息区天然停在最新一条（comment-chat.css 的 column-reverse，不用脚本滚），打开时光标放进输入框；点某条的“回复”，输入框上方出现“回复 @某人”，被回复的那条亮起。
export default function CommentChatPanel({ title, total, form, closedReason, target, children }: {
  title: string;
  total: number;
  form: FormOptions;
  closedReason: string | null;
  target: { refId: string; refType: CommentRefType };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useT().chat;
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const textarea = () => composer.current?.querySelector("textarea") ?? null;

  // 被回复的那条消息亮起；换了回复对象就把光标送回输入框
  useEffect(() => {
    const stream = scroller.current;
    if (!stream || !replyTo) return;
    const message = stream.querySelector<HTMLElement>(`.chat-message[data-id="${CSS.escape(replyTo.id)}"]`);
    message?.setAttribute("data-replying", "");
    textarea()?.focus();
    return () => message?.removeAttribute("data-replying");
  }, [replyTo]);

  function pickReply(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-reply-id]");
    if (button) setReplyTo({ id: button.dataset.replyId!, author: button.dataset.replyAuthor ?? "" });
  }

  return (
    <Popover.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReplyTo(null);
      }}
    >
      <Popover.Trigger className="article-action" aria-label={total ? t.triggerCount(total) : t.trigger} title={t.title}>
        <MessagesSquare size={18} strokeWidth={1.75} aria-hidden="true" />
        {total > 0 && <span className="article-action-count">{total}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="chat-positioner" side="left" align="end" sideOffset={16} collisionPadding={16}>
          <Popover.Popup className="chat-popup" initialFocus={(type) => (type === "touch" ? true : textarea() ?? true)}>
            <header className="chat-header">
              <div className="chat-heading">
                <Popover.Title className="chat-title">{t.title}{total > 0 && <span>{total}</span>}</Popover.Title>
                <Popover.Description className="chat-subtitle">{title}</Popover.Description>
              </div>
              <Popover.Close className="chat-close" aria-label={t.close}>
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </Popover.Close>
            </header>
            <div className="chat-scroller" ref={scroller} onClick={pickReply}>{children}</div>
            <div className="chat-composer" ref={composer}>
              {closedReason ? (
                <p className="chat-closed">{closedReason}</p>
              ) : (
                <>
                  {replyTo && (
                    <p className="chat-replying">
                      <span>{t.replyingTo} <strong>@{replyTo.author}</strong></span>
                      <button type="button" onClick={() => setReplyTo(null)} aria-label={t.cancelReply}><X size={14} strokeWidth={2} aria-hidden="true" /></button>
                    </p>
                  )}
                  <CommentForm key={replyTo?.id ?? "new"} {...form} variant="chat" onDone={() => setReplyTo(null)} {...(replyTo ? { replyTo } : target)} />
                </>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
