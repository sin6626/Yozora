import type { Metadata } from "next";
import Link from "@/components/locale-provider";
import { notFound } from "next/navigation";
import ArticleBody from "@/components/article-body";
import { ChatStream, toMessages } from "@/components/comment-chat";
import CommentChatPanel from "@/components/comment-chat-panel";
import type { Thread } from "@/components/comments";
import "@/components/article-actions.css";
import BlogNavigation from "@/components/navigation-menu";
import { MurmurStream } from "@/components/murmur-list";
import NoteUnlock from "@/components/note-unlock";
import RecentlyAttitude from "@/components/recently-attitude";
import SubscribeForm from "@/components/subscribe-form";
import { getApiUrl } from "@/lib/config";
import SocialIconsPreview from "./social-icons";
import HomePanelPreviews from "./home-panel-preview";
import HeroEntrancePreview from "./hero-entrance";
import { OpenSearchButton } from "@/components/command-search";
import SkyMenu, { SkyPanel } from "@/components/sky-menu";
import { ActiveFilter } from "@/components/list-filters";
import PageLoading from "@/components/page-loading";
import { ProjectCard } from "@/components/project-list";
import { LinkCards } from "@/components/friend-list";
import type { CSSProperties } from "react";
import StyleGuide from "./style-guide";
import IslandButtons from "./island-buttons";
import BrandTickerPreview from "./brand-ticker";
import SaySkyPreview from "./say-sky-preview";
import ToastButtons from "./toast-buttons";

// 评论悬浮窗的示例消息（不读库）
const sampleComment = (id: string, author: string, text: string, created: string, extra: Partial<Thread> = {}) => ({
  id, author, text, created, avatar: "", url: "", location: "江苏", pinned: false, deleted: false, parentId: null, owner: false, ...extra,
});
const sampleChat: Thread[] = [
  { ...sampleComment("c1", "路过的星星", "读到白板那一节停下来试了一下，`Excalidraw` 嵌进来居然能拖动！", "2026-10-27T13:20:00Z"), replies: [
    sampleComment("c2", "Sin", "能拖的，只是不会保存～", "2026-10-27T14:02:00Z", { owner: true, parentId: "c1" }),
    sampleComment("c3", "路过的星星", "懂了，谢谢站长", "2026-10-28T01:10:00Z", { parentId: "c2" }),
  ] },
  { ...sampleComment("c4", "夜猫子", "这条评论被作者删掉了", "2026-10-28T15:40:00Z", { deleted: true }), replies: [] },
  { ...sampleComment("c5", "Moon", "目录跳转好丝滑。\n\n- 第一点\n- 第二点", "2026-10-29T06:30:00Z", { pinned: true }), replies: [] },
];

export const metadata: Metadata = { title: "调试" };

// 碎碎念的示例（不读库）：同一天连着几句、带图（40% 与默认 100%）、行内代码和链接，以及跨年的一天
const sampleImage = `${getApiUrl()}/objects/avatar/Sin.jpg`;
const sampleMurmurs = [
  { id: "m1", content: `Container Query 容器查询：按父容器的宽度来写响应式。\n\n![](${sampleImage} "w=40%")`, created: "2026-10-29T14:20:00Z", modified: null },
  { id: "m2", content: "`field-sizing: content` 能让文本框跟着内容长高，不用 JS。", created: "2026-10-29T13:05:00Z", modified: "2026-10-29T13:30:00Z" },
  { id: "m3", content: "今天好困。读取脚本要放在 <head> 里，<b>这里不会加粗</b>", created: "2026-10-29T12:00:00Z", modified: null },
  { id: "m4", content: `两张图：第一张没写宽度就是 100%，点开可以左右切换。\n\n![](${sampleImage})\n\n![第二张](${sampleImage}?2 "w=30%")`, created: "2026-10-27T15:00:00Z", modified: null },
  { id: "m5", content: "跨年的那一天会写上年份。[MDN](https://developer.mozilla.org)", created: "2025-12-31T15:00:00Z", modified: null },
];

const sampleMarkdown = `## 二级标题

正文段落，包含[链接](/posts)和行内代码 \`revalidateTag\`。

### 三级标题

- 无序列表项
- 第二项

1. 有序列表项
2. 第二项

> 引用内容

\`\`\`ts
export const answer = 42;
\`\`\`

| 列 A | 列 B |
| --- | --- |
| 单元格 | 单元格 |
`;

