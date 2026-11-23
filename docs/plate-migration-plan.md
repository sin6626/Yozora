# 用 Plate 54 换掉 Haklex：计划

> **2026-11-23 暂停**：站长决定等 `plitejs`（Plate 54 的新引擎）出正式版再做，现在 beta 改了不好收拾，先继续用 Haklex。下文的盘点和步骤保留，重启时先核对 Plate 的最新版本和文档有没有变，再从第 0 步试水开始。

2026-11-23 站长定：富文本编辑器从 Innei 的 Haklex（Lexical）全部换成 **Plate 54**（换了编辑器引擎的新版本），只装自己用得到的功能；编辑器做成站长自己维护的包，另外维护一个 Plate 的**实况图插件**。本文取代 [plate-content-plan.md](plate-content-plan.md)（10-22 写、10-23 暂停的旧计划，当时 Plate 还是 Slate 引擎）。

## 已经查清的事实

**Plate 54**（`platejs@54.0.0-beta.2`，2026-11-19 发布；稳定版仍是 53.5.2，基于 Slate）：

- 引擎换成 `plitejs`（“headless-first framework for building rich text editors”），不再用 Slate。
- 所有插件合进一个 `platejs` 包，按子路径引入：`platejs`（引擎与基础块、标记）、`platejs/react`（编辑界面）、`platejs/static`（只读渲染，支持 RSC）、`platejs/markdown`、`platejs/table`、`platejs/math`、`platejs/media`、`platejs/callout`、`platejs/upload`、`platejs/toc`、`platejs/diff`、`platejs/migrations` 等 66 个。没用到的子路径不会进打包。
- 插件本身不带界面；界面组件按 shadcn 的方式**复制进自己的项目、归自己改**（Plate UI）。这正好是“只用需要的功能、自己维护”的做法：选几个插件，界面组件抄过来改成 Yozora 的样式。
- 文档存成带 schema 身份的信封 `{ document: { children, roots?, meta? }, schema: { id, version, fingerprint } }`。应用自己定义**封闭 schema**：不认识的节点类型、属性一律拒绝；改结构时用 `defineDocumentMigrations` 写迁移链。
- Node 里不挂 React 也能用：`createEditor` 读写、校验，`parseMarkdown` / `serializeMarkdown`（`platejs/markdown`），`serializePlainText`。Core 生成 Markdown 版、`pnpm draft` 把 Markdown 转成正文都能用它。
- 前台用 `EditorStatic` 在服务端渲染；交互组件各配一份静态版。
- 自定义节点用 `definePlugin(name, { schema: { element: { void: 'block', … } }, component, formats })`，`formats` 声明这个节点导出 Markdown / 纯文本时长什么样。
- 图片节点原生支持 `width` 和图注，Haklex 做不到的“文章图片按张调大小”（[article-image-size-plan.md](article-image-size-plan.md)）顺带解决。
- 要求 React ≥ 19.2；本仓库前台、后台都是 19.3。

官方文档就在包里：`node_modules/platejs/dist/docs/*.md`（装好后），本文引用的是 `document-model`、`installation/node`、`static`、`markdown`、`plugin`、`media`、`serializing`。

**现在的内容**（2026-11-23 用线上 API 只读统计）：线上 28 篇（文章 14、手记 11、页面 3），其中 12 篇 Markdown、16 篇 Lexical。Lexical 内容里真正用到的：

| 节点 | 用到的篇数 | Plate 54 对应 |
| --- | --- | --- |
| 段落、标题、换行 | 16 / 14 / 6 | 基础块 |
| 列表（无序、有序、待办） | 7 | `list`（扁平列表项，`listType`、`checked`） |
| 表格（表头、合并单元格、列宽） | 3 | `platejs/table` |
| 图片（替代文字、图注、宽高、thumbhash） | 10 | `platejs/media` 的图片 |
| 链接 | 10 | `link` |
| 分割线、引用 | 3 / 7 | 基础块 |
| 代码块（带语言）、旧的 `code` 节点 | 3 / 1 | 代码块 |
| 提示引用 `alert-quote` | 4 | `platejs/callout`（variant） |
| 行内公式、块级公式 | 1 / 1 | `platejs/math` |
| 实况图 `live-photo` | 1 | **自己写的插件** |
| 链接卡片 `link-card` | 1 | 没有对应，见“待你决定” |
| 标签页 `tab` | 1 | 没有对应，见“待你决定” |

文字格式：加粗、斜体、行内代码、下划线、高亮、删除线。

