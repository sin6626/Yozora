# 速记（思考）引用与卡片补全计划

> 2026-10-29：速记在前后台都改名“思考”，前台 /thinking 挪进导航“更多”。站长原来写在速记里的纯文字闲话已复制到独立的“碎碎念”模块（见 docs/murmur-plan.md），思考回到 Innei 原意：引用网站、书、歌或站内文章，写下看法。

状态：前台、后台编辑、Core 引用修复都已做（2026-11-12，见文末），只在本地，线上要等部署 Core、后台、前台。

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

## 2026-11-12 Core 引用修复与后台编辑器

**Core（原版就有的问题，先写了失败的测试：apps/core/test/src/modules/recently/recently-ref.e2e-spec.ts，7 项）**

- 引用根本存不进去：校验只收 `ref`，保存却读 `refId`，永远是空；编辑时完全不管引用。现在 `ref`（旧名 `refId` 也认）在新建和编辑时都按 id 查出是文章、手记还是页面（别的一律拒绝，`RefModelNotFound`），编辑是整条替换：没带引用就清掉，换成纯文字就清掉卡片信息（`$unset`）。
- 泄露：列表、单条、`/recently/all` 原来直接读集合，只删了正文和密码，被引用文档的其余字段（手记的位置、坐标等）都给访客；“最新一条”和新建/编辑后的实时推送用 populate，连富文本 `content` 都带上；也不看是否公开。现在统一用 `RecentlyService.attachRefs`：只给 id、标题、slug、nid、分类 id、创建时间；访客只看到公开的（文章已发布；手记已发布、无密码、不是定时；页面都算），否则引用和引用类型都清空；登录的站长（`@IsAuthenticated`）看得到未公开内容的标题。实时推送用访客版本，返回给后台的是站长版本。
- 库里 `refType` 存集合名（posts / notes / pages，Core 一直这样存），返回时换成 SDK 约定的 Post / Note / Page；前台 `getRecently` 原来读 `category` 拿不到文章的分类，改读 `categoryId`。

**后台（apps/admin）**

- `components/shorthand/index.tsx`：新建和编辑共用一个对话框：类型（纯文字、书、影视、音乐、GitHub、网页、论文、题目）、看法（纯文字时必填）、按类型的字段（两列，只有必填项带红星）、“引用站内内容”（输入关键词搜文章和手记，页面取一次列表在本地筛，可清空）。缺必填项或格式不对时提示第一项、不发请求；链接失焦时自动补 GitHub 的所有者和仓库、arXiv 编号、力扣平台名（空着的才补）。
- 规则在 `components/shorthand/thinking-form.ts`（字段表、表单 ⇄ 请求体、校验、自动补全、列表摘要），检查 `scripts/verify-admin-thinking-form.mjs`（pnpm verify）。
- 列表每条显示卡片摘要（如“书｜《被讨厌的勇气》 · 岸见一郎”，点开原链接）和引用（点开后台对应的编辑页）；“新建思考”按钮原来没有读屏名字（传的是 aria-label，按钮组件只认 name），已修。
- 浏览器测试 `scripts/e2e/admin-thinking.mjs`（新建、修改在浏览器里拦下，不写库；搜索走真实 Core 只读接口），截图 `.local/previews/admin-thinking/`。前台 `scripts/e2e/thinking.mjs` 加了真实数据一段：往本地库直接插两条临时思考（书 + 引用文章 Zod；影视 + 引用不存在的手记），看卡片、站内链接、原名字段，跑完删掉。

线上要等部署：Core（引用修复）、后台（编辑器）、前台（星图注记）一起换。
