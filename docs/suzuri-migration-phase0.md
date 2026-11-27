# 接入 @suzuri/editor：阶段 0 摸底报告

2026-11-27，分支 `sin6626/suzuri-migration`（92cfa19，比 main 6c95d0f 少 6 个视频/文档提交，与编辑器无关）。只读调研，没有改业务代码。取代 [plate-migration-plan.md](plate-migration-plan.md) 里的“自己写 `@yozora/editor`”：编辑器改由 Suzuri 仓库的 `@suzuri/editor` 提供，Yozora 只做接入。

## 1. @suzuri/editor 实际导出（0.1.0，platejs 54.0.0-beta.5 精确锁定）

tarball 已在 `/Users/sin/.orca/bots/x/scratch/suzuri-packs/suzuri-editor-0.1.0.tgz`（11-27 19:33），内容与 Suzuri `packages/editor/dist` 一致。ESM-only（exports 只有 `import` 条件），`sideEffects` 只有 style.css。

| 入口 | 导出 |
| --- | --- |
| `/schema`（Node 安全） | `validateDocument(raw, { schema, extensions, migrations, requireEnvelope })`、`toMarkdown`、`fromMarkdown`、`toPlainText`、`collectMedia`（image + livePhoto + 扩展）、`extractHeadings` / `slugifyHeading`、`extractTranslatableSegments` / `applyTranslatedSegments`、`createEnvelope`、`getSchemaIdentity`、`normalizeToDocumentValue`、`createSuzuriHeadlessEditor`、`BaseLivePhotoPlugin` / `isSafeLivePhotoUrl` / `LIVE_PHOTO_TYPE='livePhoto'`、各 Base 插件、`SUZURI_DEFAULT_SCHEMA = { id: 'suzuri', version: 1 }` |
| `/static` | `<SuzuriContent document schema extensions font renderCodeBlock renderImage renderLivePhoto className />`（同步组件，无 `'use client'`）、`renderSuzuriHtml()` |
| `/react`（`'use client'`，单个 327KB chunk） | `<SuzuriEditor initialValue documentKey schema extensions readOnly placeholder font variant showToolbar toolbarRight enableDnd onUploadImage onUploadLivePhoto onChange({document, envelope}) />`、工具栏组件、`insertLivePhoto`、`bindLivePhoto` |
| `/style.css` | Tailwind v4 预编译，66KB |

节点：段落、H1–H6、引用、分割线、链接、缩进、列表（含待办）、代码块、6 种行内标记、表格（`columnWidths`、合并单元格）、图片（`url`、`alt`、`width`、`thumbhash`，图注是 children）、实况图 `livePhoto`（`url`、`videoUrl`、`alt`、`width`、`naturalWidth/Height`、`thumbhash`、`align`，图注是 children）、callout（`variant`、`icon`、`backgroundColor`）、行内/块级公式。

## 2. 需要 Suzuri 侧补的东西（按严重程度）