// 仅开发环境：集中展示平时很难看到的组件状态，样式和真实页面共用。
// 作品进场示例：八张卡，看斜对角波浪（本地真实作品只有两张）
const sampleProjects = ["星图", "夜航岛", "小火箭", "碎碎念", "金句卡片", "月相", "星井", "跃迁门"].map((name, index) => ({
  id: `sample-${index}`,
  name,
  description: "示例作品，用来看进场动画。",
  nameLang: undefined,
  descriptionLang: undefined,
  avatar: undefined,
  projectUrl: "https://example.com",
  previewUrl: undefined,
  docUrl: undefined,
}));

// 友链进场示例：十二个朋友，看卡片依次弹上来（本地真实友链只有两个）
const sampleFriends = ["织女", "牛郎", "天狼", "北斗", "参商", "启明", "长庚", "辰星", "荧惑", "岁星", "太白", "镇星"].map((name, index) => ({
  id: `friend-sample-${index}`,
  name,
  url: "https://example.com",
  avatar: "",
  description: "示例友链，用来看进场动画。",
}));

export default function DebugPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <header className="page-heading">
        <h1>调试</h1>
        <p className="post-meta">仅开发环境可见：设计系统的样式指南，以及平时不容易看到的组件状态。</p>
      </header>
      <div className="post-list-content">
        <ul className="debug-sections">
          <li>
            <StyleGuide />
          </li>
          <li>
            <h2>导航菜单</h2>
            <p className="post-meta">navigation.tsx 的加载占位</p>
            <p className="navigation-message" role="status">正在读取导航…</p>
            <p className="post-meta">navigation-menu.tsx 的三种状态，悬停“首页”“更多”查看面板（面板数据读取失败时，文章、手记、时间线退回普通链接）</p>
            <p className="post-meta">读取中</p>
            <BlogNavigation state={{ status: "loading" }} />
            <p className="post-meta">读取失败</p>
            <BlogNavigation state={{ status: "error" }} />
            <p className="post-meta">没有页面、面板数据读取失败</p>
            <BlogNavigation state={{ status: "ready", pages: [], panels: null, socials: [] }} />
          </li>
          <li>
            <h2>文章列表</h2>
            <p className="post-meta">post-list.tsx 的读取失败</p>
            <p className="post-list-content" role="alert">文章读取失败。<Link href="/debug">重试</Link></p>
            <p className="post-meta">post-list.tsx 的空列表</p>
            <p className="post-empty">还没有已发布的文章。</p>
            <p className="post-empty">这个分类下还没有已发布的文章。</p>
          </li>
          <li>
            <h2>首页</h2>
            <p className="post-meta">home-latest.tsx 单块读取失败与无内容（加载占位见下面“读取中”）</p>
            <p className="post-empty" role="alert">最新文章读取失败，请稍后刷新。</p>
            <p className="post-empty">暂无内容。</p>
          </li>
          <li id="debug-page-loading">
            <h2>读取中</h2>
            <p className="post-meta">page-loading.tsx：各页面 Suspense 的读取占位，往上飞的小火箭 + Innei 首页那句话（读屏念“正在读取…”），一出现就淡入（0.25 秒），十秒还没读完露出“重试”。页面里铺满页头以下一屏，这里和首页一样用 compact</p>
            <PageLoading compact />
          </li>
          <li>
            <h2>搜索与筛选</h2>
            <p className="post-meta">文章、手记列表的标签和搜索结果与普通列表同一种条目（post-list.tsx、note-list.tsx）；当前筛选是 list-filters.tsx 的 ActiveFilter，点 × 回到完整列表。下面依次是标签、搜索的标记，无结果，标签读取失败</p>
            <div className="list-filters">
              <ActiveFilter label="标签：Vue" clearHref="/posts" />
              <ActiveFilter label="搜索“学习”" clearHref="/posts" />
            </div>
            <p className="post-empty">没有匹配的文章，换个关键词试试。</p>
            <p className="post-meta">标签读取失败。</p>
          </li>
          <li>
            <h2>手记与作品</h2>
            <p className="post-meta">note-list.tsx、project-list.tsx 的读取失败与空列表</p>
            <p className="post-list-content" role="alert">手记读取失败。<Link href="/debug">重试</Link></p>
            <p className="post-empty">还没有公开的手记。</p>
            <p className="post-empty">还没有作品。</p>
            <p className="post-meta">note-detail.tsx：Core 对加密手记返回 403 时显示 note-unlock.tsx 的密码表单（真实组件，提交会请求 Core，这里只展示）</p>
            <NoteUnlock nid={1} />
          </li>
          <li>
            <h2>时间线、友链、一言与思考</h2>
            <p className="post-meta">timeline-list.tsx、friend-list.tsx、say-list.tsx、thinking-list.tsx 的读取失败与空列表</p>
            <p className="post-empty">还没有内容。</p>
            <p className="post-list-content" role="alert">友链读取失败。<Link href="/debug">重试</Link></p>
            <p className="post-empty">还没有友链。</p>
            <p className="post-empty">还没有一言。</p>
            <p className="post-empty">还没有思考。</p>
            <p className="post-meta">recently-attitude.tsx 的赞/踩（真实组件，点击会请求 Core）：<RecentlyAttitude apiUrl={getApiUrl()} id="000000000000000000000000" up={3} down={1} /></p>
          </li>
          <li id="debug-say-sky">
            <h2>金句星图</h2>
            <p className="post-meta">say-sky.tsx（示例句子，不读库）：5 / 60 / 240 句时的样子，和一言页一样铺满屏幕宽。句子再多也整体缩进画面，星点、可悬停的范围、光晕跟着变小；新的亮旧的暗。鼠标移到星上，旁边浮出那句话、星座亮起；一开始没有选中的星，点别处或按 Esc 收起。竖屏（手机）用另一份排布，那句话固定在底部</p>
            <SaySkyPreview />
          </li>
          <li id="debug-socials">
            <h2>社交图标</h2>
            <SocialIconsPreview />
          </li>
          <li id="debug-home-panel">
            <h2>导航首页面板</h2>
            <HomePanelPreviews />
          </li>
          <li id="debug-hero-entrance">
            <h2>首页入场动画</h2>
            <p className="post-meta">home-hero.css：首屏天空从暗处亮起，标题两行、说明、社交图标、头像、底部依次对焦浮上，最后“Sin”“大三学生”亮一下；首页下半部分用 components/reveal.tsx，滚到才出现、只播一次，离开首页再回来重置。开灯时“大三学生”是粗体，光晕是 --emphasis-halo（每套配色一种）。地址加 ?palette=night / galaxy / ink 换配色对比</p>
            <HeroEntrancePreview />
          </li>
          <li id="debug-friend-entrance">
            <h2>友链进场</h2>
            <p className="post-meta">corners.css 的 .friend-grid &gt; li：卡片按页面顺序一张接一张弹上来（每张晚 70ms，弹簧缓动冲过头一点再落稳）。本地真实友链只有两个，这里放十二个示例；刷新页面重播</p>
            <LinkCards links={sampleFriends} />
          </li>
          <li id="debug-project-entrance">
            <h2>作品进场</h2>
            <p className="post-meta">corners.css 的 .project-grid &gt; li：卡片按（行 + 列）× 90ms 沿斜对角依次浮上，列数随网格宽度用容器查询算。本地真实作品只有两张，这里放八张示例看波浪；刷新页面重播</p>
            <ul className="project-grid">
              {sampleProjects.map((project, index) => (
                <li key={project.id} style={{ "--i": index } as CSSProperties}><ProjectCard project={project} headingLevel={3} /></li>
              ))}
            </ul>
          </li>
          <li id="debug-sky">
            <h2>今晚的天空</h2>
            <p className="post-meta">components/sky-menu.tsx：页头（和手机菜单底部）月亮按钮左边的望远镜，点开三块小天空（夜紫 / 银河 / 墨黑），点哪块换哪套配色，整页 0.6 秒渐变，背景星空跟着换；浅色 / 深色仍是旁边的月亮按钮。上面是真实按钮，下面是展开的样子</p>
            <div className="debug-sky">
              <SkyMenu />
              <div className="sky-popup">
                <SkyPanel />
              </div>
            </div>
          </li>
          <li id="debug-search">
            <h2>⌘K 搜索</h2>
            <p className="post-meta">components/command-search.tsx：任何页面按 ⌘K（Windows/Linux 是 Ctrl+K）或点页头的放大镜打开，读真实数据。空着时列出去处和“切换主题”，输入后文章、手记一起搜；↑↓ 选、回车打开、Esc 关</p>
            <OpenSearchButton>打开搜索</OpenSearchButton>
          </li>
          <li id="debug-murmurs">
            <h2>碎碎念</h2>
            <p className="post-meta">murmur-list.tsx 的 MurmurStream（示例数据，不读库）：按天分段、跨年写年份、图片按标题里的宽度显示；以及读取失败与空列表</p>
            <MurmurStream items={sampleMurmurs} name="Sin" />
            <p className="post-list-content" role="alert">碎碎念读取失败。<Link href="/debug">重试</Link></p>
            <p className="post-empty">还没有碎碎念。</p>
          </li>
          <li>
            <h2>评论</h2>
            <p className="post-meta">comments.tsx 的加载占位、读取失败、空列表与关闭状态；comment-form.tsx 的提交结果文案（真实表单见任意文章底部）</p>
            <p className="post-meta" role="status">正在读取评论…</p>
            <p className="post-empty" role="alert">评论读取失败，请稍后刷新。</p>
            <p className="post-empty">还没有评论，来说两句吧。</p>
            <p className="post-meta">评论已关闭。</p>
            <p className="post-meta">站长暂未开放游客评论。</p>
            <p className="post-meta" role="status">评论已发送。站长开启审核时，通过后才会显示；列表约一分钟内更新。</p>
            <p className="post-meta" role="status">悄悄话已发送，只有站长能看到。</p>
            <p className="post-meta" role="alert">网络错误，评论没有发出去，请稍后重试。</p>
            <p className="post-meta">读者登录（reader-session.ts）：未登录显示“用 GitHub 登录 / 或以游客身份填写下方信息”，已登录显示“以 某某 的身份评论 · 退出”并隐藏昵称邮箱网址；关闭游客评论时只显示“用 GitHub 登录后评论”。</p>
          </li>
          <li>
            <h2>评论悬浮窗</h2>
            <p className="post-meta">comment-chat.tsx + comment-chat-panel.tsx（文章侧栏的评论按钮）。下面是示例消息：两天、站长回复在右侧、回复引用、已删除、Markdown；空状态见任意没有评论的文章。输入框是真实表单，目标 ID 全 0，Core 必然拒绝。</p>
            <div className="article-actions debug-chat">
              <CommentChatPanel title="调试页示例文章" total={sampleChat.length} form={{ apiUrl: getApiUrl(), allowGuest: true, providers: [] }} closedReason={null} target={{ refId: "000000000000000000000000", refType: "Post" }}>
                <ChatStream messages={toMessages(sampleChat)} canReply />
              </CommentChatPanel>
            </div>
          </li>
          <li>
            <h2>邮件订阅</h2>
            <p className="post-meta">subscribe-form.tsx（真实组件，提交会请求 Core；后台未开启订阅时 Core 会拒绝）。默认右栏只在后台开启订阅时显示它。</p>
            <SubscribeForm apiUrl={getApiUrl()} types={["post_c", "note_c"]} />
          </li>
          <li>
            <h2>通知 Toast</h2>
            <p className="post-meta">文案来自 lib/notification-copy.ts，只在本页弹出，不走 WebSocket，也不清缓存</p>
            <ToastButtons />
          </li>
          <li>
            <h2>页头夜航岛</h2>
            <p className="post-meta">site-header.tsx：往下滚动后普通页面保持深色导航条，阅读页收成“标题 + 进度环”的胶囊、悬停展开；下面的按钮在岛上播报示例活动（文章发布、修改、删除的通知走这里），连点会排队</p>
            <IslandButtons />
          </li>
          <li id="debug-brand-ticker">
            <h2>页头站名滚动</h2>
            <p className="post-meta">owner-presence.tsx：站长在电脑前时，头像右边的站名停 6 秒后向上滚成“正在用的 App 图标 + 音频条”（没放歌时是几颗安静的点），14 秒后滚回站名；鼠标移到图标上暂停滚动并弹出卡片（左边在用的 App，右边在听的歌）。下面是写死的示例数据，不读 Core</p>
            <BrandTickerPreview avatar={`${getApiUrl()}/objects/avatar/Sin.jpg`} />
          </li>
          <li>
            <h2>文章正文</h2>
            <p className="post-meta">直接使用详情页的 article-body（Markdown + Shiki 高亮）；Lexical 富文本见任意 Lexical 文章</p>
            <ArticleBody text={sampleMarkdown} emptyText="" />
          </li>
          <li>
            <h2>页面切换动画</h2>
            <p className="post-meta">点击左侧任意导航即可看到，样式在 globals.css 末尾的 page-switch</p>
          </li>
        </ul>
      </div>
    </>
  );
}
