# 手动翻译：不用 AI 接口，把译文写进 Core

站点的英文、日文版本只从 Core 读译文（唯一来源）：

| 内容 | 在 Core 里的位置 | 前台怎么用 |
| --- | --- | --- |
| 文章、手记、页面的标题、正文、摘要、标签 | `ai_translations`（后台“AI 翻译”） | 列表带 `?lang=` 时 Core 直接换进去；详情页读 `getArticleTranslation` |
| 列表里的 AI 摘要 | `ai_summaries`（后台“AI 摘要”） | `getArticleAi(id, lang)`，只读已生成的 |
| 分类名、话题名与介绍、手记心情、天气 | `translation_entries`（后台“AI → 翻译条目”） | 带 `?lang=` 时 Core 换进去；时间线、导航面板等用 `getLocalizedNames` 按 id 查 |
| 站点那句话（SEO 描述）、作品名和介绍 | 配置片段 theme / yozora 的 `i18n` | `getSiteDescription`、`getProjects`（`lib/theme-config.ts` 的 `parseContentTranslations`） |

站长和读者自己写的话（碎碎念、思考、一言、评论、友链介绍）不翻译，外文页面上标 `lang="zh-CN"`。

## 文章、手记、页面：`apps/core/scripts/manual-translation`

用 vitest 跑，但不是测试：借 Core 测试的 swc 和路径别名，直接调用 Core 自己的 Lexical 解析、还原、Markdown 转换和内容哈希，写进去的译文和后台 AI 翻译是同一种数据，Core 会当作有效译文（以原文的修改时间判断新鲜度）。

在 `apps/core` 目录下：

```bash
# 1. 拆出要翻译的片段 → .local/manual-translation/<id>.source.json
MT_MODE=extract MT_IDS=<id>,<id> npx vitest run --config scripts/manual-translation/vitest.config.ts
# 2. 照着 source.json 写 <id>.en.json / <id>.ja.json：
#    { title, subtitle?, summary?, tags?, text?（Markdown 原文时整篇译文）, entries?（Lexical 时，片段 id → 译文）, overrides? }
#    overrides：Core 的提取器不管的字段（图片说明、标签节点、链接卡片描述等），按路径替换，如 { "root.children.45.caption": "…" }
# 3. 写入（已有同语言译文时跳过；MT_FORCE=1 覆盖），写完给订阅了 TRANSLATION_* 的 Webhook 发事件，前台缓存随之失效
MT_MODE=apply MT_IDS=<id> MT_LANGS=en,ja npx vitest run --config scripts/manual-translation/vitest.config.ts
# 其他：check 用库里已有译文核对哈希算法；refresh 给前台发 CONTENT_REFRESH（直接改了库、Core 不发事件时用）
MT_MODE=check MT_IDS=<id> MT_LANGS=en npx vitest run --config scripts/manual-translation/vitest.config.ts
MT_MODE=refresh npx vitest run --config scripts/manual-translation/vitest.config.ts
```

- 默认连本地开发库（Mongo 27018、`shrio-import-20261014`），`MONGO`、`DB` 环境变量可改；写线上前先确认。
- `aiModel` 记为 `claude-opus-5-5`、`aiProvider` 记为 `manual`（`MT_MODEL` 可改），详情页的“由 AI 翻译”说明会显示这个模型名。
- 有的 Lexical 文章含 Core 转换器不认识的旧节点，`lexicalToMarkdown` 会拒绝整篇（后台 AI 翻译同样会失败）；工具这时把 `text` 退回成按块拼的纯文本，正文仍用 `content`，不受影响。
- 工作文件放在 `.local/manual-translation/`（不进 git）。

## 翻译条目、AI 摘要

没有“新建翻译条目”的接口（只能 AI 生成或修改已有的），缺的条目直接写 Mongo 的 `translation_entries`：分类、话题按实体（`keyType: "entity"`，`lookupKey` 是分类/话题 id），心情、天气按词典（`keyType: "dict"`，`lookupKey` 是原文去空白小写后的 sha256）。改完用上面的 `refresh` 让前台缓存失效；后台“翻译条目”页之后也能改。

AI 摘要在 `ai_summaries`，按 `refId` + `lang` 一条；有过 AI 把日文摘要写成中文的情况（2026-10-30 修了 6 篇，原文备份在 `.local/backups/ai-summaries-ja-20261030.json`）。

## 2026-10-30 这次写入了什么

- 文章：富文本组件对照（英、日）、FRP + Vite 踩坑记录（英，覆盖了过期的旧译文）、第一次面试的心得（日）；手记：2026 年 4 月 18 号建站第一天（英、日）。累有感已有有效的 AI 译文，没动。
- 分类“瞎扯淡”：英 Ramblings、日 雑談。
- 配置片段 yozora 的 `i18n`：站点那句话、两个作品（改前备份 `.local/backups/snippet-sin-space-20261030.json`）。
- 6 篇日文 AI 摘要改成真正的日文。
- 本地 Webhook 订阅加上 TRANSLATION_CREATE、TRANSLATION_UPDATE（共 30 个事件）。
