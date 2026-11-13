import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { getSubscribeOptions } from "../lib/blog-data";
import { getApiUrl } from "../lib/config";
import ArticleActions from "./article-actions";
import ArticleToc from "./article-toc";
import CommentChat from "./comment-chat";
import type { CommentRefType } from "./comment-form";
import { getT } from "../lib/i18n/server";

type Props = {
  title: string;
  like?: { id: string; type: "post" | "note"; count: number };
  comments: { refId: string; refType: CommentRefType; allowComment: boolean };
};

// 文章/手记/页面详情右侧的悬浮栏：上面是目录，下面是操作（喜欢、评论悬浮窗、分享、订阅、回到顶部）。
// 宽屏在正文右侧留白里：外层和正文一样高，里面那层 sticky，滚动时停在页头下面、读到正文末尾就停住，不压页脚
// （globals.css 的 .site-details）；窄屏目录隐藏、操作变成右下角胶囊（article-toc.css、article-actions.css）。页面（关于我等）没有点赞。
export default async function ArticleAside({ title, like, comments }: Props) {
  const t = (await getT()).article;
  return (
    <aside className="site-details" aria-label={t.asideLabel}>
      <div className="site-details-inner">
        <ArticleToc />
        <Suspense fallback={null}>
          <Actions title={title} like={like} comments={comments} />
        </Suspense>
      </div>
    </aside>
  );
}

// 订阅开关读不到时，订阅按钮不显示，其余照常
async function Actions({ title, like, comments }: Props) {
  const apiUrl = getApiUrl();
  let options: Awaited<ReturnType<typeof getSubscribeOptions>> | null = null;
  try {
    options = await getSubscribeOptions();
  } catch (error) {
    unstable_rethrow(error);
  }
  const subscribe = options?.enabled ? { apiUrl, types: options.types } : null;
  return <ArticleActions title={title} like={like ? { apiUrl, ...like } : null} comments={<CommentChat {...comments} title={title} />} subscribe={subscribe} />;
}