**依赖 Lexical 的地方**：Core 约 30 个文件（保存校验 `helper.lexical.service`、Markdown 投影 `lexical-projection.util`、AI 翻译 `lexical-translation-parser` 与策略、草稿与草稿历史、实况图节点、图片引用、评论、接口出参转换）；后台约 26 个（写作页、`RichEditor.tsx`、草稿恢复与历史对比 `RichDiffBridge.tsx`、翻译详情、Lexical 调试抽屉）；前台约 10 个（`rich-content.tsx`、`article-body.tsx`、`lexical-normalize.ts`、目录、代码块复制）；脚本十几个（`pnpm draft` 的 `markdown-to-lexical`、Haklex 补丁检查等）。Haklex 一共打了 11 个补丁。AI 翻译里存的也是翻译后的 Lexical JSON，迁移时要一起转。

## 两个包

### `packages/editor`（`@yozora/editor`）：站长自己维护的编辑器

只放这个站用得到的功能。对外只露出下面几样，其他代码不直接碰 `platejs`，以后 Plate 升级只改这一个包：

| 入口 | 给谁用 | 内容 |
| --- | --- | --- |
| `@yozora/editor/schema` | Core、脚本、前台（Node 安全，不含 React） | 插件清单、应用 schema（`id: 'yozora'`、版本号）、迁移链；`validate(raw)`、`toMarkdown(doc)`、`fromMarkdown(md)`、`collectMedia(doc)`（图片、实况图地址，给 Core 登记引用）、翻译用的“取出文字 / 写回文字” |
| `@yozora/editor/react` | 后台 | `<YozoraEditor value onChange upload … />`：编辑区、工具栏、斜杠菜单、链接编辑浮层、表格、图片上传与拖宽度、代码块、公式、提示框、实况图 |
| `@yozora/editor/static` | 前台 | `<YozoraContent document />`：服务端渲染正文；标题带 id（目录要用）、代码块走现有 Shiki、KaTeX、图片点开放大 |
| `@yozora/editor/style.css` | 前台、后台 | 正文和编辑区样式，用站点的颜色变量，手记用衬线体 |

界面组件从 Plate UI 抄进 `packages/editor/src/ui/`，改成 Yozora 的样式；不用 shadcn 和 Tailwind（前台没有 Tailwind），按钮、浮层用 Base UI，和站点一致。

### `packages/live-photo`（`@yozora/live-photo`）：Plate 的实况图插件

现在这个包里播放器 `player.ts`、文件处理 `index.ts`/`browser.ts`、样式 `photo.css` 本来就和框架无关，只有 `haklex.ts`（180 行）是 Haklex 适配。改成：

- `@yozora/live-photo/plate`：`LivePhotoPlugin`（`definePlugin`：块级 void 节点，属性 `src`、`videoSrc`、宽高、图注、替代文字；`formats` 导出 Markdown 时写成封面图 + 视频链接，和现在 Core 的投影一致），编辑组件（插入、替换封面或视频，先调 Core 的 `/files/live-photo/normalize/:kind` 转格式再上传，上传函数由使用方传入），静态组件（封面 + 长按播放 + 下载 Motion Photo）。
- 现有的转换接口、6 MB 上限、HEIC/MOV 处理都不变。
- Haklex 适配 `haklex.ts` 在最后一步删掉。

## 数据怎么存

- Core 新增正文格式 `contentFormat: 'plate'`，`content` 存上面的信封 JSON 字符串。Markdown 文章（12 篇）保持 Markdown，不强制转。
- 保存时 Core 用 `@yozora/editor/schema` 校验（先跑迁移链再校验 schema），不合法就 400 并写明哪个节点；草稿照现在的宽松规则（内容合法但有占位链接时照存）。
- `text`（搜索、RSS、摘要、AI 翻译输入都靠它）由 `toMarkdown` 生成。
- 迁移期间 Core 同时认 `lexical` 和 `plate`；后台遇到还没迁移的 Lexical 正文**不让编辑**（提示“请先迁移”），绝不按别的格式保存覆盖它。

## 分步计划

每一步做完都能单独验证，前一步不过不进下一步。

