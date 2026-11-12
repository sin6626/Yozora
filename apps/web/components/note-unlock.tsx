"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useActionState, useId } from "react";
import { unlockNote } from "./note-unlock-action";
import { useT } from "./locale-provider";
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "./note-unlock.css";

type State = { ok: false; reason: "needPassword" | "wrongPassword" | "failed"; attempt: number } | { ok: true } | null;

// 加密手记的锁：月亮藏在云后面，一句文楷写的话，一条信纸横线写密码（同邮件订阅表单的样子）。
// 密码对了，服务端函数写好会话 Cookie，Next 重新渲染整页，这里随之换成完整的手记；密码不对时横线轻轻一晃、清空重输。
export default function NoteUnlock({ nid }: { nid: number }) {
  const id = useId();
  const { notes: t, list } = useT();
  const [state, action, pending] = useActionState<State, FormData>(async (previous, data) => {
    const result = await unlockNote(nid, String(data.get("password") ?? ""));
    return result.ok ? result : { ...result, attempt: (previous && !previous.ok ? previous.attempt : 0) + 1 };
  }, null);
  const failed = state && !state.ok ? state : null;
  const error = failed && (failed.reason === "failed" ? list.genericFailed : t[failed.reason]);
  return (
    <section className="note-lock" aria-labelledby={`${id}-title`}>
      <div className="note-lock-sky" aria-hidden="true">
        <span className="note-lock-moon" />
        {/* 三个云头的一团云：上亮下暗，上沿描一道被月亮照亮的边 */}
        <svg className="note-lock-cloud" viewBox="0 0 128 52">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="note-lock-cloud-top" />
              <stop offset="1" className="note-lock-cloud-bottom" />
            </linearGradient>
            <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="note-lock-rim" />
              <stop offset="0.55" className="note-lock-rim" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M16 48 A13 13 0 0 1 26 23 A21 21 0 0 1 66 13 A16 16 0 0 1 96 22 A13 13 0 0 1 112 48 Z" fill={`url(#${id}-fill)`} stroke={`url(#${id}-rim)`} strokeWidth="1" />
        </svg>
      </div>
      <h1 className="note-lock-title" id={`${id}-title`}>{t.locked}</h1>
      <p className="note-lock-hint">{t.lockedHint}</p>
      <form className="note-lock-form" action={action}>
        {/* 每次输错换一个 key：横线重新挂上去，晃一下的动画重播，焦点回到输入框 */}
        <div className="note-lock-line" key={failed?.attempt ?? 0} data-error={error ? "" : undefined}>
          <label className="sr-only" htmlFor={`${id}-password`}>{t.password}</label>
          <input
            className="note-lock-input"
            id={`${id}-password`}
            name="password"
            type="password"
            required
            maxLength={100}
            autoComplete="off"
            autoFocus={Boolean(failed)}
            placeholder={t.password}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <button className="note-lock-send" type="submit" disabled={pending} aria-label={pending ? t.verifying : t.unlock} title={t.unlock}>
            {pending ? <LoaderCircle className="note-lock-spin" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
          </button>
        </div>
        <p className="note-lock-error" id={`${id}-error`} role="alert">{error}</p>
      </form>
    </section>
  );
}
