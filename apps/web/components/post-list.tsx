import type { CategoryModel } from "@mx-space/api-client";
import Link from "./locale-provider";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { getCategories, getMatchedPosts, getPosts } from "../lib/blog-data";
import { readText } from "../lib/search-params";
import { ActiveFilter, Pagination, listHref } from "./list-filters";
import PostTagDrawer from "./post-sidebar";
import type { ListExcerpt } from "../lib/blog-data";
import Entry, { EntryTag, type EntryStats } from "./entry";
import SidebarSearch from "./sidebar-search";
import "./details-sidebar.css";
import "./corners.css";
import { getLocale, getT } from "../lib/i18n/server";
import LoadError from "./load-error";

type PostListProps = {
  searchParams: Promise<{ page?: string | string[]; q?: string | string[]; tag?: string | string[] }>;
  params?: Promise<{ slug: string }>;
};

export type PostCardData = {
  id: string;
  href: string | null;
  title: string;
  summary?: string | null;
  excerpt?: ListExcerpt;
  stats?: EntryStats;
  tags?: string[];
  created: string;
  pinned?: boolean;
  original?: boolean;
  category: { name: string; slug: string } | null;
};

// 文章的角落：标题 + 摘要 + 日期和分类，整张卡片可点（分类链接仍可单独点）。首页预览复用。
export async function PostCard({ post, headingLevel = 2 }: { post: PostCardData; headingLevel?: 2 | 3 }) {
  const { posts: t, list } = await getT();
  return (
    <Entry
      href={post.href}
      title={post.title}
      created={post.created}
      headingLevel={headingLevel}
      lang={post.original ? "zh-CN" : undefined}
      excerpt={post.excerpt ?? post.summary}
      stats={post.stats}
      hashtags={post.tags}
      tags={<>
        {post.category
          ? <EntryTag href={`/categories/${encodeURIComponent(post.category.slug)}`}>{post.category.name}</EntryTag>
          : <EntryTag>{t.uncategorized}</EntryTag>}
        {post.pinned && <span className="badge">{list.pinned}</span>}
      </>}
    />
  );
}

export const postHref = (post: { slug?: string; category: { slug: string } | null }) =>
  post.category && post.slug ? `/posts/${encodeURIComponent(post.category.slug)}/${encodeURIComponent(post.slug)}` : null;

// 文章列表的筛选：全部（/posts）、分类（/categories/x）、标签（?tag=）、搜索（?q=），同一时间只生效一个（2026-10-31 与用户约定）。
// 不管哪一种，都是同一种条目、同样分页，分类那一行一直在；标签和搜索在上方显示一枚可以 × 掉的标记。
type PostFilter = { kind: "all" } | { kind: "category"; slug: string } | { kind: "tag"; name: string } | { kind: "search"; keyword: string };

export default async function PostList({ searchParams, params }: PostListProps) {
  const [{ page: rawPage = "1", q, tag }, route, { posts: t, list }, locale] = await Promise.all([searchParams, params, getT(), getLocale()]);
  if (typeof rawPage !== "string" || !/^[1-9]\d*$/.test(rawPage)) notFound();
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page)) notFound();
  let filter: PostFilter = { kind: "all" };
  if (route) {
    try {
      filter = { kind: "category", slug: decodeURIComponent(route.slug) };
    } catch {
      notFound();
    }
  } else if (readText(q)) {
    filter = { kind: "search", keyword: readText(q) };
  } else if (typeof tag === "string" && tag.trim()) {
    // 标签名原样保留（后台有带空格的标签）
    filter = { kind: "tag", name: tag.slice(0, 100) };
  }
  const pageHref = (number: number) => filter.kind === "category"
    ? listHref(`/categories/${encodeURIComponent(filter.slug)}`, {}, number)
    : listHref("/posts", filter.kind === "tag" ? { tag: filter.name } : filter.kind === "search" ? { q: filter.keyword } : {}, number);

  let categories: CategoryModel[];
  let category: CategoryModel | undefined;
  let result: Awaited<ReturnType<typeof getPosts>>;
  try {
    categories = await getCategories(locale);
    if (filter.kind === "category") {
      const slug = filter.slug;
      category = categories.find((item) => item.slug === slug);
      if (!category) notFound();
    }
    result = filter.kind === "tag" ? await getMatchedPosts({ tag: filter.name }, page, locale)
      : filter.kind === "search" ? await getMatchedPosts({ keyword: filter.keyword }, page, locale)
      : await getPosts(page, category?.id, locale);
    if (page > Math.max(1, result.pagination.totalPage)) notFound();
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.title} href={pageHref(page)} />;
  }
  const { data: posts, pagination } = result;
  const empty = { all: t.empty, category: t.emptyCategory, tag: t.tagEmpty, search: t.searchEmpty }[filter.kind];

  return (
    <>
      <header className="page-heading list-heading">
        <div>
          <h1>{category?.name ?? t.title}</h1>
          <p className="post-meta">{t.count(pagination.total)}</p>
        </div>
      </header>
      <div className="post-list-content">
        {/* 筛选栏：宽屏（≥ 90rem）悬浮在列表右边，窄屏在列表上方（details-sidebar.css 的 .list-aside） */}
        <aside className="list-filters list-aside" aria-label={list.filters}>
          <SidebarSearch action="/posts" label={t.search} defaultValue={filter.kind === "search" ? filter.keyword : ""} />
          {filter.kind === "tag" && <ActiveFilter label={t.tag(filter.name.trim())} clearHref="/posts" />}
          {filter.kind === "search" && <ActiveFilter label={list.searchQuery(filter.keyword)} clearHref="/posts" />}
          <section className="list-aside-section" aria-label={t.categories}>
            <h2>{t.categories}</h2>
            <nav className="post-categories" aria-label={t.categories}>
              <Link href="/posts" aria-current={filter.kind === "all" ? "page" : undefined}>{t.all}</Link>
              {categories.map((item) => (
                <Link key={item.id} href={`/categories/${encodeURIComponent(item.slug)}`} aria-current={item.id === category?.id ? "page" : undefined}>
                  {item.name}<span className="tag-count">{item.count}</span>
                </Link>
              ))}
            </nav>
          </section>
          <Suspense fallback={null}><PostTagDrawer activeTag={filter.kind === "tag" ? filter.name : undefined} /></Suspense>
        </aside>
        {posts.length ? (
          <ul className="post-list">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={{ ...post, href: postHref(post) }} />
              </li>
            ))}
          </ul>
        ) : <p className="post-empty">{empty}</p>}
        <Pagination label={t.title} page={page} totalPage={pagination.totalPage} href={pageHref} />
      </div>
    </>
  );
}
