# 速记（思考）引用与卡片补全计划

> 2026-10-29：速记在前后台都改名“思考”，前台 /thinking 挪进导航“更多”。站长原来写在速记里的纯文字闲话已复制到独立的“碎碎念”模块（见 docs/murmur-plan.md），思考回到 Innei 原意：引用网站、书、歌或站内文章，写下看法。

状态：前台已做（2026-11-12，见文末），后台编辑与 Core 引用的隐私修复待做（2026-10-24 记录，用户确认后续必须补上）。

## 现状

- Core 已支持（`apps/core/src/modules/recently/recently.schema.ts`）：
  - **引用**：`refId` + `refType`（Post / Note / Page），一条速记可以关联站内一篇文章、手记或页面。
  - **卡片类型**：`type` 为 text、book、media、music、github、link、academic、code，`metadata` 按类型校验（书：标题/作者/封面/评分/ISBN；影视：标题/原名/封面/评分/类型；音乐：标题/歌手/专辑/封面；GitHub：仓库/描述/星标/语言；链接：标题/描述/图片；论文：标题/作者/arXiv；代码题：标题/难度/标签/平台）。
- 后台（`apps/admin/src/components/shorthand`）：新建/编辑只有一个文本框，不能选引用，也不能选类型、填卡片信息。应是上游 Innei 预留的坑位，后台界面还没实现。
- 前台（`apps/web/components/thinking-list.tsx`）：显示 Markdown 正文；引用已能拼出“引用：xxx”链接（文章用分类 id 换算 slug），但因后台无法设置引用，尚未用真实数据验证；卡片完全没做。
- Core 引用填充的隐私问题已修（c9172bf：不再返回被引用文档的正文与手记密码）。

## 待做

1. 后台速记编辑：增加“引用”选择（搜索文章/手记/页面）和“类型”切换，按类型显示对应的元数据表单。
2. 前台思考页：按类型渲染卡片（封面、标题、副信息、外链），外部图片与链接沿用 lib/safe-url.ts 只放行 http(s)；引用链接用真实数据验证。
3. 卡片样式等设计系统确定后统一做，在 /debug 加各类型卡片的展示。
4. 可选：点赞/点踩、评论（涉及访客提交，和评论功能一起考虑）。

## 2026-11-12 前台已做：星图注记

站长在三种候选（页边批注 / 星图注记 / 书签卡）里选了星图注记。线上思考当时是 0 条，本地 24 条都是迁到碎碎念之前的纯文字副本。

- `apps/web/components/thinking-list.tsx` 的 `ThinkingLog`：和首页时间线同一条星座线，每条一颗月光色小星；日期、看法（Markdown，霞鹜文楷）、引用卡片、一排小图标（赞、踩、评论，数字为 0 只有图标）。点评论才展开这条的评论区（`thinking-foot.tsx`，`aria-expanded` 的按钮 + `hidden` 的区域，评论区仍在服务端渲染）。空列表是一颗空心的星和一句话。样式 `thinking.css`。
- `thinking-quote.tsx`：八种卡片（书、影视、音乐、GitHub、网页、论文、题目，以及站内文章/手记/页面），像票根挂在看法下面；外部的新标签页打开（noopener），封面图不带来源（豆瓣防盗链），叠在画出来的封面上，图坏了只露出画的书或碟。
- 数据：`getRecently` 多返回 `quote`，由 `lib/thinking.ts` 的 `parseQuote` 整理（地址只放行 http(s)、必填项缺了不显示、评分 0–10、星标非负整数、语言色只收 #十六进制、难度换成 1–3 档），检查 `scripts/verify-thinking.mjs`。
- `/debug` 的“思考”用示例数据摆出全部卡片和空列表；浏览器回归测试 `scripts/e2e/thinking.mjs`（投票拦下请求换假响应，不写库）。截图 `.local/previews/thinking/`。

## 下一步（做后台之前必须先修 Core）

1. **Core 引用填充会漏未公开内容**：`recently.service.ts` 的 `populateRef` 直接读集合，只删了 text/content/password，被引用的文档其余字段（手记的 location、coordinates 等）原样给访客，而且不看文章是否发布、手记是否加密或定时。现在后台不能设引用，所以还没有真实泄露；后台加上“选引用”之前要改成：访客只拿到 id、标题、slug、nid、分类 id，且只有公开的内容才填，先写失败的测试。
2. 后台思考编辑：选类型、按类型填卡片信息，选站内引用（搜索文章/手记/页面）。
