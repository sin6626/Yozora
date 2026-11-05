"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useIsland } from "../lib/island-store";
import { refreshAfterWrite } from "./cache-actions";
import { LogIn } from "lucide-react";
import { openLoginDialog } from "./account-menu";
import { rich } from "../lib/i18n/rich";
import { useLocale, useT } from "./locale-provider";
import type { Messages } from "../lib/i18n/messages/zh";
import { signOut, useLoginError, useReaderSession, type LoginProvider } from "./reader-session";

export type CommentRefType = "Post" | "Note" | "Page" | "Recently";

// allowGuest：后台是否允许游客评论；providers：后台启用了哪些读者登录（GitHub / Google）。
// variant="chat"：文章侧栏评论悬浮窗里的紧凑输入框（标签只给读屏、一行身份信息、发送结果由页头夜航岛播报），
// 回复对象由悬浮窗管理，发出或取消后调用 onDone。
type Props = { apiUrl: string; allowGuest: boolean; providers: LoginProvider[]; variant?: "chat"; onDone?: () => void } & ({ refId: string; refType: CommentRefType; replyTo?: never } | { replyTo: { id: string; author: string }; refId?: never; refType?: never });

// Core 的报错格式是 { message: string | string[] }，表单校验错误是数组；Core 的说明是中文，只在中文页面直接显示。
async function readError(response: Response, chinese: boolean, t: Messages["commentForm"]) {
  if (!chinese) return t.failed(response.status);
  const body = await response.json().catch(() => null) as { message?: unknown } | null;
  const message = Array.isArray(body?.message) ? body.message.join("；") : body?.message;
  return typeof message === "string" && message ? message : t.failed(response.status);
}

