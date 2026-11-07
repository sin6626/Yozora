import { notFound, unstable_rethrow } from "next/navigation";
import { getPage } from "../lib/blog-data";
import ArticleBody from "./article-body";
import IslandReading from "./island-reading";
import { ArticleNotifications } from "./notifications";
import ArticleAside from "./article-aside";
import "./post-detail.css";
import { Suspense } from "react";
import Comments from "./comments";
import { ArticleAiNotes, loadArticleAi } from "./article-ai";
import { getT } from "../lib/i18n/server";
import LoadError from "./load-error";

// 后台“页面”（如关于我、关于本站），地址是 /<slug>。
export default async function PageDetail({ params }: { params: Promise<{ slug: string }> }) {
  const route = await params;
  const t = await getT();
  let slug: string;
  try {
    slug = encodeURIComponent(decodeURIComponent(route.slug));
  } catch {
    notFound();
  }
  let page: Awaited<ReturnType<typeof getPage>>;
  try {
    page = await getPage(slug);
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.pages.title} href={`/${slug}`} />;
  }
  if (!page) notFound();
  // 外文页面读后台已有的译文（和文章、手记一样），没有译文时显示中文原文并说明
  const ai = await loadArticleAi(page.id);
  const body = ai.translation ?? page;
  const subtitle = ai.translation ? ai.translation.subtitle : page.subtitle;

  return (
    <article className="post-detail">
      <ArticleNotifications id={page.id} kind="page" />
      <IslandReading title={body.title} kind="page" />
      <header className="page-heading">
        <h1 lang={ai.original}>{body.title}</h1>
        {subtitle && <p className="post-meta" lang={ai.original}>{subtitle}</p>}
      </header>
      <div className="post-list-content">
        <ArticleAiNotes ai={ai} />
        <div lang={ai.original}><ArticleBody text={body.text} contentFormat={body.contentFormat} content={body.content} emptyText={t.pages.noBody} /></div>
        <Suspense fallback={<p className="post-meta" role="status">{t.list.loadingComments}</p>}>
          <Comments refId={page.id} refType="Page" allowComment={page.allowComment} />
        </Suspense>
      </div>
      {/* 右侧悬浮栏：目录 + 操作（喜欢、分享、订阅、回到顶部），宽屏悬浮在正文右侧留白里，窄屏隐藏 */}
      <ArticleAside title={body.title} comments={{ refId: page.id, refType: "Page", allowComment: page.allowComment }} />
    </article>
  );
}
