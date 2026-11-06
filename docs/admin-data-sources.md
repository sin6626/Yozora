# 后台数据来源对照（2026-11-04）

原则：Core 是唯一的数据来源，后台（mx-admin）是编辑入口，Yozora 只读取和展示。样式、布局、动画和通用界面文案留在前台代码里。

“立即”指 Core 先清掉自己的公开接口缓存，再发 Webhook，前台对应的缓存标签马上失效（2026-11-04 复查后修：原来 Core 自己的接口缓存 15 秒到 10 分钟，前台会重新读回旧值）。Core 的接口缓存键带“缓存代际”（`<键>@<代际>`），清缓存时先把代际加一：之后的读请求都去找新一代的键，清缓存之前就开始的慢请求再晚存进来，也存在旧一代的键下，没人再读到，不会在 Webhook 之后把旧值填回去（2026-11-05）。事件和标签的对照在 `apps/web/lib/webhook-events.ts`，后台 Webhook 要勾上这些事件。没勾的事件只能等缓存自然过期，过期时间写在 `apps/web/lib/blog-data.ts` 各函数里。

## 已统一

| 前台内容 | Core 里的权威字段 | 后台入口 | 前台位置 | 更新 |
|---|---|---|---|---|
| 文章：标题、正文、摘要、分类、标签、置顶 | posts | 文章 | 列表、详情、首页、导航、时间线、RSS | 立即（POST_*） |
| 文章关联阅读 | posts.related | 文章 → 关联阅读 | 详情文末（只列已发布的；Core 的公开接口和推给访客的消息都不带草稿） | 立即（POST_*） |
| 文章版权说明 | posts.copyright（开关）+ 片段 `copyright`（文字） | 文章 → 版权注明；附加功能 → 配置与云函数 | 详情文末 | 立即（POST_* / SNIPPET_*） |
| 手记、心情、天气、回忆项、加密 | notes | 手记 | 列表、详情、首页 | 立即（NOTE_*） |
| 话题：名字、图标、简介、详细描述 | topics | 手记 → 话题 | 手记话题筛选页、导航、详情面包屑 | 立即（TOPIC_*） |
| 分类、页面（标题、副标题、排序） | categories、pages | 分类、页面 | 导航、分类页、页面详情 | 立即 |
| 碎碎念、一言、思考 | murmurs、says、recentlies | 各自菜单 | 各自页面、首页 | 立即 |
| 作品 | projects | 作品 | /projects | 立即（PROJECT_*，2026-11-04 起 Core 才登记） |
| 友链 | links | 友链 | /friends | 立即（LINK_*）；审核通过申请不发事件，最多 5 分钟 |
| 评论（全部主评论和楼中楼） | comments | 评论 | 文末评论区、边读边聊 | 立即（COMMENT_*）；审核通过、置顶最多 1 分钟 |
| AI 摘要、AI 翻译、翻译条目 | ai_summaries、ai_translations、translation_entries | AI | 详情摘要、列表摘要、外文页面 | 立即（AI_SUMMARY_*、TRANSLATION_CREATE/UPDATE/DELETE；在后台手动改、删译文也发，2026-11-05 起）；直接改翻译条目不发事件。译文推给访客前会核对原文是否公开（草稿、加密、定时手记的译文不推） |
| 站名 | options.seo.title | 设置 → SEO → 网站标题 | 页头、浏览器标题、RSS、分享卡片 | 立即（OPTION_UPDATE） |
| 站点描述 | options.seo.description | 设置 → SEO → 网站描述（外文由 AI → i18n 翻译） | 首屏底部、首页标题、meta | 立即 |
| 关键字 | options.seo.keywords | 设置 → SEO → 关键字 | 每个页面的 `<meta name="keywords">`（没填就不输出） | 立即 |
| 网站地址、评论开关、订阅开关、登录方式、友链申请开关 | options | 设置 | sitemap/RSS、评论区、订阅、登录、友链申请 | 立即（OPTION_UPDATE） |
| 站长名字、头像、社交账号与名片 | owner（readers + owner_profiles） | 设置 → 用户 | 首屏、页脚落款、页头头像、导航面板 | 立即（OWNER_UPDATE） |
| 首屏标题与说明 | 片段 theme/yozora 的 `hero`（只写中文） | 附加功能 → 配置与云函数 | 首屏 | 立即（SNIPPET_*） |
| 页脚那句话、萌备号 | 片段 `footer.motto`、`footer.icp` | 同上 | 页脚 | 立即 |
| 页脚星带读谁的账号 | 片段 `accounts.github`、`accounts.leetcode` | 同上 | 页脚星带；`scripts/sync-leetcode.mjs` 也读它，同步的日历记着账号，账号不一致就不用 | 立即 |
| 首页技术栈 | 片段 `techStack`（标题、说明、图标行 `rows`） | 同上 | 首页；`rows` 清空就整块不显示 | 立即 |
| 站点开哪些语言 | options.ai.enableI18n、i18nLanguages（Core 公开 GET /ai/i18n） | 设置 → AI → AI i18n | 语言菜单、地址前缀（proxy.ts）、sitemap、文章语言版本 | 立即（OPTION_UPDATE）；proxy 进程内最多 1 分钟 |
| 外文：界面文字、站点文案（首屏、页脚、技术栈、站点描述、版权说明）、作品名与介绍 | translation_entries（keyPath ui.text / site.text / project.name / project.description）；中文原文：界面文字在 i18n_sources（前台推上去），其余就是上面各项的中文 | AI → i18n（逐条改、清空、生成） | 所有外文页面（Core GET /ai/i18n/:lang 一次给全） | 立即（I18N_UPDATE，后台 Webhook 要勾） |

