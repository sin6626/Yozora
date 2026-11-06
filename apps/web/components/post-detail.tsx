import { ArticleNotifications, ReadingCount } from "./notifications";
import IslandReading from "./island-reading";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "./locale-provider";
import { notFound, unstable_rethrow } from "next/navigation";
import { getPost, getSiteContent, getSiteSettings, getTimeline } from "../lib/blog-data";
import PostCopyright from "./post-copyright";
import { formatDate } from "../lib/date";
import { getApiUrl } from "../lib/config";
import ArticleBody from "./article-body";
import ArticleAside from "./article-aside";
import { ArticleAiNotes, ArticleLanguages, loadArticleAi } from "./article-ai";
import ArticleStats from "./article-stats";
import { getLocale, getT } from "../lib/i18n/server";
import "./post-detail.css";
import { Suspense } from "react";
import Comments from "./comments";
import LoadError from "./load-error";

export default async function PostDetail({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const route = await params;
  const t = await getT();
  let category: string;
  let slug: string;
  try {
    category = encodeURIComponent(decodeURIComponent(route.category));
    slug = encodeURIComponent(decodeURIComponent(route.slug));
  } catch {
    notFound();
  }
  const href = `/posts/${category}/${slug}`;
  let post: Awaited<ReturnType<typeof getPost>>;
  try {
    post = await getPost(category, slug, await getLocale());
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.posts.title} href={href} />;
  }
  if (!post) notFound();
  const [ai, { copyright }, settings] = await Promise.all([loadArticleAi(post.id), getLocale().then(getSiteContent), getSiteSettings().catch(() => null)]);
  const body = ai.translation ?? post;

  return (
    <article className="post-detail">
      <ArticleNotifications id={post.id} />
      <IslandReading title={body.title} kind="post" date={formatDate(post.created)} />
      <header className="page-heading">
        <nav className="detail-crumb" aria-label={t.list.crumb}>
          <Link href="/posts">{t.posts.title}</Link>
          {post.category && <><span aria-hidden="true">/</span><Link href={`/categories/${encodeURIComponent(post.category.slug)}`}>{post.category.name}</Link></>}
        </nav>
        <h1 className="post-detail-title" lang={ai.original}>{body.title}</h1>
        <div className="post-meta detail-meta">
          <time dateTime={post.created}>{formatDate(post.created)}</time>
          <span>{t.list.reads(post.count.read)}</span>
          <ReadingCount apiUrl={getApiUrl()} id={post.id} />
          <ArticleLanguages href={href} ai={ai} />
        </div>
      </header>
      <div className="post-list-content">
        <ArticleAiNotes ai={ai} />
        <div lang={ai.original}><ArticleBody text={body.text} contentFormat={body.contentFormat} content={body.content} emptyText={t.posts.noBody} /></div>
        {/* 文章开了后台的“版权注明”、配置片段 theme/yozora 写了 copyright 时，照 Shiro 显示标题、作者、链接、修改时间和版权说明（post-copyright.tsx） */}
        {post.copyright && copyright && settings && (
          <PostCopyright
            title={body.title}
            author={settings.ownerName}
            link={`${settings.siteUrl}${href}`}
            modified={post.modified}
            license={copyright}
          />
        )}
        <div className="article-end"><ArticleStats apiUrl={getApiUrl()} id={post.id} type="post" like={post.count.like} /></div>
        {post.related.length > 0 && (
          <nav className="neighbor-nav" aria-label={t.posts.related}>
            {post.related.map((item) => (
              <Link key={item.id} href={item.href}><span className="neighbor-label">{t.posts.related}</span><span className="neighbor-title">{item.title}</span></Link>
            ))}
          </nav>
        )}
        <Suspense fallback={null}>
          <PostNeighbors id={post.id} />
        </Suspense>
        <Suspense fallback={<p className="post-meta" role="status">{t.list.loadingComments}</p>}>
          <Comments refId={post.id} refType="Post" allowComment={post.allowComment} />
        </Suspense>
      </div>
      {/* 右侧悬浮栏：目录 + 操作（喜欢、分享、订阅、回到顶部），宽屏悬浮在正文右侧留白里，窄屏隐藏 */}
      <ArticleAside title={body.title} like={{ id: post.id, type: "post", count: post.count.like }} comments={{ refId: post.id, refType: "Post", allowComment: post.allowComment }} />
    </article>
  );
}

// 相邻文章：复用时间线缓存（全部已发布文章按发布时间倒序），读取失败时不显示。
async function PostNeighbors({ id }: { id: string }) {
  const posts = await getTimeline(await getLocale()).then((items) => items.flatMap((item) => item.kind === "post" ? [item] : []), () => []);
  const index = posts.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const href = (item: (typeof posts)[number]) => `/posts/${encodeURIComponent(item.category.slug)}/${encodeURIComponent(item.slug)}`;
  const newer = posts[index - 1];
  const older = posts[index + 1];
  if (!newer && !older) return null;
  const { list: t, posts: copy } = await getT();
  return (
    <nav className="neighbor-nav" aria-label={copy.neighbors}>
      {newer ? <Link href={href(newer)}><span className="neighbor-label"><ArrowLeft size={14} aria-hidden="true" />{t.newer}</span><span className="neighbor-title">{newer.title}</span></Link> : <span />}
      {older ? <Link className="is-older" href={href(older)}><span className="neighbor-label">{t.older}<ArrowRight size={14} aria-hidden="true" /></span><span className="neighbor-title">{older.title}</span></Link> : <span />}
    </nav>
  );
}