1. **style.css 会污染宿主（阻塞）**。产物里有完整 Tailwind preflight（`@layer base`：`*{margin:0;padding:0;border:0 solid}`、`ol,ul{list-style:none}`、标题字号继承等），还有**不在 layer 里**的 `:root{--background --foreground --primary --border --ring --muted-foreground …}` 和 `.dark,[data-theme=dark]{…}`，`@layer theme` 里还有 `:root{--font-serif…}`。Yozora 的 `globals.css` 正好用同名变量（`--background`、`--foreground`、`--primary`、`--border`、`--ring`、`--muted-foreground`、`--font-serif`），也是非 layer 的 `:root`，且 `<html data-theme>` 也是这个属性，引入后谁覆盖谁取决于加载顺序，整站配色会被换成 Plate 的中性灰（前台本身已经 `@import "tailwindcss"`，preflight 重复但无害）；后台（Naive UI + UnoCSS）则会被 preflight 改掉默认样式。需要：设计变量改成 `--suzuri-*` 并回退到宿主变量（或只写在编辑器根类名上，不写 `:root` / `[data-theme]`）；preflight 可选或限定在编辑器根类名内。备选：前台已有 Tailwind v4，可以不引 style.css，改为 `@source` 扫 Suzuri 的 dist 自己编译类名，但这样变量默认值仍要 Suzuri 提供一份不带 `:root` 的版本。
2. **schema 指纹漂移没有出路**。`validateDocument` 对信封要求 `id/version/fingerprint` 三者完全相等，否则直接拒绝（除非传迁移链）。指纹由插件编译结果决定，Suzuri 升级、Plate beta 升级、Yozora 加扩展都会变，库里所有已存文档在 Core 端（AI 翻译写回、重新生成 text、迁移脚本）就会全部校验失败。需要：同 `id`+`version`、只有指纹不同时，按当前 schema 重新 `assertDocument` 并盖上新指纹（或提供 `restamp`/`lenient` 选项）。
3. **`bindLivePhoto` 只在 `/react`**。前台只读页面的实况图播放是一个小客户端组件，从 `/react` 引入会把整个 327KB 编辑器 chunk 拉进浏览器（`'use client'` 入口、单文件 chunk，不能指望摇树）。需要一个轻量子路径（如 `./live-photo-player`，或从 `/static` 导出）。
4. **翻译抽取不跳过行内代码**。`extractTranslatableSegments` 只按块类型跳过（代码块、公式、分割线），带 `code: true` 标记的文字会被送去翻译；现有 Lexical 策略跳过 `FORMAT_CODE`。也不抽图片/实况图的 `alt`（Lexical 策略同样不抽，非阻塞）。另外 `applyTranslatedSegments` 内部用默认 schema 重新校验，Yozora 若改 schema id 必须记得传 options。
5. **没有 KaTeX 样式**。style.css 里没有 KaTeX 的 CSS 和字体（Haklex 的 CSS 内嵌了），宿主要自己引 `katex/dist/katex.min.css`；可以在 README 写明，或导出一份。
6. **静态 callout 不暴露 variant**。静态渲染只用 `icon` 和 `backgroundColor` 画（默认 `#f4f4f5`），不输出 `data-variant`，Yozora 没法按 note/tip/warning 用站点颜色（`--primary`/`--danger`…）上色。需要输出 `data-variant` 或给 `renderCallout` 钩子。
7. （小）`onUploadLivePhoto({ file, kind })` 不带 `AbortSignal`，取消插入时 Core 的 125 秒转换请求停不下来；`renderImage` 上下文没有节点路径，按张标识灯箱分组只能靠 DOM 顺序（够用）。
8. （小）标题 id 算法与现在不同：Suzuri 重名第二个是 `-2`，Yozora Markdown 的 `createSlugger` 是 `-1`。目录读 DOM，不影响功能；只影响旧的分享锚点。

不需要 Suzuri 补、Yozora 自己做的：Motion Photo 下载（放在 `renderLivePhoto` 里）、Shiki（`renderCodeBlock` 返回异步服务端组件元素，需在 spike 里确认 EditorStatic 能在 RSC 树里渲染它）、灯箱（`ImageLightbox` 按选择器委托，`renderImage` 给按钮加类名即可）、草稿历史用 `text` 的 Markdown 文字对比。

## 3. Yozora 现状（相对 11-23 计划没有结构性变化）

### Core（`apps/core`，Node 24.21、ESM、NestJS + SWC、tsdown 打包除 sharp 外全部依赖）

- 格式枚举：`src/shared/types/content-format.type.ts`（`markdown | lexical`）；zod：`src/shared/schema/write-base.schema.ts`、`modules/{post,note,page}/*.schema.ts`、`modules/draft/draft.schema.ts`、`modules/markdown/markdown.schema.ts`、`common/zod/custom.ts`。
- 校验与 text 生成：`src/processors/helper/helper.lexical.service.ts`（`populateText` / `populateDraftText` / `extractRootBlocks` / `normalizeBlockIds` / `normalizeLegacyQuotes`），`src/utils/lexical-projection.util.ts`（558 行，Markdown 投影），`src/utils/live-photo-node.ts`，`src/constants/lexical.constant.ts`。
- 内容工具：`src/utils/content.util.ts`（`isLexical`、`extractImagesFromContent`、`computeContentHash`、`getTranslationPayload`），`modules/file/file-reference.service.ts`（图片引用登记）。
- AI 翻译：`modules/ai/ai-translation/` 的 `lexical-translation-parser.ts`、`strategies/{base,lexical,markdown}-translation*.ts`、`translation-strategy.interface.ts`、`ai-translation.{service,model,types}.ts`、`base-translation.service.ts`、`translation-consistency.*`；`ai.prompts.ts`；`processors/helper/helper.translation.service.ts`。
- 草稿：`modules/draft/{draft.service,draft-history.service,draft.model,draft.schema}.ts`（历史按格式选 diff 策略）。
- 其他读 contentFormat 的：`post/note/page` 的 service 与 controller、`aggregate.*`、`feed.controller.ts`、`helper.controller.ts`、`markdown.controller.ts`、`comment.service.ts`（锚点评论只支持 Lexical 的块 id）、`gateway/web/visitor-event-dispatch.service.ts`、`json-transform.interceptor.ts`、`shared/model/write-base.model.ts`、`migration/version/v10.0.0.ts`、`v10.0.5.ts`。
- 实况图接口：`modules/file/file.controller.ts:160` `POST /files/live-photo/normalize/:kind` + `modules/file/live-photo-media.ts`（ffmpeg）。不需要改。
- 测试：`test/editor/*`（content-contract、legacy-quote、lexical-projection 三个原本就加载失败）、`test/src/modules/{ai,comment,draft,note,post,topic}/*`、`test/src/processors/helper/helper.lexical.service.spec.ts`、`test/src/utils/content.util.spec.ts`、`test/src/schemas/partial-schema-defaults.spec.ts`。
- 锚点评论：前台从没用过（`apps/web` 无 anchor 评论），Plate 格式按 Markdown 一样“不支持锚点”处理即可。