theme/yozora 片段的格式写在 `apps/web/lib/theme-config.ts` 开头，只写中文，在后台“附加功能 → 配置与云函数”里改（2026-11-05 起删掉了“Yozora 主题”表单和片段里的 `i18n`，原来的手写译文已导入翻译条目，标成手改过）。

读取规则如下：
- 片段读不到时，用代码里的占位（中文）。
- 某一项没写时，也用代码里的占位。
- 某一项写成空字符串、空数组或 null（包括整组写成 null），就是故意不显示，旧值不会冒回来。
- 外文页面每一项按中文原文找 AI i18n 的译文，没有译文（或译文的 `**`、占位符对不上）的那一项显示中文并单独标 zh-CN；首屏说明有一行没译就整段显示中文。

改了中文以后：Core 收到片段、SEO、作品的变更事件，开着 AI i18n 时自动把改过的翻成每种语言；站长手改过的译文会被重翻并标“待看”（needsReview），在 AI → i18n 里看。界面文字的中文在 `apps/web/lib/i18n/messages/zh.ts`，`pnpm dev` 启动时自动推给本地 Core，线上部署前跑 `node scripts/push-i18n-source.mjs --prod`。方案和接口见 `docs/site-text-translation-plan.md`。

检查脚本是 `scripts/verify-site-content.mjs`、`scripts/verify-i18n.mjs`，Core 的 `apps/core/test/src/modules/ai/ai-i18n.service.spec.ts`，后台 `scripts/e2e/admin-i18n.mjs`。

## 仍是例外

- 设置 → 网站里的 API 地址（serverUrl）、Gateway 地址（wsUrl）：前台在浏览器里直连 Core（评论、点赞、登录、实时连接）用的是部署时的环境变量 `MIX_SPACE_API_URL`，没有读这两项。线上这两项现在还指向旧 Shiro 的域名，等正式切换时一起改、再决定要不要让前台读它们。管理后台地址（adminUrl）Core 不对访客公开，前台用不到。
- 思考的结构化卡片（book、media、music、github、link、academic、code）只有 Core 存得下。后台表单和前台卡片都还没做，计划见 `docs/recently-plan.md`；2026-11-06 站长说暂时没有这个需求，以后再说。
- 后台手记的地点和坐标、文章或手记的自定义 meta，前台还没有展示约定。
- 力扣日历 `theme/leetcode-calendar` 由站长 Mac 上的脚本每天写进 Core。它是从力扣同步来的派生数据，不是第二份需要手改的真值。

## 有意留在代码里的

- 界面文案的中文原文 `lib/i18n/messages/zh.ts`（外文由 AI → i18n 翻译），包括：
  - 导航“更多”里四项的说明和“跃迁”链接；
  - 友链页的“海内存知己”；
  - 读取中那句卫星的话；
  - 页脚的“Made with ♥ under the stars”。
- 源码仓库链接。这是 AGPL 对改过的 Core 的要求，跟着代码走。
- 样式、布局、动画、配色的具体颜色值、组件实现。
- 个人资料里的“个人简介”“个人网站”：站长定（2026-11-06）后台用户信息不用全，只要“设置 → 网站”里的信息用全。首屏说明在片段的 `hero.description` 里。
- 默认配色（夜紫）：站长定（2026-11-06）前台有即可，不做成后台设置。
- 访客自己的偏好：语言（Cookie NEXT_LOCALE）、深浅主题和配色（localStorage）。这些不是站点配置。
