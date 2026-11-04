import Link from "./locale-provider";
import { notFound, unstable_rethrow } from "next/navigation";
import { getMatchedNotes, getNotes, getTopics } from "../lib/blog-data";
import { readText } from "../lib/search-params";
import { ActiveFilter, Pagination, listHref } from "./list-filters";
import Entry, { EntryTag } from "./entry";
import SidebarSearch from "./sidebar-search";
import Reveal from "./reveal";
import "./details-sidebar.css";
import "./corners.css";
import { getLocale, getT } from "../lib/i18n/server";
import LoadError from "./load-error";

type NoteEntryData = Awaited<ReturnType<typeof getNotes>>["data"][number];

// 心里话的角落：日记的样子。左边是大号的日，右边是衬线标题、话题/心情/天气和正文开头。首页预览复用。
// 话题标签在标题右边，心情、天气在下一行。
export async function NoteEntry({ note, headingLevel = 2 }: { note: NoteEntryData; headingLevel?: 2 | 3 }) {
  const { list } = await getT();
  return (
    <Entry
      href={`/notes/${note.nid}`}
      title={note.title}
      created={note.created}
      headingLevel={headingLevel}
      lang={note.original ? "zh-CN" : undefined}
      serif
      excerpt={note.excerpt}
      stats={note.stats}
      featured={note.bookmark ? list.memory : undefined}
      tags={note.topic ? <EntryTag>{note.topic}</EntryTag> : undefined}
      meta={note.mood || note.weather ? <>
        {note.mood && <span>{list.mood(note.mood)}</span>}
        {note.weather && <span>{list.weather(note.weather)}</span>}
      </> : undefined}
    />
  );
}

// 手记列表的筛选：全部、话题（?topic=）、搜索（?q=），同一时间只生效一个。话题像文章的分类一样排成一行（全部手记 / 各话题），
// 搜索在上方显示一枚可以 × 掉的标记；结果和普通列表同一种条目、同样分页。
type NoteFilter = { kind: "all" } | { kind: "topic"; slug: string } | { kind: "search"; keyword: string };

export default async function NoteList({ searchParams }: { searchParams: Promise<{ page?: string | string[]; q?: string | string[]; topic?: string | string[] }> }) {
  const [{ page: rawPage = "1", q, topic }, { notes: t, list }, locale] = await Promise.all([searchParams, getT(), getLocale()]);
  if (typeof rawPage !== "string" || !/^[1-9]\d*$/.test(rawPage)) notFound();
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page)) notFound();
  const filter: NoteFilter = readText(q) ? { kind: "search", keyword: readText(q) }
    : readText(topic, 100) ? { kind: "topic", slug: readText(topic, 100) }
    : { kind: "all" };
  const pageHref = (number: number) => listHref("/notes", filter.kind === "topic" ? { topic: filter.slug } : filter.kind === "search" ? { q: filter.keyword } : {}, number);

  // 话题读不到时只少了话题那一行，列表照常；正在按话题筛时才算读取失败
  const topics = await getTopics(locale).catch((error) => {
    unstable_rethrow(error);
    return null;
  });
  let result: Awaited<ReturnType<typeof getNotes>>;
  try {
    if (filter.kind === "topic") {
      if (!topics) throw new Error("话题读取失败");
      const slug = filter.slug;
      const current = topics.find((item) => item.slug === slug);
      if (!current) notFound();
      result = await getMatchedNotes({ topicId: current.id }, page, locale);
    } else {
      result = filter.kind === "search" ? await getMatchedNotes({ keyword: filter.keyword }, page, locale) : await getNotes(page, locale);
    }
    if (page > Math.max(1, result.pagination.totalPage)) notFound();
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.title} href={pageHref(page)} />;
  }
  const { data: notes, pagination } = result;
  const empty = { all: t.empty, topic: t.topicEmpty, search: t.searchEmpty }[filter.kind];

  return (
    <>
      <header className="page-heading list-heading">
        <div>
          <h1>{t.title}</h1>
          <p className="post-meta">{t.count(pagination.total)}</p>
        </div>
      </header>
      <div className="post-list-content">
        {/* 筛选栏：宽屏（≥ 90rem）悬浮在列表右边，窄屏在列表上方（details-sidebar.css 的 .list-aside） */}
        <aside className="list-filters list-aside" aria-label={list.filters}>
          <SidebarSearch action="/notes" label={t.search} defaultValue={filter.kind === "search" ? filter.keyword : ""} />
          {filter.kind === "search" && <ActiveFilter label={list.searchQuery(filter.keyword)} clearHref="/notes" />}
          {topics && topics.length > 0 && (
            <section className="list-aside-section" aria-label={t.topics}>
              <h2>{t.topics}</h2>
              <nav className="post-categories" aria-label={t.topics}>
                <Link href="/notes" aria-current={filter.kind === "all" ? "page" : undefined}>{t.all}</Link>
                {topics.map((item) => (
                  <Link key={item.id} href={`/notes?topic=${encodeURIComponent(item.slug)}`} aria-current={filter.kind === "topic" && item.slug === filter.slug ? "page" : undefined}>
                    {/* 话题在后台设的图片放在名字前面（和导航“手记”面板一样）；没设图片的留一个同样大的空位，名字对齐 */}
                    <span className="list-topic">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 后台任意地址的小图标，不走 Next 图片优化 */}
                      {item.icon ? <img className="list-topic-icon" src={item.icon} alt="" width={18} height={18} /> : <span className="list-topic-icon" aria-hidden="true" />}
                      {item.name}
                    </span>
                    <span className="tag-count">{item.count}</span>
                  </Link>
                ))}
              </nav>
            </section>
          )}
        </aside>
        {notes.length ? (
          <ul className="note-list">
            {notes.map((note, index) => (
              <Reveal as="li" key={note.id} index={index}><NoteEntry note={note} /></Reveal>
            ))}
          </ul>
        ) : <p className="post-empty">{empty}</p>}
        <Pagination label={t.title} page={page} totalPage={pagination.totalPage} href={pageHref} />
      </div>
    </>
  );
}
