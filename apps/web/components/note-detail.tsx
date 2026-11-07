import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "./locale-provider";
import { notFound, unstable_rethrow } from "next/navigation";
import { getNote } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { Suspense } from "react";
import { getApiUrl } from "../lib/config";
import ArticleBody from "./article-body";
import ArticleAside from "./article-aside";
import { ArticleAiNotes, ArticleLanguages, loadArticleAi } from "./article-ai";
import ArticleStats from "./article-stats";
import Comments from "./comments";
import { ArticleNotifications, ReadCount, ReadingCount } from "./notifications";
import IslandReading from "./island-reading";
import NoteUnlock from "./note-unlock";
import { getLocale, getT } from "../lib/i18n/server";
import "./post-detail.css";
import LoadError from "./load-error";
import { NoteBanner, NoteCover, NoteTimeline, NoteTopicCard } from "./note-extras";

export default async function NoteDetail({ params }: { params: Promise<{ nid: string }> }) {
  const { nid: rawNid } = await params;
  const t = await getT();
  if (!/^[1-9]\d*$/.test(rawNid) || !Number.isSafeInteger(Number(rawNid))) notFound();
  const href = `/notes/${rawNid}`;
  let note: Awaited<ReturnType<typeof getNote>>;
  try {
    note = await getNote(Number(rawNid), await getLocale());
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.notes.title} href={href} />;
  }
  if (!note) notFound();
  // Core 对加密手记返回 403，标题也拿不到；输入密码后由服务端函数带密码读取正文。
  if (note.locked) {
    return (
      <article className="post-detail">
        <header className="page-heading">
          <Link href="/notes">{t.notes.backToList}</Link>
          <h1 className="post-detail-title">{t.notes.locked}</h1>
        </header>
        <div className="post-list-content">
          <NoteUnlock nid={Number(rawNid)} />
        </div>
      </article>
    );
  }

  const ai = await loadArticleAi(note.id);
  const body = ai.translation ?? note;
  return (
    <article className="post-detail note-detail">
      <ArticleNotifications id={note.id} kind="note" />
      <IslandReading title={body.title} kind="note" date={formatDate(note.created)} />
      {note.cover && <NoteCover src={note.cover} />}
      <header className="page-heading">
        <nav className="detail-crumb" aria-label={t.list.crumb}>
          <Link href="/notes">{t.notes.title}</Link>
          {note.topic && <><span aria-hidden="true">/</span><Link href={`/notes?topic=${encodeURIComponent(note.topic.slug)}`}>{note.topic.name}</Link></>}
        </nav>
        <h1 className="post-detail-title" lang={ai.original}>{body.title}</h1>
        <div className="post-meta detail-meta">
          <time dateTime={note.created}>{formatDate(note.created)}</time>
          {note.mood && <span>{t.list.mood(note.mood)}</span>}
          {note.weather && <span>{t.list.weather(note.weather)}</span>}
          <ReadCount id={note.id} count={note.count.read} />
          <ReadingCount apiUrl={getApiUrl()} id={note.id} />
          <ArticleLanguages href={href} ai={ai} />
        </div>
      </header>
      <div className="post-list-content">
        {note.banner && <NoteBanner banner={note.banner} lang={(await getLocale()) === "zh" ? undefined : "zh-CN"} />}
        <ArticleAiNotes ai={ai} />
        <div lang={ai.original}><ArticleBody text={body.text} contentFormat={body.contentFormat} content={body.content} emptyText={t.notes.noBody} variant="note" /></div>
        <div className="article-end"><ArticleStats apiUrl={getApiUrl()} id={note.id} type="note" like={note.count.like} /></div>
        {note.topic && <Suspense><NoteTopicCard topic={note.topic} noteId={note.id} /></Suspense>}
        {(note.newer || note.older) && (
          <nav className="neighbor-nav" aria-label={t.notes.neighbors}>
            {note.newer ? <Link href={`/notes/${note.newer.nid}`}><span className="neighbor-label"><ArrowLeft size={14} aria-hidden="true" />{t.list.newer}</span><span className="neighbor-title">{note.newer.title}</span></Link> : <span />}
            {note.older ? <Link className="is-older" href={`/notes/${note.older.nid}`}><span className="neighbor-label">{t.list.older}<ArrowRight size={14} aria-hidden="true" /></span><span className="neighbor-title">{note.older.title}</span></Link> : <span />}
          </nav>
        )}
        <Suspense fallback={<p className="post-meta" role="status">{t.list.loadingComments}</p>}>
          <Comments refId={note.id} refType="Note" allowComment={note.allowComment} />
        </Suspense>
      </div>
      {/* 左侧时间线：宽屏挂在正文左边的留白里，窄屏不显示 */}
      <Suspense><NoteTimeline noteId={note.id} /></Suspense>
      {/* 右侧悬浮栏：目录 + 操作（喜欢、分享、订阅、回到顶部），宽屏悬浮在正文右侧留白里，窄屏隐藏 */}
      <ArticleAside title={body.title} like={{ id: note.id, type: "note", count: note.count.like }} comments={{ refId: note.id, refType: "Note", allowComment: note.allowComment }} />
    </article>
  );
}
