import Link from "./locale-provider";
import { unstable_rethrow } from "next/navigation";
import { getTimeline } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { htmlLang } from "../lib/i18n/config";
import { getLocale, getT } from "../lib/i18n/server";
import LoadError from "./load-error";
import Reveal from "./reveal";
import type { CSSProperties } from "react";
import "./timeline.css";

type Item = Awaited<ReturnType<typeof getTimeline>>[number];

const href = (item: Item) => item.kind === "post"
  ? `/posts/${encodeURIComponent(item.category.slug)}/${encodeURIComponent(item.slug)}`
  : `/notes/${item.nid}`;

// 时间线的三个子页：全部（/timeline）、只看文章（/timeline/posts）、只看手记（/timeline/notes）
const views = [
  { kind: undefined, href: "/timeline" },
  { kind: "post", href: "/timeline/posts" },
  { kind: "note", href: "/timeline/notes" },
] as const;

// 月份：“3 月”“Mar”“3월”，写法交给 Intl；开头的数字放大，后面的字是单位
function MonthLabel({ month, locale }: { month: number; locale: string }) {
  const name = new Intl.DateTimeFormat(htmlLang(locale), { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1)));
  const [, digits, unit] = /^(\d*)(.*)$/.exec(name)!;
  return digits ? <><span className="timeline-month-number">{digits}</span>{unit && ` ${unit}`}</> : <span className="timeline-month-number">{name}</span>;
}

// 归档：按年、再按月分组列出文章与手记（kind 指定时只列一种）。年月取自 formatDate（固定东八区），与站内其他日期一致。
// 宽屏时月份在左栏、读到哪个月就贴在页头下面；每条只写“日”。一条星座竖线串起当月各条，文章是紫色小星、手记是月光色小星。
// 每个月进入视野时播一次：竖线从上往下画出，画到哪条哪颗星亮、那条浮上（timeline.css）。
export default async function TimelineList({ kind }: { kind?: Item["kind"] }) {
  const view = views.find((item) => item.kind === kind) ?? views[0];
  const [{ timeline: t, posts, notes }, locale] = await Promise.all([getT(), getLocale()]);
  const label = (item: (typeof views)[number]) => (item.kind === "post" ? posts.title : item.kind === "note" ? notes.title : t.all);
  let all: Item[];
  try {
    all = await getTimeline(locale);
  } catch (error) {
    unstable_rethrow(error);
    // 重试用整页加载（普通 <a>），确保重新请求
    return <LoadError what={t.title} href={view.href} />;
  }
  const items = kind ? all.filter((item) => item.kind === kind) : all;
  const years = new Map<string, { count: number; months: Map<string, { item: Item; day: string }[]> }>();
  for (const item of items) {
    const [year, month, day] = formatDate(item.created).split("/");
    const group = years.get(year) ?? { count: 0, months: new Map() };
    group.count++;
    group.months.set(month, [...(group.months.get(month) ?? []), { item, day }]);
    years.set(year, group);
  }
  // 每个月前面一共有几条：月份按这个顺序接着画，整页从上往下一条线扫下来（Reveal 的 index）
  let before = 0;
  const offsets = new Map<string, number>();
  for (const [year, { months }] of years) for (const [month, entries] of months) {
    offsets.set(`${year}-${month}`, before);
    before += entries.length;
  }
  const postCount = all.filter((item) => item.kind === "post").length;
  const counts = { post: postCount, note: all.length - postCount };

  return (
    <>
      <header className="page-heading">
        <h1>{t.title}</h1>
        <p className="post-meta">{kind ? t.countOf(counts[kind], label(view)) : t.countAll(postCount, counts.note)}</p>
      </header>
      <div className="post-list-content">
        <div className="list-filters">
          <nav className="post-categories" aria-label={t.views}>
            {views.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.href === view.href ? "page" : undefined}>{label(item)}</Link>
            ))}
          </nav>
        </div>
        {years.size ? [...years].map(([year, { count, months }]) => (
          <section key={year} className="timeline-year" aria-labelledby={`timeline-${year}`}>
            <h2 id={`timeline-${year}`}>{year} <span className="timeline-count">{t.items(count)}</span></h2>
            {[...months].map(([month, entries]) => (
              <Reveal as="section" kind="timeline" key={month} index={offsets.get(`${year}-${month}`)} data-reveal-weight={String(entries.length)} className="timeline-month" aria-labelledby={`timeline-${year}-${month}`}>
                <h3 id={`timeline-${year}-${month}`} className="timeline-month-label">
                  <MonthLabel month={Number(month)} locale={locale} />
                  <span className="timeline-count">{t.items(entries.length)}</span>
                </h3>
                <ol className="timeline-list" style={{ "--count": entries.length } as CSSProperties}>
                  {entries.map(({ item, day }, index) => (
                    <li key={`${item.kind}-${item.id}`} className="timeline-item" data-kind={item.kind} style={{ "--i": index } as CSSProperties}>
                      <span className="timeline-node" aria-hidden="true" />
                      <time dateTime={item.created}>{t.day(day)}</time>
                      <Link className="card-link" href={href(item)}>{item.title}</Link>
                      <span className="post-meta">{item.kind === "post" ? item.category.name : t.note}</span>
                    </li>
                  ))}
                </ol>
              </Reveal>
            ))}
          </section>
        )) : <p className="post-empty">{t.empty}</p>}
      </div>
    </>
  );
}
