import { Clock3, Eye, Heart, Sparkles } from "lucide-react";
import Link from "./locale-provider";
import type { ReactNode } from "react";
import type { ListExcerpt } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { getLocale, getT } from "../lib/i18n/server";
import "./corners.css";

export type EntryStats = { minutes: number; reads: number; likes: number };

// 文章、手记、搜索结果共用的列表条目：左栏是大号的“日”和小字“年.月”，右栏第一行标题、标题右边跟分类或话题标签，
// 然后最多两行摘要（AI 摘要前面有一枚小星标记），最后一行信息：手记的心情天气、阅读时长、阅读数、喜欢数、文章标签。
// 整条可点（标题链接铺满），标签链接单独可点。serif：手记的标题和摘录用衬线字体。
// lang：外文页面上这篇还没有译文时传 "zh-CN"，标题和摘录标明是中文原文。
// featured：置顶文章、标记过的手记（后台“回忆项”）——“北极星卡片”：带星光的卡片，左栏的大号日换成会呼吸的北极星、下面小字日期。
export default async function Entry({ href, title, created, tags, meta, excerpt, stats, hashtags, serif, featured, headingLevel = 2, lang }: {
  href: string | null;
  title: string;
  created: string;
  tags?: ReactNode;
  meta?: ReactNode;
  excerpt?: ListExcerpt | string;
  stats?: EntryStats;
  hashtags?: string[];
  serif?: boolean;
  featured?: boolean;
  headingLevel?: 2 | 3;
  lang?: string;
}) {
  const [t, locale] = await Promise.all([getT().then((messages) => messages.entry), getLocale()]);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [year, month, day] = formatDate(created).split("/");
  const summary = typeof excerpt === "string" ? (excerpt ? { text: excerpt, source: "summary" as const } : null) : excerpt;
  return (
    <article className={["entry", serif && "is-serif", featured && "is-featured"].filter(Boolean).join(" ")}>
      <time className="entry-date" dateTime={created}>
        {featured ? <>
          <span className="entry-star" aria-hidden="true" />
          <span className="entry-month">{year}.{month}.{day}</span>
        </> : <>
          <span className="entry-day">{day}</span>
          <span className="entry-month">{year}.{month}</span>
        </>}
      </time>
      <div className="entry-body">
        <div className="entry-heading">
          <Heading className="entry-title" lang={lang}>{href ? <Link className="card-link" href={href}>{title}</Link> : title}</Heading>
          {tags}
        </div>
        {summary && (
          <p className="entry-excerpt" lang={lang}>
            {summary.source === "ai" && <span className="entry-ai" title={t.aiSummary}><Sparkles size={12} strokeWidth={2} aria-hidden="true" /><span className="sr-only">{t.aiSummaryPrefix}</span></span>}
            {summary.text}
          </p>
        )}
        {(meta || stats || hashtags?.length) && (
          <div className="entry-stats">
            {meta}
            {stats && <>
              <span title={t.readingTime}><Clock3 size={12} strokeWidth={1.75} aria-hidden="true" />{t.minutes(stats.minutes)}</span>
              <span title={t.reads}><Eye size={12} strokeWidth={1.75} aria-hidden="true" /><span className="sr-only">{t.reads}</span>{stats.reads}</span>
              {stats.likes > 0 && <span title={t.likes}><Heart size={12} strokeWidth={1.75} aria-hidden="true" /><span className="sr-only">{t.likes}</span>{stats.likes}</span>}
            </>}
            {/* 外文页面的标签是 Core 换进来的译文，按标签筛选只认中文原名，所以只显示不链接 */}
            {hashtags?.map((tag) => locale === "zh"
              ? <Link key={tag} className="entry-hashtag" href={`/posts?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>
              : <span key={tag} className="entry-hashtag">#{tag}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}

// 标题右边的小标签：有地址时是可单独点的链接
export function EntryTag({ href, children }: { href?: string; children: ReactNode }) {
  return href ? <Link className="entry-tag" href={href}>{children}</Link> : <span className="entry-tag">{children}</span>;
}
