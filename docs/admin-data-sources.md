# 后台数据来源对照（2026-11-04）

原则：Core 是唯一的数据来源，后台（mx-admin）是编辑入口，Yozora 只读取和展示。样式、布局、动画和通用界面文案留在前台代码里。

“立即”指 Core 发 Webhook，前台对应的缓存标签马上失效。事件和标签的对照在 `apps/web/lib/webhook-events.ts`，后台 Webhook 要勾上这些事件。没勾的事件只能等缓存自然过期，过期时间写在 `apps/web/lib/blog-data.ts` 各函数里。

## 已统一

| 前台内容 | Core 里的权威字段 | 后台入口 | 前台位置 | 更新 |
|---|---|---|---|---|
| 文章：标题、正文、摘要、分类、标签、置顶 | posts | 文章 | 列表、详情、首页、导航、时间线、RSS | 立即（POST_*） |
| 文章关联阅读 | posts.related | 文章 → 关联阅读 | 详情文末（只列已发布的） | 立即（POST_*） |
| 文章版权说明 | posts.copyright（开关）+ 片段 `copyright`（文字） | 文章 → 版权注明；配置与云函数 → theme/sin-space | 详情文末 | 立即（POST_* / SNIPPET_*） |
| 手记、心情、天气、回忆项、加密 | notes | 手记 | 列表、详情、首页 | 立即（NOTE_*） |
| 话题：名字、图标、简介、详细描述 | topics | 手记 → 话题 | 手记话题筛选页、导航、详情面包屑 | 立即（TOPIC_*） |
| 分类、页面（标题、副标题、排序） | categories、pages | 分类、页面 | 导航、分类页、页面详情 | 立即 |
| 碎碎念、一言、思考 | murmurs、says、recentlies | 各自菜单 | 各自页面、首页 | 立即 |
| 作品 | projects | 作品 | /projects | 立即（PROJECT_*，2026-11-04 起 Core 才登记） |
| 友链 | links | 友链 | /friends | 立即（LINK_*）；审核通过申请不发事件，最多 5 分钟 |
| 评论（全部主评论和楼中楼） | comments | 评论 | 文末评论区、边读边聊 | 立即（COMMENT_*）；审核通过、置顶最多 1 分钟 |
| AI 摘要、AI 翻译、翻译条目 | ai_summaries、ai_translations、translation_entries | AI | 详情摘要、列表摘要、外文页面 | 立即（AI_SUMMARY_*、TRANSLATION_*）；直接改翻译条目不发事件 |
| 站名 | options.seo.title | 设置 → SEO → 网站标题 | 页头、浏览器标题、RSS、分享卡片 | 立即（OPTION_UPDATE） |
| 站点描述 | options.seo.description（外文在片段 `i18n.<lang>.siteDescription`） | 设置 → SEO → 网站描述 | 首屏底部、首页标题、meta | 立即 |
| 网站地址、评论开关、订阅开关、登录方式、友链申请开关 | options | 设置 | sitemap/RSS、评论区、订阅、登录、友链申请 | 立即（OPTION_UPDATE） |
| 站长名字、头像、社交账号与名片 | owner（readers + owner_profiles） | 设置 → 用户 | 首屏、页脚落款、页头头像、导航面板 | 立即（OWNER_UPDATE） |
| 首屏标题与说明 | 片段 theme/sin-space 的 `hero` | 配置与云函数 → theme/sin-space | 首屏 | 立即（SNIPPET_*） |
| 页脚那句话、萌备号 | 片段 `footer.motto`、`footer.icp` | 同上 | 页脚 | 立即 |
| 页脚星带读谁的账号 | 片段 `accounts.github`、`accounts.leetcode` | 同上 | 页脚星带；`scripts/sync-leetcode.mjs` 也读它 | 立即 |
| 首页技术栈 | 片段 `techStack` | 同上 | 首页 | 立即 |
| 作品名与介绍的外文版 | 片段 `i18n.<lang>.projects` | 同上 | 外文作品页 | 立即 |

theme/sin-space 片段的格式写在 `apps/web/lib/theme-config.ts` 开头。外文版本放在 `i18n.en`、`i18n.ja` 下面。

读取规则如下：
- 片段读不到时，用代码里的占位。
- 某一项没写时，也用代码里的占位。
- 某一项写成空字符串、空数组或 null，就是故意不显示，旧值不会冒回来。

检查脚本是 `scripts/verify-site-content.mjs`。

## 仍是例外

- 个人资料里的“个人简介”“个人网站”和 SEO 关键词，后台能填，前台还没用。首屏说明按站长的选择放在片段的 `hero.description` 里，没有和个人简介合并。
- 思考的结构化卡片（book、media、music、github、link、academic、code）只有 Core 存得下。后台表单和前台卡片都还没做，计划见 `docs/recently-plan.md`。
- 后台手记的地点和坐标、文章或手记的自定义 meta，前台还没有展示约定。
- 力扣日历 `theme/leetcode-calendar` 由站长 Mac 上的脚本每天写进 Core。它是从力扣同步来的派生数据，不是第二份需要手改的真值。
- 默认配色（夜紫）写在前台代码里。访客可以自己换配色，但还没有“站长设定的默认配色”这一项。

## 有意留在代码里的

- 界面文案词典 `lib/i18n/messages`，包括：
  - 导航“更多”里四项的说明和“跃迁”链接；
  - 友链页的“海内存知己”；
  - 读取中那句卫星的话；
  - 页脚的“Made with ♥ under the stars”。
- 源码仓库链接。这是 AGPL 对改过的 Core 的要求，跟着代码走。
- 样式、布局、动画、配色的具体颜色值、组件实现。
- 访客自己的偏好：语言（Cookie NEXT_LOCALE）、深浅主题和配色（localStorage）。这些不是站点配置。
