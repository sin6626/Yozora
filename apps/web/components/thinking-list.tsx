import { PageNav } from "./list-filters";
import { notFound, unstable_rethrow } from "next/navigation";
import { getCategories, getRecently } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { Suspense } from "react";
import { getApiUrl } from "../lib/config";
import ArticleBody from "./article-body";
import Comments from "./comments";
import RecentlyAttitude from "./recently-attitude";
import ThinkingFoot from "./thinking-foot";
import { QuoteCard, RefTicket } from "./thinking-quote";
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "./corners.css";
import "./thinking.css";
import { getT } from "../lib/i18n/server";
import LoadError from "./load-error";
import Reveal from "./reveal";

export type ThinkingItem = Awaited<ReturnType<typeof getRecently>>["data"][number];
type Categories = { id: string; slug: string }[];

// 引用的文章需要分类 slug 才能拼出地址，Core 只给了分类 id，用分类列表换算。
function refHref(ref: NonNullable<ThinkingItem["ref"]>, categories: Categories) {
  if (ref.type === "Note" && ref.nid) return `/notes/${ref.nid}`;
  if (ref.type === "Page" && ref.slug) return `/${encodeURIComponent(ref.slug)}`;
  const category = categories.find((item) => item.id === ref.categoryId);
  if (ref.type === "Post" && ref.slug && category) return `/posts/${encodeURIComponent(category.slug)}/${encodeURIComponent(ref.slug)}`;
  return null;
}

// 思考的“星图注记”：和首页时间线同一条星座线，每条一颗月光色小星；看法（Markdown，用文楷）是正文，
// 引用的书、网页、仓库、题目或站内文章像一张票根挂在下面；赞、踩、评论是一排小图标，评论点开才展开。
// 调试页用示例数据直接渲染这一段。
export async function ThinkingLog({ items, categories }: { items: ThinkingItem[]; categories: Categories }) {
  const { thinking: t, list } = await getT();
  if (!items.length) {
    return (
      <ol className="thinking-log is-empty">
        <li className="thinking-entry">
          <span className="thinking-star" aria-hidden="true" />
          <p className="thinking-empty">{t.empty}</p>
        </li>
      </ol>
    );
  }
  return (
    <ol className="thinking-log">
      {items.map((item, index) => (
        <Reveal as="li" key={item.id} index={index} className="thinking-entry">
          <span className="thinking-star" aria-hidden="true" />
          <time dateTime={item.created}>{formatDate(item.created)}</time>
          {item.content && <div className="thinking-text" lang="zh-CN"><ArticleBody text={item.content} emptyText="" /></div>}
          {item.quote && <QuoteCard quote={item.quote} />}
          {item.ref && <RefTicket kind={item.ref.type} title={item.ref.title} href={refHref(item.ref, categories)} />}
          <ThinkingFoot attitude={<RecentlyAttitude apiUrl={getApiUrl()} id={item.id} up={item.up} down={item.down} />} count={item.comments}>
            {(item.allowComment || item.comments > 0) && (
              <Suspense fallback={<p className="post-meta" role="status">{list.loadingComments}</p>}>
                <Comments refId={item.id} refType="Recently" allowComment={item.allowComment} count={item.comments} />
              </Suspense>
            )}
          </ThinkingFoot>
        </Reveal>
      ))}
    </ol>
  );
}

export default async function ThinkingList({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const { before } = await searchParams;
  const { thinking: t } = await getT();
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
        <ThinkingLog items={result.data} categories={categories} />
        {(before || (result.hasMore && last)) && (
          <PageNav
            label={t.title}
            prev={before ? { href: "/thinking", text: t.latest } : undefined}
            next={result.hasMore && last ? { href: `/thinking?before=${last.id}`, text: t.earlier, rel: "next" } : undefined}
          />
        )}
      </div>
    </>
  );
}
