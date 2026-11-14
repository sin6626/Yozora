import { ArrowRight } from "lucide-react";
import Link from "./locale-provider";
import { unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { getHomeFeed, getMurmurs, getNotes, getPosts } from "../lib/blog-data";
import { murmurImageSources } from "../lib/murmur";
import { formatDate } from "../lib/date";
import { getLocale, getT } from "../lib/i18n/server";
import { excerpt } from "../lib/excerpt";
import { postHref } from "./post-list";
import RecentActivityList, { RecentActivityItems } from "./recent-activity";
import Reveal from "./reveal";
import TechStack from "./tech-stack";
import "./corners.css";

// 各块分别读取，一块失败不影响其他块。
async function load<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

// allLabel：“全部”按当前语言（由 HomeLatest 读好传进来）
function Heading({ title, note, allHref, allLabel }: { title: string; note: string; allHref?: string; allLabel?: string }) {
  return (
    <Reveal className="home-section-heading">
      <h2>{title}</h2>
      <p>{note}</p>
      {allHref && <Link className="home-section-more" href={allHref}>{allLabel}<ArrowRight size={14} aria-hidden="true" /></Link>}
    </Reveal>
  );
}

function Section<T>({ title, note, allHref, allLabel, failed, items, empty, className, children }: {
  title: string;
  allLabel: string;
  failed: string;
  note: string;
  allHref: string;
  items: T[] | null;
  empty: string;
  className?: string;
  children: (items: T[]) => ReactNode;
}) {
  return (
    <section className={className ? `home-section ${className}` : "home-section"} aria-label={title}>
      <Heading title={title} note={note} allHref={allHref} allLabel={allLabel} />
      {items === null ? (
        <p className="post-empty" role="alert">{failed}</p>
      ) : items.length ? children(items) : <p className="post-empty">{empty}</p>}
    </section>
  );
}

// 竖向时间线的一条：前面一颗小星，标题在左，附加信息和日期靠右；整条可点。
// index：在列表里的序号，滚进视野时一条比一条晚一点出现（reveal-on-view.tsx）
function TimelineItem({ href, created, title, meta, serif, pinned, original, index }: {
  index: number;
  href: string | null;
  created: string;
  title: string;
  meta?: ReactNode;
  serif?: boolean;
  pinned?: boolean;
  original?: boolean;
}) {
  return (
    <Reveal as="li" index={index} className={pinned ? "home-timeline-item is-pinned" : "home-timeline-item"}>
      <span className="home-timeline-node" aria-hidden="true" />
      <span className={serif ? "home-timeline-title is-serif" : "home-timeline-title"} lang={original ? "zh-CN" : undefined}>
        {href ? <Link className="card-link" href={href}>{title}</Link> : title}
      </span>
      <span className="home-timeline-meta">
        {meta}
        <time dateTime={created}>{formatDate(created)}</time>
      </span>
    </Reveal>
  );
}

type Posts = Awaited<ReturnType<typeof getPosts>>["data"];
type Notes = Awaited<ReturnType<typeof getNotes>>["data"];
type Murmurs = Awaited<ReturnType<typeof getMurmurs>>["data"];

// 首屏下面（2026-11-14 站长：首屏好了下面也该好了，不然一往下滑还在读）：数据平时来自 Next 缓存的 getHomeFeed，
// 这里不包 Suspense，和首屏一起渲染、一起进页面骨架。缓存读不到时才退回各块现取，那时包 Suspense、只留一块空白（不放小火箭）。
export default async function HomeLatest() {
  const feed = await load(async () => getHomeFeed(await getLocale()));
  if (feed) return <HomeColumns posts={feed.posts} notes={feed.notes} murmurs={feed.murmurs} activity={<RecentActivityItems items={feed.activity} />} />;
  const { common } = await getT();
  return (
    <Suspense fallback={<div className="home-room-pending" role="status"><span className="sr-only">{common.loading}</span></div>}>
      <HomeLatestLive />
    </Suspense>
  );
}

// 退回现取：各块分别读，一块失败不影响其他块
async function HomeLatestLive() {
  const locale = await getLocale();
  const [posts, notes, murmurs] = await Promise.all([
    load(async () => (await getPosts(1, undefined, locale)).data.slice(0, 5)),
    load(async () => (await getNotes(1, locale)).data.slice(0, 5)),
    load(async () => (await getMurmurs(1)).data.slice(0, 6)),
  ]);
  const t = (await getT()).home;
  return (
    <HomeColumns posts={posts} notes={notes} murmurs={murmurs} activity={(
      <Suspense fallback={<p className="post-empty" role="status">{t.loading}</p>}>
        <RecentActivityList />
      </Suspense>
    )} />
  );
}

// 左栏上下放文章和手记；右栏按 2:3 上下分成碎碎念和“最近发生的事”；两栏下面是技术栈滚动条。
async function HomeColumns({ posts, notes, murmurs, activity }: { posts: Posts | null; notes: Notes | null; murmurs: Murmurs | null; activity: ReactNode }) {
  const t = (await getT()).home;
  const section = (copy: { title: string; note: string; empty: string }) => ({ ...copy, allLabel: t.all, failed: t.loadFailed(copy.title) });
  return (
    <div className="home-columns">
      <div className="home-main">
        <Section {...section(t.posts)} allHref="/posts" items={posts}>
          {(items) => (
            <ol className="home-timeline">
              {items.map((post, index) => (
                <TimelineItem
                  key={post.id}
                  index={index}
                  href={postHref(post)}
                  created={post.created}
                  title={post.title}
                  original={post.original}
                  pinned={post.pinned}
                  meta={<>{post.pinned && <span className="badge">{t.pinned}</span>}{post.category && <span>{post.category.name}</span>}</>}
                />
              ))}
            </ol>
          )}
        </Section>
        <Section {...section(t.notes)} allHref="/notes" items={notes}>
          {(items) => (
            <ol className="home-timeline">
              {items.map((note, index) => (
                <TimelineItem
                  key={note.id}
                  index={index}
                  href={`/notes/${note.nid}`}
                  created={note.created}
                  title={note.title}
                  original={note.original}
                  serif
                  meta={<span>{[note.mood, note.weather].filter(Boolean).join(" · ") || note.topic}</span>}
                />
              ))}
            </ol>
          )}
        </Section>
      </div>
      <aside className="home-side">
        <Section {...section(t.murmurs)} allHref="/murmurs" items={murmurs} className="home-side-murmurs">
          {(items) => (
            <ul className="home-murmurs">
              {items.map((item, index) => {
                const images = murmurImageSources(item.content);
                const text = excerpt(item.content, 140);
                return (
                  <Reveal as="li" key={item.id} index={index}>
                    <time dateTime={item.created}>{formatDate(item.created)}</time>
                    {text && <p lang="zh-CN">{text}</p>}
                    {images.length > 0 && (
                      <div className="home-murmur-thumbs" aria-label={t.images(images.length)}>
                        {images.slice(0, 3).map((src) => (
                          // eslint-disable-next-line @next/next/no-img-element -- 图床上的缩略预览
                          <img key={src} src={src} alt="" loading="lazy" />
                        ))}
                        {images.length > 3 && <span>+{images.length - 3}</span>}
                      </div>
                    )}
                  </Reveal>
                );
              })}
            </ul>
          )}
        </Section>
        <section className="home-section home-side-activity" aria-label={t.activity.title}>
          <Heading title={t.activity.title} note={t.activity.note} />
          {activity}
        </section>
      </aside>
      <TechStack />
    </div>
  );
}