### 前台（`apps/web`，Next 16.4.2 + cacheComponents，React 19.3）

- 正文入口 `components/article-body.tsx`：Markdown 走 react-markdown + 服务端 Shiki（`"use cache"` 的 `highlight`、异步 `HighlightedCode`、`CodeCopy`、Haklex 的 `LanguageIcon`）；`contentFormat === 'lexical'` 交给 `components/rich-content.tsx`（`'use client'`，ShiroRenderer + `@yozora/live-photo/haklex` + `lib/lexical-normalize.ts`，出错退回 Markdown）。
- 数据：`lib/blog-data.ts` 的 `lexicalContent()` 只在 lexical 时带 `content`（4 处：文章、手记、页面、AI 译文），要加 `plate`。`lib/excerpt.ts`。
- 目录 `components/article-toc.tsx` 读 DOM 里带 id 的 h1–h4；代码复制 `components/code-copy.tsx`；灯箱 `components/image-lightbox.tsx`（选择器委托）。
- 样式：`components/post-detail.css`（`.article-rich` 下覆盖 Haklex `--rc-*`），设计变量全在 `app/globals.css` 开头（`light-dark()`、`<html data-theme>`、`data-palette`）。前台**有 Tailwind v4**：`globals.css` 第一行 `@import "tailwindcss"`，`next.config.ts` 用 `@tailwindcss/turbopack` 处理所有 CSS（站内组件 CSS 不用工具类，主要是 preflight）。
- 调试：`app/[locale]/debug/page.tsx`、`app/[locale]/debug/live-photo/page.tsx`；e2e `scripts/e2e/live-photo.mjs`、`rich-bold.mjs`、`code-copy-button.mjs` 等。

### 后台（`apps/admin`，Vite 8 + Vue 3.5 + Naive UI + UnoCSS，React 19.3 只用 `createElement`）

- `components/editor/rich/RichEditor.tsx`：Vue `defineComponent`，`onMounted` 里 `createRoot` 挂 React 的 ShiroEditor，props 经 `watch` 同步，`emit('change'|'textChange'|'editorReady')`；`RichDiffBridge.tsx` 同样挂 `@haklex/rich-diff`；`live-photo.ts`（459 行，Lexical 插件 + 插入弹窗 + Motion Photo 下载）；`note-serif-font.ts`。
- 写作：`write-editor/{RichWriteEditor,WriteEditorBase,MarkdownWriteEditor,index}.tsx`、`views/manage-{posts,notes,pages}/write.tsx`、`hooks/{use-write-draft,use-server-draft,use-preferred-content-format}.ts`。
- 上传：`api/files.ts` 的 `filesApi.upload(file, 'image'|'file', signal)`，实况图转换 `api/live-photo-media.ts`（`normalizeLiveMedia`）；`RichWriteEditor` 的 `containsImage` 按 `image`/`live-photo` + `src` 找图。
- 草稿/历史：`components/draft/draft-recovery-modal.tsx`、`views/drafts/components/{draft-detail,rich-diff-panel}.tsx`；翻译 `views/ai/components/translation-detail-panel.tsx`；调试 `components/drawer/lexical-debug-drawer.tsx`、`views/debug/rich/index.tsx`。
- 类型：`shared/types/base.ts`、`models/{post,note,page,draft}.ts`。

### SDK 与脚本

- `packages/api-client/models/base.ts:52`（`contentFormat: 'lexical'`）、`controllers/{post,note,page}.ts` 的 `prefer?: 'lexical'`。
- 脚本：`scripts/lib/markdown-to-lexical.mjs` + `write-draft.mjs`（`pnpm draft`）、`inventory-lexical.mjs`、`verify-{haklex-patches,lexical-normalize,markdown-to-lexical,post-detail,blog-cache}.mjs`。
- `pnpm-workspace.yaml`：12 个 Haklex/Lexical 补丁、`lucide-react` 等按包覆盖（不影响 Suzuri 的 `lucide-react ^1.81`）；全局覆盖 `typescript: 5.9.3`（Suzuri 产物 .d.ts 需在 spike 里确认 5.9 能读）。后台 `katex 0.16.28`、Suzuri 锁 `0.16.22`，会装两份。

### 内容映射（Lexical → Suzuri，转换器用）

