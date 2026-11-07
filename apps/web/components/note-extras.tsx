import { CircleAlert, CircleCheck, Info, MessageCircle, TriangleAlert } from "lucide-react";
import Link from "./locale-provider";
import { getNotesByTopic, getTopics } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { getLocale, getT } from "../lib/i18n/server";
import { type BannerType, type NoteBanner as Banner } from "../lib/note-extras";
import "./note-extras.css";

// 手记详情的头图（后台“日记设置 → 封面图”，meta.cover）：标题上方，底部渐隐。纯装饰，读屏跳过。
export function NoteCover({ src }: { src: string }) {
  return (
    <div className="note-cover">
      {/* eslint-disable-next-line @next/next/no-img-element -- 后台图床地址，不走 next/image */}
      <img src={src} alt="" decoding="async" />
    </div>
  );
}

const bannerIcons = { info: Info, warning: TriangleAlert, error: CircleAlert, success: CircleCheck, secondary: MessageCircle } satisfies Record<BannerType, unknown>;

// 横幅（后台附加字段“横幅信息”，meta.banner）：正文前一条提示，按类型换图标和颜色。
export function NoteBanner({ banner }: { banner: Banner }) {
  const Icon = bannerIcons[banner.type];
  return (
    <p className="note-banner" data-type={banner.type} role="note">
      <Icon size={16} aria-hidden="true" />
      <span>{banner.message}</span>
    </p>
  );
}

type TopicRef = { id: string; name: string; slug: string };

// 文末话题卡片：话题图标、名字、简介、这个话题最近几篇（不含当前这篇），链到 /notes?topic=<slug>。
// 名字和简介用 getTopics（外文页面是 Core 的译文），最近几篇用 getNotesByTopic，都是导航面板已在用的缓存。
export async function NoteTopicCard({ topic: ref, noteId }: { topic: TopicRef; noteId: string }) {
  const lang = await getLocale();
  const t = await getT();
  const [topics, notes] = await Promise.all([getTopics(lang).catch(() => []), getNotesByTopic(ref.id, lang).catch(() => null)]);
  const topic = topics.find(({ id }) => id === ref.id);
  const name = topic?.name ?? ref.name;
  const href = `/notes?topic=${encodeURIComponent(ref.slug)}`;
  const recent = notes?.data.filter(({ id }) => id !== noteId).slice(0, 5) ?? [];
  return (
    <section className="note-topic-card" aria-labelledby="note-topic-name">
      <div className="note-topic-head">
        {topic?.icon
          // eslint-disable-next-line @next/next/no-img-element -- 后台话题图标
          ? <img className="note-topic-icon" src={topic.icon} alt="" />
          : <span className="note-topic-icon" aria-hidden="true">{[...name][0]}</span>}
        <div>
          <p className="note-topic-label">{t.notes.inTopic}</p>
          <Link id="note-topic-name" className="note-topic-name" href={href}>{name}</Link>
          {topic?.introduce && <p className="note-topic-intro">{topic.introduce}</p>}
        </div>
      </div>
      {recent.length > 0 && (
        <ol className="note-stars" aria-label={t.notes.topicRecent}>
          {recent.map((note) => (
            <li key={note.id}>
              <Link href={`/notes/${note.nid}`}><span className="note-stars-title">{note.title}</span><time dateTime={note.created}>{formatDate(note.created)}</time></Link>
            </li>
          ))}
        </ol>
      )}
      {notes && <Link className="note-topic-more" href={href}>{t.notes.topicAll(notes.total)} →</Link>}
    </section>
  );
}

