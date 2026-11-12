"use client";

import { Send } from "lucide-react";
import { useId, useState, type FormEvent, type InputHTMLAttributes } from "react";
import FriendCard from "./friend-card";
import { useLocale, useT } from "./locale-provider";

// 友链申请：直接提交到 Core（POST /links/audit），新申请一律是“待审核”，审核结果由 Core 发邮件通知。
// 字段与长度限制照 Core 的校验：名字和站点名 20 字、描述 50 字、网址必须 https。
// 上面是对方的名片预览：站名、介绍边打边变；头像地址在离开输入框时才换（不每打一个字就去请求半截地址），加载不出来就提示。
export default function LinkApplyForm({ apiUrl }: { apiUrl: string }) {
  const id = useId();
  const t = useT().friends;
  const chinese = useLocale() === "zh";
  const [status, setStatus] = useState<{ type: "idle" | "sending" } | { type: "done" | "error"; message: string }>({ type: "idle" });
  const [card, setCard] = useState({ name: "", description: "" });
  const [avatar, setAvatar] = useState("");
  const [brokenAvatar, setBrokenAvatar] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const optional = (name: string) => text(name) ? { [name]: text(name) } : {};
    setStatus({ type: "sending" });
    try {
      const response = await fetch(`${apiUrl}/links/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: text("author"), name: text("name"), url: text("url"), ...optional("avatar"), ...optional("description"), ...optional("email") }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: unknown } | null;
        const message = Array.isArray(body?.message) ? body.message.join("；") : body?.message;
        return setStatus({ type: "error", message: chinese && typeof message === "string" && message ? message : t.failed(response.status) });
      }
      form.reset();
      setCard({ name: "", description: "" });
      setAvatar("");
      setStatus({ type: "done", message: t.done });
    } catch {
      setStatus({ type: "error", message: t.network });
    }
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    setCard({ name: String(data.get("name") ?? "").trim(), description: String(data.get("description") ?? "").trim() });
  }

  const field = (name: string, label: string, props: InputHTMLAttributes<HTMLInputElement> & { optional?: boolean; wide?: boolean; hint?: string; warn?: boolean }) => {
    const { optional, wide, hint, warn, ...input } = props;
    return (
      <div className={wide ? "link-apply-field is-wide" : "link-apply-field"}>
        <label htmlFor={`${id}-${name}`}>
          {label}
          {optional && <span className="link-apply-optional">{t.optional}</span>}
        </label>
        <input className="field" id={`${id}-${name}`} name={name} aria-describedby={hint ? `${id}-${name}-hint` : undefined} {...input} />
        {hint && <p className={warn ? "link-apply-hint is-warn" : "link-apply-hint"} id={`${id}-${name}-hint`} role={warn ? "status" : undefined}>{hint}</p>}
      </div>
    );
  };

  const avatarBroken = avatar !== "" && avatar === brokenAvatar;
  return (
    <form className="link-apply-side link-apply-form" onSubmit={submit} onInput={preview} aria-label={t.apply}>
      <p className="link-apply-label">{t.yourCard}</p>
      <div className="link-apply-preview" aria-hidden="true" data-empty-name={card.name ? undefined : ""} data-empty-intro={card.description ? undefined : ""}>
        <FriendCard
          name={card.name || t.previewName}
          avatar={avatarBroken ? undefined : avatar || undefined}
          description={card.description || t.previewIntro}
          descriptionLang={card.description ? "zh-CN" : undefined}
          mark={card.name ? undefined : "✦"}
          onAvatarError={() => setBrokenAvatar(avatar)}
        />
      </div>
      <div className="link-apply-fields">
        {field("name", t.siteName, { required: true, maxLength: 20, autoComplete: "off" })}
        {field("author", t.yourName, { required: true, maxLength: 20, autoComplete: "nickname" })}
        {field("url", t.siteUrl, { wide: true, type: "url", required: true, pattern: "https://.+", title: t.httpsOnly, placeholder: "https://", autoComplete: "url" })}
        {field("description", t.intro, { wide: true, optional: true, maxLength: 50, autoComplete: "off" })}
        {field("avatar", t.avatarUrl, {
          wide: true, optional: true, type: "url", maxLength: 200, placeholder: "https://", autoComplete: "off",
          hint: avatarBroken ? t.avatarBroken : undefined, warn: avatarBroken,
          onBlur: (event) => setAvatar(event.currentTarget.value.trim()),
        })}
        {field("email", t.email, { wide: true, optional: true, type: "email", maxLength: 50, placeholder: t.emailPlaceholder, autoComplete: "email" })}
      </div>
      <div className="link-apply-actions">
        {(status.type === "done" || status.type === "error") && (
          <p className={status.type === "error" ? "link-apply-status is-error" : "link-apply-status is-done"} role={status.type === "error" ? "alert" : "status"}>{status.message}</p>
        )}
        <button className="btn btn-primary" type="submit" disabled={status.type === "sending"}>
          <Send size={15} aria-hidden="true" />
          {status.type === "sending" ? t.sending : t.submit}
        </button>
      </div>
    </form>
  );
}
