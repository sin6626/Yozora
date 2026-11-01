import { Clock3, Eye, Heart, Sparkle, Sparkles } from "lucide-react";
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
// featured：置顶文章、标记过的手记（后台“回忆项”）要显示的那行小字（“置顶”/“回忆”）。有它时是“星轨 + 微光”（2026-11-01 用户在 /debug 选定）：
// 一圈几乎看不见的细线框，一颗带尾迹的小星沿着框绕（画在和框重合的 SVG 圆角矩形上，转弯也贴着框）；标题上方一行小字，标题是月光色、隔一会儿扫过一道微光。
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
  featured?: string;
  headingLevel?: 2 | 3;
  lang?: string;
}) {
  const [t, locale] = await Promise.all([getT().then((messages) => messages.entry), getLocale()]);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [year, month, day] = formatDate(created).split("/");
  const summary = typeof excerpt === "string" ? (excerpt ? { text: excerpt, source: "summary" as const } : null) : excerpt;
  return (
    <article className={["entry", serif && "is-serif", featured && "is-featured"].filter(Boolean).join(" ")}>
      {featured && (
        // 尾迹由三段长短、浓淡不同的描边组成，跟着同一个速度沿轮廓走，看起来就是一颗拖着尾巴的星（corners.css 的 .entry-orbit）
        <svg className="entry-orbit" aria-hidden="true">
          <rect className="entry-orbit-tail" pathLength={100} />
          <rect className="entry-orbit-trail" pathLength={100} />
          <rect className="entry-orbit-head" pathLength={100} />
        </svg>
      )}
      <time className="entry-date" dateTime={created}>
        <span className="entry-day">{day}</span>
        <span className="entry-month">{year}.{month}</span>
      </time>
      <div className="entry-body">
        {featured && <p className="entry-label"><Sparkle size={10} strokeWidth={2.25} aria-hidden="true" />{featured}</p>}
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
