"use client";

import { ArrowRight } from "lucide-react";
import { Fragment, useState, type FormEvent, type Ref } from "react";
import { useLocale, useT } from "./locale-provider";

type SubscribeType = "post_c" | "note_c";
// 句子里先说文章、再说手记（Core 给的顺序不固定）
const order: SubscribeType[] = ["post_c", "note_c"];

// 邮件订阅：直接提交到 Core（POST /subscribe）。有新内容时 Core 发邮件，邮件里带退订链接（指向 Core，不需要前端页面）。
// 注意 Core 不验证邮箱归属，同一邮箱重复订阅只会更新订阅类型。
// 外观（2026-11-02 重做，原来的渐变图标、胶囊和整行大按钮太像模板）：一句文楷写的话，“文章”“手记”就嵌在句子里，点一下取消、再点选回；
// 下面一条信纸横线写邮箱，横线末端是寄出的箭头；最后一行小字 RSS。
export default function SubscribeForm({ apiUrl, types, emailRef }: { apiUrl: string; types: SubscribeType[]; emailRef?: Ref<HTMLInputElement> }) {
  const t = useT().subscribe;
  const locale = useLocale();
  const [status, setStatus] = useState<{ type: "idle" | "sending" } | { type: "done" | "error"; message: string }>({ type: "idle" });
  const [before, after] = t.letter.split("{types}");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const chosen = data.getAll("types").map(String);
    if (!chosen.length) return setStatus({ type: "error", message: t.needOne });
    setStatus({ type: "sending" });
    try {
      const response = await fetch(`${apiUrl}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(data.get("email") ?? "").trim(), types: chosen }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: unknown } | null;
        return setStatus({ type: "error", message: locale === "zh" && typeof body?.message === "string" ? body.message : t.failed(response.status) });
      }
      form.reset();
      setStatus({ type: "done", message: t.done });
    } catch {
      setStatus({ type: "error", message: t.network });
    }
  }

  return (
    <form className="subscribe-form" onSubmit={submit} aria-label={t.formLabel}>
      <p className="subscribe-letter" role="group" aria-label={t.legend}>
        {before}
        {order.filter((type) => types.includes(type)).map((type, index) => (
          <Fragment key={type}>
            {index > 0 && t.and}
            <label className="subscribe-word">
              <input type="checkbox" name="types" value={type} defaultChecked />
              {t.types[type]}
            </label>
          </Fragment>
        ))}
        {after}
      </p>
      <div className="subscribe-line">
        <input ref={emailRef} className="subscribe-email" aria-label={t.email} name="email" type="email" required maxLength={50} placeholder={t.emailPlaceholder} autoComplete="email" />
        <button className="subscribe-send" type="submit" disabled={status.type === "sending"} aria-label={status.type === "sending" ? t.sending : t.submit} title={t.submit}>
          <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {status.type === "done" || status.type === "error" ? (
        <p className={`subscribe-status is-${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.message}</p>
      ) : (
        <p className="subscribe-rss">{t.rssBefore}<a href="/feed.xml">RSS</a>{t.rssAfter}</p>
      )}
    </form>
  );
}