- image：`src→url`、`altText→alt`、`width/height`（px）→`width` + `naturalWidth/Height`、`caption`（嵌套编辑器状态）→children、`thumbhash` 保留。
- live-photo：`src→url`、`videoSrc→videoUrl`、其余同 image。
- alert-quote（`alertType`）→ callout `variant`（静态渲染需第 2 节第 6 条）；katex-inline/block → inlineEquation/equation；code、code-block → codeBlock；文字格式位掩码 → 标记。
- tab → 小标题分段，link-card → 链接段落（站长已定）。12 篇 Markdown 不动。
- `rich-text-components-20261014`（富文本组件对照）里的 banner、gallery、details、video、mermaid、excalidraw、embed、footnote、ruby、spoiler、mention 等只在这篇演示文章出现，Suzuri 明确不做；转换器要报出来，这篇另定（保留 Lexical 或删掉演示段落），需要站长拍板。

## 4. 端口与安全验证方案

- 本机当前没有 Yozora 相关服务在跑（2323/2333/9528/27018/6380 和测试套 2523/2533/9529/27029/6391 都空闲）；占用的有 3000 以下无关端口、5000/7000（ControlCenter）、9222（用户 Chrome 调试口，**不碰**）、19988（browse）。
- worktree 没有 `node_modules` 和 `.local`；需要在 worktree 根 `pnpm install`（pnpm 硬链接，磁盘剩 44G）。
- 一律用 `node scripts/dev.mjs --test`：数据根是本 worktree 的 `.local/verification`、库 `sinpersonalspace-verify`、端口 web 2523 / core 2533 / admin 9529 / mongo 27029 / redis 6391，与站长日常库和用户自己的 `pnpm dev`（2323/2333）完全隔离；不引用主仓库 `.local`，不连线上。只开需要的那一端（`--core-only` / `--web-only` / `--admin-only` 配合 `--test`，先读 dev.mjs 确认组合可用）。
- 浏览器：ego-browser，`Sin (Chrome)`（Profile 6），用完 `task.finish({ keep: [] })`；或已有的 `scripts/headless-browser.mjs`（独立无头）。收尾查 `lsof` 和残留 `chrome-headless-shell`。

## 5. 阶段 0（三端 spike）施工清单

前提：Suzuri 先补第 2 节第 1 条（样式表），否则前台/后台 spike 只能在隔离页面里看，不能挂进真实页面。第 2、3 条可以和 spike 并行。

0. 根 `pnpm install`；把 tarball 复制进 worktree（如 `vendor/suzuri-editor-0.1.0.tgz`，路径进 git 便于复现，或只用绝对路径的 `file:`），三端各 `pnpm add @suzuri/editor@file:…`。提交：`chore(deps): add @suzuri/editor 0.1.0 tarball`。
1. **Core spike**：`apps/core/test/editor/suzuri-spike.spec.ts`（vitest，不进业务代码）：`SUZURI_SAMPLE_DOCUMENT` → `validateDocument` 通过、坏文档（未知节点、`javascript:` 链接、占位 `https://` 链接）各自的结果、`toMarkdown` 输出、`collectMedia`、`extractTranslatableSegments`→`applyTranslatedSegments` 往返、**改一个扩展后旧信封指纹不匹配**（复现第 2 节第 2 条）；再跑一次 `pnpm --filter core bundle` 确认 tsdown 能打包 platejs/remark 且 `out/` 能启动。
2. **前台 spike**：`app/[locale]/debug/suzuri/page.tsx`（开发环境才有，生产 notFound，和其他 /debug 页一致），服务端渲染 `<SuzuriContent>`，`renderCodeBlock` 返回现有 `HighlightedCode`，`renderLivePhoto` 返回小客户端组件；检查：RSC 能渲染、无水合报错、标题有 id、站点其他页面样式不被 style.css 改变（截图对比 /posts）、首屏 JS 体积对比现在的 Haklex 页（`next build` 前先停 dev）。
3. **后台 spike**：仿 `RichEditor.tsx` 写一个只用于调试页的 `SuzuriEditorBridge`（Vue 挂 React），放在 `views/debug/` 下；检查：中文输入法、撤销重做、粘贴图片（`onUploadImage` 在浏览器里拦截，不真传图床）、`onChange` 出信封、Naive UI 页面样式不被打乱。
4. 每步一个英文 Conventional Commit（`test(core): …`、`feat(web): add suzuri debug page`、`feat(admin): …`），不加 Co-Authored-By。任何一端走不通就停下汇报。

待站长定：`rich-text-components-20261014` 演示文章怎么处理；schema id 用 `suzuri` 默认值还是 `yozora`（建议默认 `suzuri`，少一个出错点；改 id 要所有调用都传同一个 options）。
