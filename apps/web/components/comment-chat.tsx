import { unstable_rethrow } from "next/navigation";
import { formatDate, formatTime } from "../lib/date";
import { safeUrl } from "../lib/safe-url";
import CommentChatPanel from "./comment-chat-panel";
import type { CommentRefType } from "./comment-form";
import CommentMarkdown from "./comment-markdown";
import { loadComments, zoomLabel, type Thread } from "./comments";
import ImageLightbox from "./image-lightbox";
import { getT } from "../lib/i18n/server";
import "./comment-chat.css";

type Item = Omit<Thread, "replies">;
export type ChatMessage = Item & { quote?: { author: string; text: string } };

// 回复不再缩进成楼中楼：按时间排成一条消息流，回复在气泡顶部引用被回复的那句话（像聊天软件那样）
export function toMessages(threads: Thread[], deletedText = "该评论已删除"): ChatMessage[] {
  // 引用的原话去掉 Markdown 记号：图片换成 🖼️、链接只留文字
  const plain = (text: string) => text.replace(/!\[[^\]]*\]\([^)]*\)/g, "🖼️").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_>#~[\]()!|-]/g, "");
  const snippet = (item: Item) => (item.deleted ? deletedText : plain(item.text).replace(/\s+/g, " ").trim().slice(0, 60));
  return threads
    .flatMap((thread) => {
      const byId = new Map<string, Item>([thread, ...thread.replies].map((item) => [item.id, item]));
      return [thread, ...thread.replies.map((reply) => {
        const parent = byId.get(reply.parentId ?? "") ?? thread;
        return { ...reply, quote: { author: parent.author, text: snippet(parent) } };
      })];
    })
    .sort((a, b) => a.created.localeCompare(b.created));
}

// 服务端渲染消息流（Markdown 不进浏览器包），交给客户端的悬浮窗外壳；“回复”按钮靠 data-reply-* 让外壳接手
export async function ChatStream({ messages, canReply }: { messages: ChatMessage[]; canReply: boolean }) {
  const i18n = await getT();
  const { chat: t, comments, list } = i18n;
  if (!messages.length) {
    return (
      <div className="chat-empty">
        <span className="chat-empty-stars" aria-hidden="true" />
        <p>{t.silent}</p>
        <p className="chat-empty-hint">{t.silentHint}</p>
      </div>
    );
  }
  // 图片点了全屏放大；放大层在悬浮窗外面，点它不会关掉悬浮窗（Base UI 把它算作悬浮窗里打开的子浮层）
  return (
    <ImageLightbox itemSelector=".comment-zoom" groupSelector=".chat-text">
      <ol className="chat-stream" aria-label={t.stream}>
        {messages.flatMap((message, index) => {
          const date = formatDate(message.created);
          const separator = index === 0 || formatDate(messages[index - 1].created) !== date ? [<li key={`day-${date}`} className="chat-day"><span>{date}</span></li>] : [];
          const avatar = safeUrl(message.avatar);
          const site = safeUrl(message.url);
          return [...separator, (
            <li key={message.id} className="chat-message" data-id={message.id} data-owner={message.owner ? "" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 头像来自 Gravatar 或第三方登录，不走 next/image 白名单 */}
              {avatar ? <img className="chat-avatar" src={avatar} alt="" width={30} height={30} loading="lazy" /> : <span className="chat-avatar" aria-hidden="true" />}
              <div className="chat-body">
                <p className="chat-meta">
                  <strong>{site ? <a href={site} target="_blank" rel="noopener noreferrer nofollow ugc">{message.author}</a> : message.author}</strong>
                  {message.owner && <span className="chat-badge">{comments.owner}</span>}
                  {message.pinned && <span className="chat-badge">{list.pinned}</span>}
                  <time dateTime={message.created} title={message.location ? comments.from(message.location) : undefined}>{formatTime(message.created)}</time>
                </p>
                <div className="chat-bubble">
                  {message.quote && (
                    <p className="chat-quote" lang="zh-CN"><span>@{message.quote.author}</span>{message.quote.text}</p>
                  )}
                  {message.deleted ? (
                    <p className="chat-deleted">{comments.deleted}</p>
                  ) : (
                    <div className="chat-text" lang="zh-CN"><CommentMarkdown text={message.text} zoom={zoomLabel(i18n)} /></div>
                  )}
                </div>
                {canReply && !message.deleted && (
                  <button type="button" className="chat-reply" data-reply-id={message.id} data-reply-author={message.author}>{t.reply}</button>
                )}
              </div>
            </li>
          )];
        })}
      </ol>
    </ImageLightbox>
  );
}

// 文章侧栏的评论入口：按钮 + 悬浮窗，读到一半也能边看边聊，不用离开读到的位置
export default async function CommentChat({ refId, refType, allowComment, title }: { refId: string; refType: CommentRefType; allowComment: boolean; title: string }) {
  let loaded: Awaited<ReturnType<typeof loadComments>>;
  try {
    loaded = await loadComments(refId, allowComment);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
  const { data, total, form, closedReason } = loaded;
  const t = await getT();
  return (
    <CommentChatPanel title={title} total={total} form={form} closedReason={closedReason} target={{ refId, refType }}>
      <ChatStream messages={toMessages(data, t.comments.deletedSnippet)} canReply={!closedReason} />
    </CommentChatPanel>
  );
}
