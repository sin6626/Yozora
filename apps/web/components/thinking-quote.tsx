import { BookOpen, Clapperboard, Disc3, FileText, GraduationCap, Link2, NotebookPen, SquareCode, Star } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import IconifyIcon from "./iconify-icon";
import Link from "./locale-provider";
import { getLocale, getT } from "../lib/i18n/server";
import type { ThinkingQuote } from "../lib/thinking";

// “思考”引用的东西：像一张票根挂在看法下面。外部的东西新标签页打开；站内的文章、手记、页面走站内链接。
// 封面、配图是外部地址：不带来源（豆瓣等防盗链），叠在画出来的封面上，图片坏了也只露出画的那本书。

// 没有封面时画一本书（或一张碟）：颜色在强调色和月光色之间，按标题取一个比例，同一本书每次一样
function coverMix(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.codePointAt(0)!) % 997;
  return { "--mix": `${20 + (hash % 60)}%` } as CSSProperties;
}

function Cover({ src, title, shape }: { src?: string; title: string; shape: "book" | "disc" | "wide" }) {
  return (
    <span className="thinking-cover" data-shape={shape} style={coverMix(title)} aria-hidden="true">
      {shape === "book" && <span className="thinking-cover-title">{title}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element -- 封面来自豆瓣等外部地址，不固定，不走 next/image */}
      {src && <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
    </span>
  );
}

function Card({ href, type, visual, kind, children }: { href: string; type: string; visual?: ReactNode; kind: ReactNode; children: ReactNode }) {
  return (
    <a className="thinking-quote" data-type={type} href={href} target="_blank" rel="noopener noreferrer">
      {visual}
      <span className="thinking-quote-text">
        <span className="thinking-quote-kind">{kind}</span>
        {children}
      </span>
    </a>
  );
}

export async function QuoteCard({ quote }: { quote: ThinkingQuote }) {
  const [{ thinking: t }, locale] = await Promise.all([getT(), getLocale()]);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat(locale, { notation: "compact" });
  const rating = (value?: number) => value !== undefined && (
    <span aria-label={t.rating(number.format(value))}><Star size={12} aria-hidden="true" />{number.format(value)}</span>
  );
  switch (quote.type) {
    case "book":
      return (
        <Card href={quote.url} type="book" visual={<Cover src={quote.cover} title={quote.title} shape="book" />} kind={<><BookOpen size={12} aria-hidden="true" />{t.kinds.book}</>}>
          <span className="thinking-quote-title">《{quote.title}》</span>
          <span className="thinking-quote-sub"><span>{quote.author}</span>{rating(quote.rating)}</span>
        </Card>
      );
    case "media":
      return (
        <Card href={quote.url} type="media" visual={<Cover src={quote.cover} title={quote.title} shape="book" />} kind={<><Clapperboard size={12} aria-hidden="true" />{quote.genre ?? t.kinds.media}</>}>
          <span className="thinking-quote-title">{quote.title}</span>
          {(quote.originalTitle || quote.rating !== undefined) && <span className="thinking-quote-sub">{quote.originalTitle && <span>{quote.originalTitle}</span>}{rating(quote.rating)}</span>}
          {quote.description && <span className="thinking-quote-desc">{quote.description}</span>}
        </Card>
      );
    case "music":
      return (
        <Card href={quote.url} type="music" visual={<Cover src={quote.cover} title={quote.title} shape="disc" />} kind={<><Disc3 size={12} aria-hidden="true" />{quote.source ?? t.kinds.music}</>}>
          <span className="thinking-quote-title">{quote.title}</span>
          <span className="thinking-quote-sub"><span>{[quote.artist, quote.album].filter(Boolean).join(" · ")}</span></span>
        </Card>
      );
    case "github":
      return (
        <Card href={quote.url} type="github" kind={<><IconifyIcon icon="simple-icons:github" size={12} />{t.kinds.github}</>}>
          <span className="thinking-quote-title">{quote.owner} / <b>{quote.repo}</b></span>
          {quote.description && <span className="thinking-quote-desc">{quote.description}</span>}
          {(quote.language || quote.stars !== undefined) && (
            <span className="thinking-quote-sub">
              {quote.language && <span className="thinking-lang" style={quote.languageColor ? ({ "--lang": quote.languageColor } as CSSProperties) : undefined}>{quote.language}</span>}
              {quote.stars !== undefined && <span aria-label={t.stars(compact.format(quote.stars))}><Star size={12} aria-hidden="true" />{compact.format(quote.stars)}</span>}
            </span>
          )}
        </Card>
      );
    case "link":
      return (
        <Card href={quote.url} type="link" visual={quote.image && <Cover src={quote.image} title={quote.title ?? quote.url} shape="wide" />} kind={<><Link2 size={12} aria-hidden="true" />{new URL(quote.url).hostname}</>}>
          <span className="thinking-quote-title">{quote.title ?? quote.url}</span>
          {quote.description && <span className="thinking-quote-desc">{quote.description}</span>}
        </Card>
      );
    case "academic":
      return (
        <Card href={quote.url} type="academic" kind={<><GraduationCap size={12} aria-hidden="true" />{quote.arxivId ? `arXiv:${quote.arxivId}` : t.kinds.academic}</>}>
          <span className="thinking-quote-title">{quote.title}</span>
          {quote.authors.length > 0 && <span className="thinking-quote-sub"><span>{quote.authors.join(", ")}</span></span>}
        </Card>
      );
    case "code":
      return (
        <Card href={quote.url} type="code" kind={<><SquareCode size={12} aria-hidden="true" />{quote.platform ?? new URL(quote.url).hostname}</>}>
          <span className="thinking-quote-title">{quote.title}</span>
          {(quote.difficulty || quote.tags.length > 0) && (
            <span className="thinking-quote-sub">
              {quote.difficulty && (
                <span aria-label={t.difficulty(quote.difficulty)}>
                  {quote.level && <span className="thinking-level" data-level={quote.level} aria-hidden="true"><i /><i /><i /></span>}
                  {quote.difficulty}
                </span>
              )}
              {quote.tags.length > 0 && <span>{quote.tags.join(" / ")}</span>}
            </span>
          )}
        </Card>
      );
  }
}

// 站内引用：文章、手记、页面
export async function RefTicket({ kind, title, href }: { kind: "Post" | "Note" | "Page" | string; title: string; href: string | null }) {
  const { thinking: t } = await getT();
  const label = kind === "Post" || kind === "Note" || kind === "Page" ? t.refKinds[kind] : kind;
  const body = (
    <span className="thinking-quote-text">
      <span className="thinking-quote-kind">{kind === "Note" ? <NotebookPen size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />}{label}</span>
      <span className="thinking-quote-title">{title}</span>
    </span>
  );
  return href ? <Link className="thinking-quote" data-type="ref" href={href}>{body}</Link> : <span className="thinking-quote" data-type="ref">{body}</span>;
}