0. **试水（spike）**：锁定 `platejs@54.0.0-beta.2`（精确版本，不写 ^）。三处各跑通一个最小例子：Core（Node 24、ESM）里校验文档 + 生成 Markdown；前台（Next 16.4.2、cacheComponents）服务端用 `EditorStatic` 渲染；后台（Vite + Vue 3，React 挂进 Vue，和现在 `RichEditor.tsx` 一样）挂出能打字的编辑器，试中文输入法和撤销。看打包体积。任何一处走不通就停下来先和站长商量。
1. **`@yozora/editor/schema`**：插件清单、schema、`validate`、`toMarkdown`、`fromMarkdown`、`collectMedia`。检查脚本用一份覆盖所有节点的示例文档：校验通过、Markdown 输出符合预期、坏文档被拒。
2. **实况图插件**：schema 与 Markdown 导出、静态组件、编辑组件。检查：Markdown 投影和现在 Core 的一致；静态组件长按播放（沿用 `scripts/e2e/live-photo.mjs` 的做法）。
3. **Core 支持 `plate`**：写入校验、`text` 生成、图片与实况图引用登记、草稿与草稿历史、AI 翻译的 Plate 策略（取出文字段 → 翻译 → 写回）、接口出参、SDK 类型加 `'plate'`。测试放 `apps/core/test`，同时保证 Lexical、Markdown 原有测试不变。
4. **前台渲染**：`article-body.tsx` 加 `plate` 分支，用 `<YozoraContent>`；目录、代码复制、图片放大、手记衬线、深浅主题都接上。`/debug` 放一份覆盖所有节点的示例；e2e 检查每种节点的结构和样式、目录能跳、无水合报错。
5. **后台编辑器**：写作页（文章、手记、页面）的富文本换成 `<YozoraEditor>`。验收：输入（含中文输入法）、Markdown 快捷输入、粘贴图片上传、拖图片宽度、表格、代码块、公式、实况图插入替换、保存后重新打开一模一样、撤销重做、自动保存草稿、草稿历史对比（先用两版 Markdown 的文字对比，够用就不上 `platejs/diff`）。
6. **转换器 + 本地迁移**：`scripts/migrate-lexical-to-plate.mjs`，Lexical JSON → Plate 信封，按节点对照表逐类转换（文字格式位掩码 → 标记，`alert-quote` → callout，`katex-*` → 公式，表格合并单元格与列宽，图片的宽高与 thumbhash，实况图字段）；没有对应的节点报出来、保留原 JSON、**不静默丢**。默认试运行，逐篇输出报告：节点数前后对比、新旧 Markdown 版的差异、`/debug` 里新旧并排预览。同一个转换器也转 AI 翻译里存的 Lexical 内容和草稿。本地库确认后写入，写入前整库备份。
7. **上线**：先部署能同时认两种格式的 Core、后台、前台；整库备份；用同一个转换器迁移线上 16 篇和它们的译文；逐篇对比线上页面；之后新写的富文本默认 `plate`。
8. **拆掉 Haklex**：删掉前台 Lexical 分支和 `lexical-normalize`、Core 的 Lexical 服务与翻译策略、后台 Haklex 编辑器和调试抽屉、11 个补丁和 `verify-haklex-patches`、`markdown-to-lexical`（`pnpm draft` 改用 `fromMarkdown`）、所有 `@haklex/*` 与 `lexical` 依赖、实况图的 Haklex 适配。最后跑一遍全量 e2e。

## 风险

- **54 还是 beta**：接口可能变。精确锁版本；所有 Plate 调用都关在 `@yozora/editor` 里，升级只改一个包；第 0 步试水就是为了尽早发现走不通的地方。
- **后台是 Vue**：编辑器是 React，要挂进 Vue（现在的 Haklex 也是这么做的，有现成写法）。
- **迁移丢内容**：转换器只报不丢，逐篇对比、先本地后线上、写入前备份，翻译和草稿一起转。
- **前台体积**：正文渲染在服务端，浏览器只拿到 HTML 和少量交互（图片放大、实况图播放），应该比现在 Haklex 渲染器（约 2.3MB JS + 1MB CSS）小很多，第 4 步实测。

## 待你决定（括号里是建议）

1. **标签页 `tab`（1 篇，Shouping 那篇）和链接卡片 `link-card`（1 篇，Plate V1 和 V2 对比）**：自己写插件，还是迁移时转成普通内容？（转成普通内容：标签页拆成小标题分段，链接卡片变成一段链接。以后真想再写这类内容再加插件。）
2. **编辑时要哪些操作方式**：固定工具栏、选中文字浮出的工具栏、斜杠菜单 `/`、Markdown 快捷输入（`## `、`- `、`> `）、拖动块排序。（前四个要，拖动块先不做。）
3. **视频节点**：后台工具栏现在有“Video”，但线上一篇都没用过。（不做。）
4. **包要不要发到 npm**：（先放在仓库里、不发布；哪天别的项目要用再发。）
5. **12 篇 Markdown 文章**：（保持 Markdown，不转。）
6. **用 beta 版的风险**：（接受，按上面的办法兜住。）
