import Link from "./locale-provider";
import "./corners.css";
import "./details-sidebar.css";
import "./says.css";
import { notFound, unstable_rethrow } from "next/navigation";
import { getAllSays, getSiteSettings, getSiteUrl } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { getT } from "../lib/i18n/server";
import { authorsOf, skyLayout } from "../lib/says";
import { listHref, Pagination } from "./list-filters";
import LoadError from "./load-error";
import SaySky from "./say-sky";
import { SayCardButton } from "./say-tools";

const pageSize = 20;

// 一言：朋友们说过的好句子。最上面是金句星图（say-sky.tsx，抽一句也在里面），下面一排“按人看”的胶囊
// （?author=名字，名字原样匹配），再下面是普通列表，每张引文卡片右上角可以“做成卡片”（say-tools.tsx）。纯逻辑在 lib/says.ts。
export default async function SayList({ searchParams }: { searchParams: Promise<{ page?: string | string[]; author?: string | string[] }> }) {
  const { page: rawPage = "1", author: rawAuthor } = await searchParams;
  if (typeof rawPage !== "string" || !/^[1-9]\d*$/.test(rawPage) || Array.isArray(rawAuthor)) notFound();
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page)) notFound();
  const author = rawAuthor?.trim() || undefined;
  const filter: Record<string, string> = author ? { author } : {};
  const href = (number: number) => listHref("/says", filter, number);
  const { says: t } = await getT();

  let says: Awaited<ReturnType<typeof getAllSays>>;
  let site: string;
  try {
    const [all, settings, siteUrl] = await Promise.all([getAllSays(), getSiteSettings().catch(() => null), getSiteUrl().catch(() => "")]);
    says = all;
    site = [settings?.name, siteUrl && new URL(siteUrl).host].filter(Boolean).join(" · ");
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.title} href={href(page)} />;
  }
  const authors = authorsOf(says);
  if (author && !authors.some(({ name }) => name === author)) notFound();
  const shown = author ? says.filter((say) => say.author?.trim() === author) : says;
  const totalPage = Math.max(1, Math.ceil(shown.length / pageSize));
  if (page > totalPage) notFound();
  const pageSays = shown.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <header className="page-heading">
        <h1>{t.title}</h1>
        <p className="post-meta">{t.count(shown.length)}</p>
      </header>
      <div className="post-list-content">
        {says.length > 0 && <SaySky layout={skyLayout(says)} says={says} author={author} site={site} />}
        {authors.length > 1 && (
          <div className="say-toolbar">
            <nav className="say-authors" aria-label={t.byAuthor}>
              <ul className="tag-list">
                <li>
                  <Link className="tag-chip" href="/says" aria-current={author ? undefined : "page"}>
                    {t.all}
                    <span className="tag-count">{says.length}</span>
                  </Link>
                </li>
                {authors.map(({ name, count }) => (
                  <li key={name}>
                    <Link className="tag-chip" href={listHref("/says", { author: name }, 1)} aria-current={name === author ? "page" : undefined}>
                      <span lang="zh-CN">{name}</span>
                      <span className="tag-count">{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        )}
        {pageSays.length ? (
          <ul className="say-list">
            {pageSays.map((say) => (
              <li key={say.id} className="say-card">
                <blockquote lang="zh-CN">
                  <p>{say.text}</p>
                  {(say.author || say.source) && (
                    <footer className="post-meta">
                      {say.author && <span>{say.author}</span>}
                      {say.source && <cite>{say.source}</cite>}
                    </footer>
                  )}
                </blockquote>
                <time className="say-date" dateTime={say.created}>{formatDate(say.created)}</time>
                <SayCardButton say={say} site={site} />
              </li>
            ))}
          </ul>
        ) : <p className="post-empty">{t.empty}</p>}
        <Pagination label={t.title} page={page} totalPage={totalPage} href={href} />
      </div>
    </>
  );
}
