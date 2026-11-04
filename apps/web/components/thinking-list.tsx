import Link from "./locale-provider";
import { notFound, unstable_rethrow } from "next/navigation";
import { getCategories, getRecently } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { Suspense } from "react";
import { getApiUrl } from "../lib/config";
import ArticleBody from "./article-body";
import Comments from "./comments";
import RecentlyAttitude from "./recently-attitude";
import "./corners.css";
import { getT } from "../lib/i18n/server";
import LoadError from "./load-error";
import Reveal from "./reveal";

type Item = Awaited<ReturnType<typeof getRecently>>["data"][number];

// 引用的文章需要分类 slug 才能拼出地址，Core 只给了分类 id，用分类列表换算。
function refHref(ref: NonNullable<Item["ref"]>, categories: { id: string; slug: string }[]) {
  if (ref.type === "Note" && ref.nid) return `/notes/${ref.nid}`;
  if (ref.type === "Page" && ref.slug) return `/${encodeURIComponent(ref.slug)}`;
  const category = categories.find((item) => item.id === ref.categoryId);
  if (ref.type === "Post" && ref.slug && category) return `/posts/${encodeURIComponent(category.slug)}/${encodeURIComponent(ref.slug)}`;
  return null;
}

// 思考（Core 的“速记 / 动态”）：引用网站、书或站内文章写下的看法。一张张小卡片，正文按 Markdown 完整显示，附带引用的文章/手记/页面，可赞/踩和评论（评论默认收起）。
export default async function ThinkingList({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const { before } = await searchParams;
  const { thinking: t, list } = await getT();
  if (before !== undefined && (typeof before !== "string" || !/^[a-f\d]{24}$/i.test(before))) notFound();
  let result: Awaited<ReturnType<typeof getRecently>>;
  let categories: Awaited<ReturnType<typeof getCategories>>;
  try {
    [result, categories] = await Promise.all([getRecently(before), getCategories()]);
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.title} href={before ? `/thinking?before=${before}` : "/thinking"} />;
  }
  if (before && !result.data.length) notFound();
  const last = result.data.at(-1);

  return (
    <>
      <header className="page-heading">
        <h1>{t.title}</h1>
        <p className="post-meta">{t.note}</p>
      </header>
      <div className="post-list-content">
        {result.data.length ? (
          <ul className="thinking-list">
            {result.data.map((item, index) => {
              const href = item.ref && refHref(item.ref, categories);
              return (
                <Reveal as="li" key={item.id} index={index} className="thinking-card">
                  <div lang="zh-CN"><ArticleBody text={item.content} emptyText="" /></div>
                  <p className="post-meta thinking-meta">
                    <time dateTime={item.created}>{formatDate(item.created)}</time>
                    {item.ref && (href ? <Link href={href}>{t.quote(item.ref.title)}</Link> : <span>{t.quote(item.ref.title)}</span>)}
                    <RecentlyAttitude apiUrl={getApiUrl()} id={item.id} up={item.up} down={item.down} />
                  </p>
                  {(item.allowComment || item.comments > 0) && (
                    <details className="thinking-comments">
                      <summary>{t.comments(item.comments)}</summary>
                      <Suspense fallback={<p className="post-meta" role="status">{list.loadingComments}</p>}>
                        <Comments refId={item.id} refType="Recently" allowComment={item.allowComment} />
                      </Suspense>
                    </details>
                  )}
                </Reveal>
              );
            })}
          </ul>
        ) : <p className="post-empty">{t.empty}</p>}
        {(before || (result.hasMore && last)) && (
          <nav className="post-pagination" aria-label={list.pagination(t.title)}>
            {before ? <Link href="/thinking">{t.latest}</Link> : <span />}
            {result.hasMore && last ? <Link href={`/thinking?before=${last.id}`} rel="next">{t.earlier}</Link> : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
