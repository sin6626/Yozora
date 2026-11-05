import { Feather, FileText, Heart, Lightbulb, MessageSquare, type LucideIcon } from "lucide-react";
import Link from "./locale-provider";
import Reveal from "./reveal";
import { unstable_rethrow } from "next/navigation";
import { getRecentActivity, type RecentActivity } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import type { Messages } from "../lib/i18n/messages";
import { rich } from "../lib/i18n/rich";
import { getLocale, getT } from "../lib/i18n/server";

// 首页右栏“最近发生的事”（同 Shiro 的 ActivityRecent）：一条竖线串起来的时间线，
// 每条前面一个小圆图标，评论和思考的正文放在气泡里。
const icons: Record<RecentActivity["kind"], LucideIcon> = {
  comment: MessageSquare,
  like: Heart,
  post: FileText,
  note: Feather,
  recent: Lightbulb,
};

function Title({ item, t }: { item: RecentActivity; t: Messages["activity"] }) {
  const title = <b>{item.title ?? (item.onThinking ? t.aThinking : t.deleted)}</b>;
  return item.href ? <Link className="activity-link" href={item.href}>{title}</Link> : title;
}

// 句子里的普通文字淡色显示
const small = (text: string) => <small>{text}</small>;

function Body({ item, t }: { item: RecentActivity; t: Messages["activity"] }) {
  switch (item.kind) {
    case "comment":
      return (
        <>
          <p className="activity-line">
            {item.avatar && (
              // eslint-disable-next-line @next/next/no-img-element -- 评论者头像来自 Gravatar 或第三方登录
              <img className="activity-avatar" src={item.avatar} alt="" width={18} height={18} loading="lazy" />
            )}
            {rich(t.commented, {
              author: <span className="activity-author">{item.author}</span>,
              target: item.title || item.onThinking ? <Title item={item} t={t} /> : <small>{t.somewhere}</small>,
            }, small)}
          </p>
          {item.text && <p className="activity-bubble" lang="zh-CN">{item.text}</p>}
        </>
      );
    case "recent":
      return (
        <>
          <p className="activity-line">
            {rich(t.wroteThinking, { thinking: <Link className="activity-link" href={item.href ?? "/"}><b>{t.thinking}</b></Link> }, small)}
          </p>
          {/* 评论、思考是站长和读者自己写的话，保持中文并标明语言 */}
          {item.text && <p className="activity-bubble" lang="zh-CN">{item.text}</p>}
        </>
      );
    case "like":
      return <p className="activity-line">{rich(t.liked, { title: <Title item={item} t={t} /> }, small)}</p>;
    default:
      return <p className="activity-line">{rich(t.published, { title: <Title item={item} t={t} /> }, small)}</p>;
  }
}

export default async function RecentActivityList() {
  const t = (await getT()).activity;
  let items: RecentActivity[];
  try {
    items = await getRecentActivity(await getLocale());
  } catch (error) {
    unstable_rethrow(error);
    return <p className="post-empty" role="alert">{t.failed}</p>;
  }
  if (!items.length) return <p className="post-empty">{t.quiet}</p>;
  return (
    <ul className="activity-timeline">
      {items.map((item, index) => {
        const Icon = icons[item.kind];
        return (
        <Reveal as="li" key={item.key} index={index} className="activity-item" data-kind={item.kind}>
          <span className="activity-icon" aria-hidden="true">
            <Icon size={14} strokeWidth={1.8} />
          </span>
          <div className="activity-body">
            <Body item={item} t={t} />
            <time dateTime={item.created}>{formatDate(item.created)}</time>
          </div>
        </Reveal>
        );
      })}
    </ul>
  );
}
