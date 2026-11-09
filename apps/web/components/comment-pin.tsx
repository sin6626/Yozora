"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pin, PinOff } from "lucide-react";
import { useT } from "./locale-provider";
import { useReaderSession } from "./reader-session";

// 站长在前台置顶 / 取消置顶主评论：只有用站长身份登录（Core 会话 role === "owner"）时才出现。
// 从浏览器带 Cookie 直连 Core 的 PATCH /comments/:id（只认站长，见 Core 的 AuthGuard）；Core 置顶一条时会把同一篇的其他置顶取消。
// 成功后让评论缓存失效并刷新，置顶的那条排到最前。
export default function CommentPin({ apiUrl, id, pinned }: { apiUrl: string; id: string; pinned: boolean }) {
  const session = useReaderSession(apiUrl);
  const t = useT().comments;
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  if (session.status !== "reader" || !session.reader.isOwner) return null;

  async function toggle() {
    setState("busy");
    try {
      const response = await fetch(`${apiUrl}/comments/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: !pinned }),
      });
      if (!response.ok) return setState("failed");
      router.refresh();
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  const Icon = pinned ? PinOff : Pin;
  return (
    <>
      <button className="comment-pin" type="button" disabled={state === "busy"} onClick={() => void toggle()}>
        <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
        {pinned ? t.unpin : t.pin}
      </button>
      {state === "failed" && <span className="comment-pin-failed" role="alert">{t.pinFailed}</span>}
    </>
  );
}
