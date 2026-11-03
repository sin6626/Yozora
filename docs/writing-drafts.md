# 在本地写文章、手记，直接存进后台草稿箱

`pnpm draft` 把一个 Markdown 文件转成后台编辑器原生的富文本，本机图片先上传到图床，然后存进后台草稿箱。
站长在后台打开草稿，确认后自己发布。脚本只建草稿、改草稿，不会发布。

```bash
pnpm draft .local/writing/某篇.md            # 写进本地后台
pnpm draft .local/writing/某篇.md --dry-run  # 只转换和检查，打印结果，不上传、不写入
pnpm draft .local/writing/某篇.md --prod     # 写进线上后台（需要先配好 prod）
```

线上 Core 是生产模式，接口挂在 `/api/v2` 下，`api` 要带上这个前缀（本地开发模式没有）。

成功后会打印后台编辑页链接（`后台地址/#/posts/edit?draftId=…` 或 `#/notes/edit?draftId=…`），点开就是编辑器。

## 令牌配置

脚本通过 Core 接口写入，用后台的 API Token 鉴权（请求头 `x-api-key`），本地和线上只是地址和令牌不同。
配置放在 `.local/publish.json`（`.local/` 不进 git），文件权限 600：

```json
{
  "local": { "api": "http://127.0.0.1:2333", "admin": "http://127.0.0.1:9528", "token": "txo…" },
  "prod": { "api": "https://api.sin6626.me/api/v2", "admin": "https://api.sin6626.me/proxy/qaqdmin", "token": "txo…" }
}
```

令牌在后台 **设置 → 账户 → API Token** 里创建，可以设过期时间，丢了就在那里作废。
它等同于站长身份，能改后台的一切，不要贴进聊天或提交进 git。
本地的“本地写草稿脚本”令牌是 2026-10-29 直接写进本地库创建的；线上令牌由站长自己创建并填写。

## 文件格式

开头用 `---` 包起来的 YAML 写元数据，后面是 Markdown 正文。文章稿件习惯放在 `.local/writing/`。

```markdown
---
type: note            # post（文章）或 note（手记）
title: 标题
# 文章：slug、category 必填；tags、summary 可选
slug: my-post
category: 学习与感悟   # 分类名或 slug
tags: [前端, 博客]
summary: 一句话摘要
# 手记：都可选
topic: 生活           # 话题名或 slug
mood: 开心
weather: 晴
location: 学校
gallery: grid         # 多图相册的布局：grid / masonry / carousel
---
正文……
```

运行成功后脚本会在元数据里写回 `drafts: { local: 草稿ID }`（线上是 `prod`）。之后再运行就是更新同一份草稿，后台保留每次的历史版本。
草稿在后台被删了，脚本会提示并新建一份。

后台编辑器开着时每 10 秒会把它手里的内容存回去，和脚本互相覆盖。脚本在 `.local/publish/draft-versions.json` 记住自己上次写入后的版本号，
下次写之前草稿版本对不上（期间编辑器存过），就停下并提示；先关掉编辑器再写，确认要用文件内容覆盖时加 `--force`。

## 按章节分段保存（站长 2026-10-29 定）

后台编辑器写作时每 10 秒自动存一版，草稿箱会留下完整的写作过程；脚本一次存整篇只有 v1。
所以 Agent 写文章时按真实进度分段保存：先写元数据和开头存一次，之后每写完一节就把这一节追加进文件、再运行一次，
草稿箱的版本列表里能看到文章一节节长出来。之后按站长意见修改，每改一轮也存一次。
不要为了“看起来像”把写好的全文拆开分批存，历史版本要对应真实的写作和修改。

## 正文支持的写法

| Markdown | 后台节点 |
| --- | --- |
| `## 标题`、段落、`**粗**`、`*斜*`、`~~删~~`、`` `码` ``、链接 | heading / paragraph / text / link |
| 列表、嵌套列表、`- [x]` 复选列表 | list / listitem |
| `> 引用` | quote |
| `> [!NOTE]`（还有 TIP、IMPORTANT、WARNING、CAUTION） | alert-quote |
| 代码块 | code-block |
| `---` | horizontalrule |
| GFM 表格（第一行是表头） | table |
| `![说明](./图.png "图片标题")` 单独一段 | image（标题作为图片说明） |
| 一段里连着放多张图 | gallery |
| `++下划线++`、`==高亮==`（可以和粗斜体叠用，如 `++*文字*++`） | 文字格式 underline / highlight |
| `\|\|剧透\|\|` | spoiler（点开才显示） |
| `::: note` … `:::`（还有 tip、important、warning、caution） | banner 横幅 |
| `::: details 标题` … `:::`，加 `open` 默认展开（也认 `::: details{summary="标题" open}`） | details 折叠块，里面可以嵌套别的块 |
| `[^1]` 引用 + 文末 `[^1]: 说明` | footnote + 文末 footnote-section |
| 单独一行的裸网址 `<https://…>` | link-card，脚本自动抓网页标题与描述 |

这些扩展写法是 Haklex 自己的 Markdown 方言（Core 生成纯文本字段用的也是它），高亮除外。落单的 `++`、`==`、`||` 按原文字保留。
不认识的块会直接报错并给出行号，不会生成坏数据。

## 图片

- 本机路径（相对路径以 Markdown 文件所在目录为准）会上传到后台配置的图床（Core 的 `POST /files/upload?type=image`），本地开发上传到图床的 `dev/年/月/` 下。
- 网址图片原样引用，只下载下来算宽高。
- 每张图都会算宽高和 thumbhash（加载前的模糊占位），算法与后台编辑器插图时一致；手机照片按 EXIF 方向转正。
- 上传过的图按“目标 + 文件内容哈希”记在 `.local/publish/uploads.json`，重跑不重复上传；缓存的地址失效了会重新上传。
- HEIC 浏览器显示不了，需要先导出成 JPG/PNG。
- Core 每小时清理一次超过 60 分钟还没被任何内容引用的图片；草稿保存时会把正文里的图片标记为已引用，所以脚本总是“上传完立刻写草稿”。
- 在聊天里发给 Agent 的图片是临时文件，要先复制到 `.local/writing/images/` 再引用，否则以后重跑会找不到。

## 相关代码

- `scripts/lib/markdown-to-lexical.mjs`：纯转换，Markdown 语法树按对照表生成节点，最后用 Core 同款 `allHeadlessNodes` 重新加载校验。
- `scripts/write-draft.mjs`：命令行，负责元数据、图片上传、分类/话题换算和草稿接口。
- `scripts/verify-markdown-to-lexical.mjs`：转换检查（`pnpm verify`）。
- 以后 Core 升到 v13 以上，接口格式会变（V3、Snowflake ID），这个脚本要跟着改，或者改用上游的 `mxs`。
