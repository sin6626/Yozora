# Plate 富文本接入与旧内容迁移计划

> 2026-11-23 已被 [plate-migration-plan.md](plate-migration-plan.md) 取代（改用 Plate 54、自己维护编辑器包与实况图插件）。下文只作历史记录。

> 2026-10-23 暂停：用户决定先用 Lexical（与后台同版 Haklex 0.0.85 渲染器），Plate 等博客完成后再评估。下文盘点结果保留，未进入第二步。

2026-10-22。用户已决定未来使用 Plate，不继续以 Lexical 作为新富文本方案。本文是待逐步实施的计划，本轮只实现 Markdown 阅读，不安装 Plate、不修改后台、不转换数据库。

## 当前事实与本轮边界

- Core 当前只接受 `markdown`、`lexical` 两种 `contentFormat`，见 `apps/core/src/shared/types/content-format.type.ts` 和写入 schema。
- 旧后台的富文本入口仍基于 Haklex/Lexical。仅替换公开页渲染器，不能让后台自动产生 Plate 文档。
- 本地公开文章当前有 7 篇 Markdown、6 篇 Lexical。Lexical 文章已有后端生成的 `text` 阅读副本；原始 `content` JSON 保留。
- 本轮详情页使用 `react-markdown` + `remark-gfm` 展示 `text`。原始 Markdown 支持标题、列表、引用、代码、链接、图片和 GFM 表格。原始 HTML/脚本不执行；公式、Mermaid、白板和自定义富文本卡片暂不实现。
- Lexical 文章暂以已有 Markdown 副本提供简化阅读，不声称复杂块完整还原。不从浏览器发起格式转换或保存。

## 目标实现方式

| 部分 | 方案 | 原因 |
| --- | --- | --- |
| 新富文本数据 | 版本化 Plate JSON，独立声明 `contentFormat: 'plate'` | 不把 Slate/Plate 数据冒充 Lexical，也不依赖 Markdown 无损保存全部结构 |
| 公共阅读 | `PlateStatic` + 选定基础插件对应的静态组件 | 官方支持 RSC/SSR，阅读页无需挂载完整编辑器 |
| 编辑入口 | 后续单独选择：在旧 mx-admin 替换已有 React 富文本入口，或建设独立写作页 | 当前用户只授权公共阅读，不能顺带重做后台 |
| Markdown | 保留原字符串；未来按需使用 `@platejs/markdown` 导入/导出 | 仍可独立发布 Markdown，不强制迁移所有文章 |
| 共用协议 | 真正开始接入时建立 `packages/content`，仅共享 schema、格式版本和必要的纯转换 | 避免后台、Core、阅读器各自猜测节点结构；本轮不建空包 |

建议 Plate 的 `content` 采用版本化封装，例如 `{ schemaVersion: 1, value: [...] }`，外层是否继续使用当前字符串字段在 API 方案评审时确定。节点名和属性以最终锁定的 Plate 插件版本为准，不直接照搬示例。

## 必须一起调整的协议

未来新增 Plate 格式时，需同步更新：Core 写入校验和模型、SDK 正文类型、正文投影、图片提取、内容哈希、搜索/RSS/摘要与翻译输入、编辑器保存/加载、公开页渲染。`text` 可保留为派生阅读/搜索副本，但不能成为复杂 Plate 文档的唯一存档。

旧后台识别不了 `plate` 时必须明确阻止编辑该格式，不能按 Markdown 或 Lexical 保存并覆盖它。只有新写入、重新读取与公开展示闭环通过，才能把 Plate 设为新富文本默认格式。

## 旧内容的迁移方式

不采用“Lexical → Markdown → Plate”作为无损迁移方案。Markdown 可以导入普通文本内容，但会丢失部分自定义块、布局和标识。

1. 先做只读盘点，列出实际节点类型、出现次数、嵌套关系与媒体引用，不修改原文。
2. 在离线副本建立 Lexical JSON → Plate JSON 的显式转换器。基础段落、标题、文本样式、链接、引用、代码和图片逐类验证。
3. 列表、表格、合并单元格按选定 Plate 插件的真实 schema 转换，不假定节点格式。代码语言、图片替代文本、链接属性与可保留的块 ID 都需有断言。
4. 折叠、提示块、分栏、嵌套文档、链接卡片、视频、推文、公式、Mermaid、白板等列入扩展映射表。没实现的类型报告为“不支持”，保留原 JSON，禁止静默丢弃。
5. 输出逐篇转换报告和并排预览，由用户确认后，才选择小批文章写入。迁移记录保存原版本、目标版本、原始内容快照及哈希，以便精确恢复。

不在启动、读取文章或打开编辑器时自动迁移。当前简化阅读只是一种临时展示，不等于迁移完成。

## 小步实施顺序与验收

- [x] 盘点旧节点与扩展组件（2026-10-23，只读，见 [Lexical 内容盘点](./plate-lexical-inventory.md)，可用 `node scripts/inventory-lexical.mjs` 重新生成）。第一批范围待用户确认：
  - 13 篇 Lexical 内容（文章 6、手记 6、页面 1）共 39 种节点；其中 18 种只出现在演示文章《富文本组件对照》里。
  - **建议第一批**（真实内容用到的 21 种）：段落、标题 h1–h6、换行、无序/有序/待办列表、链接、图片（含 alt/caption/尺寸/thumbhash）、分割线、引用、提示引用 `alert-quote`、表格（合并单元格、表头、列宽）、代码 `code` 与 `code-block`（css/js/ts/tsx/vue/python）、行内与块级公式 KaTeX、标签页 `tab`、链接卡片 `link-card`；文本格式以行内代码、加粗、斜体、下划线为主。
  - **建议后置**（只在演示文章出现的 18 种）：banner、gallery、details、autolink、video、code-snippet、mermaid、nested-doc、grid-container、excalidraw、ruby、spoiler、tag、comment、mention、embed、footnote、footnote-section。转换时报告为“不支持”并保留原 JSON。
  - 图片全部来自本地 Core（`127.0.0.1:2333`），迁移和部署时需处理媒体域名。
- [ ] 锁定 Plate 版本，用少量合成文档验证 `PlateStatic`；先覆盖文本、代码、图片和表格，不接真实写入。
- [ ] 评审并扩展 Core/SDK 的 Plate 协议，确保现有 Markdown/Lexical 读取不回归。
- [ ] 单独确定编辑入口，验证输入、中文输入法、保存重载、撤销重做与图片上传。
- [ ] 在离线副本验证转换器，逐篇检查正文、节点数量、媒体引用和不支持节点报告。
- [ ] 用户确认后小批迁移，验证失败恢复；最后再决定何时停止旧格式写入与移除旧依赖。

验收不能只有截图：需包含序列化/反序列化一致性、关键节点结构、阅读顺序、键盘与窄屏显示。真实数据库迁移和后台替换属于后续独立授权事项。

## 官方参考

- [Plate Static Rendering](https://platejs.org/docs/static)：`PlateStatic` 的只读 RSC/SSR 使用方式。
- [Plate Markdown](https://platejs.org/docs/markdown)：Markdown 与 Plate 的转换、插件规则；官方也建议纯 Markdown 展示可直接用 react-markdown。
- [Plate Editor Configuration](https://platejs.org/docs/editor)：文档 value 与插件配置。