// 评论直接从浏览器提交到 Core：Core 按访客 IP 做垃圾过滤、归属地和频率限制，经 Next 转发会全变成服务器 IP。
// 游客填昵称、邮箱、网址（交给浏览器自动填充，不在本地另存）；GitHub 登录后的读者走读者接口，身份取自 Core 的登录 Cookie。
export default function CommentForm({ apiUrl, allowGuest, providers, refId, refType, replyTo, variant, onDone }: Props) {
  const chat = variant === "chat";
  const t = useT().commentForm;
  const chinese = useLocale() === "zh";
  const push = useIsland((state) => state.push);
  const id = useId();
  const router = useRouter();
  const session = useReaderSession(apiUrl);
  const loginError = useLoginError("comments");
  const reader = session.status === "reader" ? session.reader : null;
  const [open, setOpen] = useState(!replyTo || chat);
  const [status, setStatus] = useState<{ type: "idle" | "sending" } | { type: "done" | "error"; message: string }>({ type: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const body = {
      ...(reader ? {} : { author: text("author"), mail: text("mail"), ...(text("url") ? { url: text("url") } : {}) }),
      text: text("text"),
      isWhispers: data.get("whisper") === "on",
    };
    const role = reader ? "reader" : "guest";
    const path = replyTo ? `/comments/${role}/reply/${replyTo.id}` : `/comments/${role}/${refId}?ref=${refType}`;
    setStatus({ type: "sending" });
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // 读者评论要带上 Core 的登录 Cookie；游客不带，避免站长在同一浏览器登录后台时被当成站长发言。
        credentials: reader ? "include" : "omit",
      });
      if (!response.ok) return setStatus({ type: "error", message: await readError(response, chinese, t) });
      form.reset();
      if (chat) {
        push({ icon: "comment", title: body.isWhispers ? t.whisperSent : t.sent, detail: body.isWhispers ? t.whisperDetail : t.sentDetail, duration: 3200 });
        setStatus({ type: "idle" });
      } else setStatus({
        type: "done",
        message: body.isWhispers ? t.whisperDone : t.done,
      });
      // 列表有缓存，发完让评论与思考列表的缓存立即失效并刷新，否则看起来像没发出去（再点会被 Core 的 20 秒防重拦成 409）。
      await refreshAfterWrite(["comments", "recently"]);
      router.refresh();
      onDone?.();
    } catch {
      setStatus({ type: "error", message: t.network });
    }
  }

  // 打开全站共用的登录弹窗（account-menu.tsx）：文末评论区登录后回到评论区，悬浮窗里登录回到原来读到的位置
  const login = () => openLoginDialog(chat ? undefined : "comments");

  if (replyTo && !open) {
    return <button className="btn btn-ghost btn-sm comment-reply-button" type="button" onClick={() => setOpen(true)}>{t.reply}</button>;
  }
  // 不允许游客评论时，未登录的访客只能先登录。
  if (!reader && !allowGuest) {
    if (session.status === "loading" || !providers.length) return null;
    return (
      <div className="comment-identity">
        <button className="btn" type="button" onClick={login}><LogIn size={16} strokeWidth={1.75} aria-hidden="true" />{t.loginToComment}</button>
        {status.type === "error" && <p className="post-meta" role="alert">{status.message}</p>}
        {!replyTo && loginError && <p className="post-meta" role="alert">{loginError}</p>}
      </div>
    );
  }
  return (
    <form className="comment-form" data-variant={variant} onSubmit={submit} aria-label={replyTo ? t.replyTo(replyTo.author) : t.label}>
      {reader ? (
        <div className="comment-identity">
          {/* eslint-disable-next-line @next/next/no-img-element -- GitHub / Google 头像，不走 next/image 白名单 */}
          {reader.image && <img className="comment-avatar" src={reader.image} alt="" width={28} height={28} />}
          <span>{rich(t.asName, { name: <strong>{reader.name}</strong> })}</span>
          {!replyTo && <button className="btn btn-ghost btn-sm" type="button" onClick={() => void signOut(apiUrl)}>{t.logout}</button>}
        </div>
      ) : !replyTo && providers.length > 0 && session.status === "guest" && (
        <div className="comment-identity">
          <button className="btn" type="button" onClick={login}><LogIn size={16} strokeWidth={1.75} aria-hidden="true" />{t.login}</button>
          <span className="post-meta">{t.orGuest}</span>
        </div>
      )}
      {!replyTo && loginError && <p className="post-meta" role="alert">{loginError}</p>}
      {!reader && <div className="comment-fields">
        <label htmlFor={`${id}-author`}>{t.nickname}</label>
        <input className="field" id={`${id}-author`} name="author" required maxLength={20} autoComplete="nickname" placeholder={chat ? t.nickname : undefined} />
        <label htmlFor={`${id}-mail`}>{t.mail}</label>
        <input className="field" id={`${id}-mail`} name="mail" type="email" required maxLength={50} autoComplete="email" placeholder={chat ? t.mailShort : t.mailPlaceholder} title={chat ? t.mailTitle : undefined} />
        <label htmlFor={`${id}-url`}>{t.url}</label>
        <input className="field" id={`${id}-url`} name="url" type="url" maxLength={50} autoComplete="url" placeholder={chat ? t.urlShort : "https://"} />
      </div>}
      <label htmlFor={`${id}-text`}>{replyTo ? t.replyTo(`@${replyTo.author}`) : t.text}</label>
      <textarea className="field" id={`${id}-text`} name="text" required maxLength={500} rows={chat ? 2 : replyTo ? 3 : 4} placeholder={chat ? t.chatPlaceholder : t.placeholder} />
      <div className="comment-actions">
        <label><input type="checkbox" name="whisper" /> {t.whisper}</label>
        {replyTo && !chat && <button className="btn btn-ghost" type="button" onClick={() => { setOpen(false); setStatus({ type: "idle" }); }}>{t.cancel}</button>}
        <button className={chat ? "btn btn-primary btn-sm" : "btn btn-primary"} type="submit" disabled={status.type === "sending"}>{status.type === "sending" ? t.sending : t.send}</button>
      </div>
      {(status.type === "done" || status.type === "error") && (
        <p className="post-meta" role={status.type === "error" ? "alert" : "status"}>{status.message}</p>
      )}
    </form>
  );
}
