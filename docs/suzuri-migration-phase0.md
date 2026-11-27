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

已锁定的默认值（2026-11-27 协调方确认，不阻塞）：schema id 沿用 Suzuri 默认的 `suzuri`；`rich-text-components-20261014` 演示文章到离线迁移时由转换器保留原 Lexical JSON 并出报告，届时留给站长决定。

## 6. 环境准备结果（2026-11-27）

- 根目录 `pnpm install --frozen-lockfile`（pnpm 12.6.0、Node 24.21.0）：2245 个包装好，Haklex 补丁已应用。pnpm 报 `ERR_PNPM_IGNORED_BUILDS`（`@prisma/engines`、`prisma`、`simple-git-hooks`、`vue-demi` 没有列进 `allowBuilds`），安装本身已完成；它往 `pnpm-workspace.yaml` 写的 “set this to true or false” 占位已还原。
- 新 worktree 没有 `.next`，`pnpm typecheck` 先报 `PageProps`/`RouteContext` 找不到，跑一次 `pnpm --filter @sin/web exec next typegen` 后通过（没有 dev 在跑时才跑 typegen）。`pnpm build:sdk` 通过；`apps/core` 的 `pnpm typecheck` 通过。
- `node scripts/dev.mjs --test --print-config`：数据根 `.local/verification`（已在 .gitignore），库 `sinpersonalspace-verify`。`--core-only` 只起 Mongo/Redis/Core（2533）；`--web-only` 不起数据库，前台连 `MIX_SPACE_API_URL` 或默认测试 Core 2533；`--admin-only` 要求 Core 已在跑；`--with-admin` 起全套。这几个参数互斥（`--with-admin` 也不能和 `--*-only` 一起用）。`--test --with-admin --check` 与 `--test --web-only --check` 都通过（Redis 8.10.2、端口全空）。

## 7. 三端试水结果（2026-11-27，tarball sha256 f8f95608…f097f）

- **装包**：`vendor/suzuri-editor-0.1.0.tgz`，三端 `file:` 依赖；前台另加 `katex@0.16.22`（和 Suzuri 同版，只为引 `katex/dist/katex.min.css`，后台已有 katex）。
- **Core**：`apps/core/test/editor/suzuri-spike.spec.ts`（并入 `vitest.content.config.mts`）6 项全过：示例文档与信封校验、指纹漂移默认拒绝 / `restamp` 放行且只放过指纹（改 id 或 version 仍拒绝）、未知节点与 `javascript:` 链接被拒、`toMarkdown` / `fromMarkdown`、`collectMedia`、翻译往返不动行内代码。用 Core 自己的 tsdown 配置单独打包一个调用 `@suzuri/editor/schema` 的入口，产物能运行（5.6MB 未压缩，几乎全是 plitejs/platejs/parse5/remark，没有 React）；正式 `pnpm bundle` 照常通过。浏览器编辑器产出的信封指纹和 Core 无头编辑器算出的一致（`fnv1a64:d20854bfc9b6f1ca`）。
- **前台**：`/debug/suzuri`（生产 notFound）。服务端渲染正常：标题带 id（中文 `中文标题`、重名 `中文标题-2`），代码块走站内 Shiki（`components/code-frame.tsx`，从 article-body 拆出来，免得引 Haklex），KaTeX 3 处，提示框 `data-variant` 五种按站点颜色上色，实况图用 `@suzuri/editor/live-photo` 长按播放、松开停止。控制台没有水合或运行时报错，只有测试库没装“正在用”云函数的 404 和 Next 的安全提示。样式零污染：在首页、`/posts`、`/debug` 上注入完整 `style.css` 前后比较 9264 个元素的计算样式和根变量，没有一处变化。生产构建（`next build`，测试 Core 2533）通过；路由客户端 JS：`/debug/suzuri` 13 个文件 540K（gzip 191K），文章详情页 18 个文件 4055K（gzip 1676K）；CSS 630K（gzip 177K）对 2329K（gzip 1138K）。
- **后台**：`views/debug/suzuri` + `components/editor/suzuri/SuzuriEditorBridge.tsx`（Vue 挂 React，开发环境才加载，生产构建里没有 Suzuri 代码）。打字、`## ` 快捷标题、CDP 模拟中文输入法组合输入、撤销重做、`onChange` 出信封都正常；后台 tsc 与 `vite build` 通过。**发现样式污染**：`style.css` 里的 Tailwind 工具类（`.px-4`、`.flex`、`.hidden`、`.collapse`、`.visible` 等）没有限定在 `.suzuri-root` 内，后台 UnoCSS 也用同名类，Suzuri 的 `.px-4` 排在后面，把后台页头和内容区的 `px-4 md:px-8` 压成了 1rem（512 个元素里 2 处变化）。前台不用工具类所以没受影响。

### 新发现

1. **（要 Suzuri 补）工具类未限定作用域**：需要给工具类加前缀（Tailwind v4 `prefix(sz)`）或包进 `.suzuri-root` 作用域；挂在 body 上的浮层（菜单、弹窗）也要带上 `.suzuri-root`。
2. **（环境问题，非 Suzuri）pnpm 补丁被打了两次**：`@haklex/rich-editor@0.0.85` 的 `dist/commands-entry.mjs` 有两行 `export { $setRichBlocksType }`，Turbopack 报重复导出，所有 Lexical 正文页 500。来自 pnpm 的 side-effects 缓存，**主仓库 `node_modules` 里也是这样**（文件日期 11-25）。本 worktree 用 `pnpm install --frozen-lockfile --force --config.side-effects-cache=false` 修好了；主仓库没动，站长那边下次遇到同样报错可以照此处理。
3. Next 16.4.2 的 `next dev` 第一次启动会停下来显示安全公告（见日志），再启动一次就继续；没有升级 Next。
4. 测试库 `sinpersonalspace-verify` 原来没有站长账号，`next build` 读不到个人资料会失败；已在测试库里建了站长 `verify`（密码只存在本次会话的临时目录）。

## 8. 阶段 1：Core 与 SDK 支持 `contentFormat: 'plate'`（2026-11-27）

- **格式**：`ContentFormat.Plate = 'plate'`，`CONTENT_FORMATS` 与 `isRichContentFormat()`（Lexical 或 Plate，正文以 `content` 为准、`text` 由它派生）在 `shared/types/content-format.type.ts`。文章、手记、页面、草稿、Markdown 预览的写入 schema 都改用 `CONTENT_FORMATS`；`prefer` 收 `'lexical' | 'plate'`，只有和文档格式一致时才去掉 `text`。
- **校验与 text**：`utils/plate-content.util.ts`。`content` 必须是 Suzuri 信封（默认 schema `suzuri` v1），`validateDocument(..., { requireEnvelope: true, fingerprintPolicy: 'restamp' })`，不合法 400 `Invalid Plate content: …`；只有指纹漂移时存回重新盖章的信封，否则原样保存；`text` = `toMarkdown`。入口仍是 `LexicalService.populateText / populateDraftText`（文章、手记、页面、草稿、Markdown 预览都经过它），按格式分到 Plate。草稿宽松规则同 Lexical：内容是信封但校验不过（例如刚插入的 `https://` 占位链接）时照存，`text` 保留上一次的。
- 普通发布接口按目标当前存储的格式检查。已有非空 Lexical 正文的文章、手记和页面必须先离线迁移。草稿自身可以切换格式并保留历史；从草稿发布到已有文档时，同样检查目标。
- **媒体引用**：Plate 通过 `collectMedia` 提取图片、实况封面和短片地址。已登记的上传文件按使用方保存引用，可恢复的草稿历史和正式译文都占用文件。旧记录在更新时保留原使用方；有孤儿候选时，清理会逐篇核对持久化正文、补回遗漏引用，并在调用存储删除前再查一次使用方。
- **其他分支**：凡是“非 Markdown 就不从 `text` 读图片尺寸”的地方改用 `isRichContent`；草稿历史对 Plate 和 Lexical 一样存 `content`、用 JSON diff；Core 自带 RSS 对 Plate 和 Lexical 一样提示去原站；内容哈希只算 `document`（重新盖章不算改动）；锚点评论仍只支持 Lexical，Plate 和 Markdown 一样拒绝。`json-transform`、聚合、访客推送只是透传 `contentFormat`，不用改。
- **AI 翻译**：`strategies/plate-translation.strategy.ts`（`PLATE_TRANSLATION_STRATEGY`），按文字叶子抽取（跳过代码块、公式、行内代码），复用移到 `BaseTranslationStrategy` 的 `translateChunkedEntries`，`applyTranslatedSegments(..., { fingerprintPolicy: 'restamp' })` 写回后再走一遍校验与 Markdown 投影；没有增量翻译。后台手改 Plate 译文时按 Plate 重新投影。
- **SDK**：`TextBaseModelPlate`、`ContentPreference`，`getPost/getBySlug/getNoteByNid` 的 `prefer` 用它。
- **验证**：新测试 `test/editor/plate-content.spec.ts`（17）、`test/src/modules/ai/plate-translation.strategy.spec.ts`（4）、`draft.service.spec.ts` 的 Plate 历史（5）、`ai-translation.service.spec.ts` 的策略选择与手改译文（3）；Core 全量 vitest 1009 过，失败的都是改动前就失败的（3 个缺 Shiro 夹具的 editor 文件、lexical-translation-e2e 的 3 个增量用例、search 加权排序、4 个 e2e 缺 RedisService 注入；v10.4.1 一次因随机端口撞上别的进程，单跑通过）。`pnpm build:sdk`、`pnpm typecheck`、`pnpm typecheck:core`、Core `bundle`、`pnpm verify` 全过。用 `--test` Core 真实请求：Plate 文章写入后 `text` 是正确的 Markdown（含实况图投影），`javascript:` 地址 400，草稿带 `https://` 占位链接 201。测试库里留了这篇未发布文章和一份草稿。

## 9. 阶段 2：前台正式渲染 Plate（2026-11-27）

- **数据**：`lib/blog-data.ts` 的 `richContent()`（原 `lexicalContent()`）在 Lexical 或 Plate 时都把 `content` 交给前台，文章、手记、页面、AI 译文四处共用。
- **渲染**：`components/plate-content.tsx`（服务端）。先用 `validateDocument(…, { requireEnvelope: true, fingerprintPolicy: 'restamp' })` 检查，不合法直接显示 Markdown 兜底；合法时外层是 `.article-body .article-plate`（手记加 `.article-body-note`），所以标题字号、链接、引用、行内代码、手记衬线体和加粗用黑体、目录（`article-toc` 读 `.article-body` 里带 id 的标题）都沿用 Markdown 正文；再包一层 `render-fallback.tsx`（react-error-boundary）兜住渲染时的异常。钩子：代码块用 `components/code-frame.tsx`（Shiki + 复制按钮 + 语言图标），图片包成 `.plate-zoom` 按钮交给 `ImageLightbox`，实况图用 `components/plate-live-photo.tsx`，提示框按 `data-tone` 用站点颜色（note/info 强调色、tip/success 绿、warning/important 月光色、caution/danger/error 红）。KaTeX 样式在这里引入。`article-body.tsx` 加了 `plate` 分支，Lexical、Markdown 分支不动。
- **实况图**：`plate-live-photo.tsx` 沿用 `@yozora/live-photo` 的 `yz-live-*` 外观，播放用 `@suzuri/editor/live-photo` 的 `bindLivePhoto`（按住 250ms、聚焦 LIVE 按住空格），点 LIVE 播完整段，右下角下载成 Motion Photo（两个地址都要允许跨域读取）。界面文字在词典 `livePhoto`，英日译文等 push-i18n-source 后由 Core 生成。
- **样式**（`plate-content.css`）：`--suzuri-*` 全部接到站点变量（深浅主题、三套配色跟着 `light-dark()` 走）；Suzuri 的块间距、引用竖线和斜体压回站点的样子；调过宽度的图片和实况图铺满作者定的宽度，没调过的按原尺寸居中，高图不超过一屏。踩到的坑：Markdown 正文的 `table { display: block }` 会把 Suzuri 带 `height: 1px` 的表格压成 1px 高、整张表看不见，单元格又叠了一层 Markdown 表格的内边距和边框导致出滚动条，都在这个文件里还原了。
- **检查**：`scripts/verify-plate-content.mjs`（并入 `pnpm verify`，用真实的 @suzuri/editor 渲染：站点代码框、可放大的图片与宽度、提示框颜色、实况图、KaTeX、手记类名、指纹漂移照常渲染；坏 JSON、裸文档、未知节点、不安全链接、别的 schema 一律退回 Markdown）；`verify-post-detail.mjs`、`verify-blog-cache.mjs` 加了 Plate 分支。浏览器回归 `scripts/e2e/plate-content.mjs`（直接往 Mongo 插临时内容，跑完删掉；`PLATE_E2E_KEEP=1` 保留给人工看）：1920×991 下标题 id 与目录跳转、Shiki 和复制按钮、KaTeX 字体、图片宽度与灯箱、提示框颜色、实况图按住和点 LIVE 播放、表格可见且不出滚动条、浅色主题字色、手记衬线与加粗、390 宽不横向溢出、坏信封退回 Markdown、Markdown 与 Lexical 文章照旧、控制台无报错。截图 `.local/previews/plate-content/`。
- **体积**（`next build`，测试 Core）：文章详情路由客户端 JS 4066K（gzip 1681K），比阶段 0 多 11K（gzip 5K），CSS 2487K（gzip 1160K），多 158K（gzip 22K，Suzuri 样式表与 KaTeX）；双格式并存期间 Haklex 仍在这个路由里，去掉 Haklex 后才会降到 `/debug/suzuri` 那样的 540K（gzip 191K）。
- **新发现**：Suzuri 的提示框 `icon` 是必填属性（Lexical 的 alert-quote 没有图标，迁移时要补一个）。

## 10. 阶段 3：后台写作页接入 Plate（2026-11-27）

- **新版 tarball**（sha256 85335f96…162d27，工具类限定在 `:where(.suzuri-root, .suzuri-root *)`）：`pnpm install` 不会换掉同名同版本的本地 tarball，要改锁文件里这一条的 integrity（`sha512-` + tarball 的 sha512 base64）再 `pnpm install --frozen-lockfile --force --config.side-effects-cache=false`；`pnpm update` 会顺带升级别的包并再次把 Haklex 补丁打两遍，不要用。
- **格式**：`shared/types/base.ts` 的 `ContentFormat` 加 `'plate'`、`isRichFormat()`；模型、草稿接口、预览、自动保存快照、三个写作页的提交都按“富文本（Lexical 或 Plate）”处理 `content`。`hasRichContent` 认 Plate 信封（只有空段落不算有内容，不会给空文章存草稿）。
- **编辑器**：`components/editor/plate/PlateEditor.tsx`（Vue 用 React 19 `createRoot` 挂 `<SuzuriEditor>`，回传信封和 Markdown 投影；样式表 + KaTeX；手记用思源宋体、加粗黑体，见 `plate-editor.css`，因为后台 PostCSS 会把 Suzuri 的 `@layer` 展开成 `:not(#\#)` 高优先级选择器，只能用 `!important` 改字体）。`write-editor/PlateWriteEditor.tsx`：图片 `filesApi.upload(…, 'image')` 并读原始尺寸；实况图封面 / 短片先经 `components/editor/live-photo-media.ts`（从 Haklex 的 live-photo.ts 抽出，两边共用）转 JPEG / MP4，再上传，透传 `signal`；只接受 Core 返回的 http(s) 地址，`blob:` / `data:` 一律报错。`WriteEditor` 门面：`plate` → Plate，`lexical` → 原 Haklex，其余 Markdown；空文档的切换按钮在 Markdown 和 Plate 之间切；以前选过 Lexical 的偏好自动换成 Plate。
- **Lexical 护栏**：旧 Lexical 文档仍用 Haklex 打开，顶部黄色提示“这篇还没迁移到新编辑器（Plate）…保存后依旧是 Lexical…请先用迁移工具转换”；已有内容时没有格式切换按钮；三个写作页记下读出来的格式，`lexicalOverwriteError()` 拦下任何把已发布 Lexical 改存成其他格式的提交。
- **草稿与译文**：草稿历史只存 `content`，`utils/plate-text.ts` 用 `toMarkdown` 派生文字，恢复弹窗和草稿箱对比 Plate 两版的 Markdown；AI 译文详情面板用 PlateEditor 编辑 Plate 译文并保存信封。调试页 `/debug/suzuri` 改用 PlateEditor。
- **检查**：`scripts/verify-admin-plate.mjs`（并入 `pnpm verify`）：空信封判断、键顺序不同不算改动、护栏的各种格式组合、派生 Markdown。
- **隔离测试栈实测**（`--test --with-admin`，无头浏览器；测试库的图床指向本机临时的极简 S3，跑完已删）：新版样式表对写作页 539 个非编辑器元素 0 处变化（页头 `px-8` 照旧）；新建 Plate 文章：`## ` 快捷标题、行内代码与 `**粗体**` 自动格式、撤销重做、斜杠菜单插入代码块 / 提示框 / 公式 / 表格、粘贴图片经真实 Core 接口上传；⌘S 存草稿后整页刷新，恢复弹窗出现，块结构、标题、slug 与刷新前完全一致；发布后 Core 存 `plate` 信封、`text` 是 Markdown，前台文章页用 SuzuriContent 渲染出标题 id、目录、代码框、行内代码、粗体、提示框、表格和上传的图片，控制台无报错；旧 Lexical 文章打开是 Haklex + 提示，没有切换按钮，发布后格式仍是 `lexical`、正文一字未变。手记写作页正文为思源宋体、加粗为无衬线。
- **真实 Chrome 复核**（ego-browser，Sin (Chrome)，Chrome 156，1920×991）：中文输入法组合输入两次都正确提交（“Plain line 中文输入测试”），后台 542 个非编辑器元素 0 处样式变化。无头浏览器（chrome-headless-shell）里 composition 提交的字会丢，只是无头环境的问题，不是 Suzuri 的回归。后台每次加载都会在通知权限“未决定”时请求权限，ego-lite 里要选“禁止”才不会再弹。
- **新发现**：Suzuri 把带尺寸的图片投影成 `<img … naturalWidth="480">` HTML 而不是 Markdown 图片语法，前台不受影响，但 RSS / 搜索里的 text 会带这段 HTML。

## 11. 阶段 4：Lexical → Plate 转换器

在仓库根目录运行以下命令，可只读检查隔离库中的文章、手记、页面、AI 译文、草稿和草稿历史全量快照。

```sh
node scripts/migrate-lexical-to-plate.mjs --mongo mongodb://127.0.0.1:27029 --db sinpersonalspace-verify --report .local/plate-migration
```

默认试运行。终端逐项打印结果，报告目录保存带时间戳的 JSON 和 Markdown，列出节点计数、阻塞路径、警告和新旧 Markdown 的首处差异。核对后，同一命令加 `--write` 才写库。写入前先保存 `backup-<timestamp>.json`，其中按集合和 BSON ID 记录原字段，草稿含完整历史。备份后原字段发生变化会停止，报告标出已写、冲突和待写项。数据库地址和名称必须显式给出，其他库名还需传入完全相同的 `--allow-db <名称>`。

转换保留可表达的格式。标签面板拆成四级标题和正文，原生制表符保留为制表符，链接卡片保留链接和介绍。上下标、未支持的节点、含列表等块结构的图注或提示框，以及未通过 Suzuri 校验的正文均保留 Lexical。提示框中的普通段落以空行分隔，表头方向归一为表头标记。差量和引用历史保留原样，它们依赖的全量快照也会标为阻塞，以便旧版本仍可恢复。离线检查运行 `node scripts/verify-migrate-lexical-to-plate.mjs`，已纳入 `pnpm verify`。

## 12. 阶段 1–3 复查的后台、前台与测试脚本修复（2026-11-27）

对应 `.local/reviews/phase1-3-review.md`（Core 那几项由另一路修）。每项一个提交、都先有失败的检查：
- **P0-1** `scripts/e2e/plate-content.mjs` 不再有默认库：`MONGO_URL`/`MONGO_DB`/`WEB_URL` 都要显式给出，只认隔离栈（27029 / `sinpersonalspace-verify` / 2523，`scripts/lib/e2e-guard.mjs`），连别处要 `E2E_ALLOW_NON_ISOLATED=1`；每次新 slug 和 nid，只删本次插入的 `_id`，连接、插入、开浏览器都在清理范围内。入口 `pnpm e2e:plate`（先 `node scripts/dev.mjs --test`）。`verify-e2e-guards.mjs` 真的启动脚本并拦下所有网络连接，证明拒绝发生在连库之前。
- **P0-2** 三个写作页更新已有内容前都现读一次库里的格式（`publishFormatError`），不再依赖只在 `loadPublished` 里记下的格式：草稿箱 `?draftId=` 打开、恢复历史版本、别的标签页改过都拦得住；读不到格式不放行。
- **P1-1** `PlateEditor` 打开前校验初值（`plate/initial-value.ts`）：不合法的链接（自动保存的占位 `https://`）降成普通文字打开并提示，原稿不动；还不行就只读显示原文和原因，不再初始化时抛错。
- **P1-2 / P1-4** 上传处理抽成 `plate/uploads.ts` 的 `usePlateUploads`，写作页和 AI 译文编辑共用（译文不再存 `data:`/`blob:`）；全局计数上传中的个数，三个写作页和译文保存在上传完成前拒绝提交；换文档、卸载时取消进行中的上传（普通图片也取消），取消的结果不插进正文。
- **P1-5** 前台实况图下载改用 `lib/live-photo-download.ts`：复用 `readLimited` 边读边数，一支失败取消另一支，组件卸载与 30 秒超时都取消，拼图前、保存前都看是否已取消（`verify-live-photo-download.mjs`）。
- **P1-6** 草稿箱版本列表第一项是草稿本身（`draft-versions.ts` 的 `buildVersionList`），最新的历史版本也能恢复；每个版本保留自己的格式，对比时各自投影（两边都是 Lexical 才用富文本对比）。
- **P2-3** 服务端渲染不认错误边界：Plate 正文里的子组件渲染时抛错会冒出 `RenderFallback`，把整段详情换成外层 Suspense 的读取中。`RenderFallback` 加了一层以 Markdown 兜底为 fallback 的 Suspense（代价：正文流式送达期间也先显示这份 Markdown）。`verify-render-fallback.mjs` 用真实边界跑流式 SSR 的服务端子组件异常、浏览器接手、仅浏览器的 Client Component 异常。
- **安装坑**：这次 `pnpm install --frozen-lockfile` 又把 Haklex 的 rich-editor / rich-renderer-image 补丁打了两遍（`Duplicated export 'restoreBlockIds'`，后台 build 失败），按第 10 节的 `--config.side-effects-cache=false` 重装或从正常的 worktree 换回那几个 dist 文件即可。

## 13. 阶段 4 收口：多 Agent 编排结果与待定事项（2026-11-27）

- **分工**：A（Codex gpt-6.2-astra）离线转换器 → `7187628`；B（Codex gpt-6.2-astra）阶段 1–3 只读审查，报告 `.local/reviews/phase1-3-review.md`（P0 5 / P1 7 / P2 4）；D（Codex gpt-6.2-astra）Core 八项修复 → `d6441cb`，报告 `.local/reviews/core-fixes-report.md`；E（Claude Opus 5.5）后台 / 前台 / 脚本八项修复 → `ae7424b`；C（Claude Opus 5.5）真实内容试迁移彩排 + `/debug/plate-migration` 新旧并排预览 → 合入 `sin6626/plate-rehearsal`，报告 `.local/reviews/rehearsal-report.md`。子 worktree 与分支都已合入后用 `orca worktree rm` 删除。
- **协调方补修**：迁移后的 Plate 文章还挂着旧的 Lexical 草稿时，恢复弹窗把 Plate 信封喂给 Lexical 对比器会抛错——两边都是 Lexical 才用富文本对比，格式不同改为对比两边 Markdown，并提示“恢复后会按草稿的格式保存”（`35f4190`）；Plate 正文先把代码块高亮好、正文兜底的 Suspense 占位改为空，服务端 HTML 不再先露出 Markdown 再换成 Plate（`c5a1d07`，e2e 新增断言）。
- **彩排结果**（日常库的写时复制克隆导入隔离库，跑完已还原）：文章 4 转 / 2 挡、手记 6 / 0、页面 0 / 1、AI 译文 29 / 8、草稿正文 19 / 14；挡下的是演示文章（预期）、FRP 那篇（代码块里套了代码块，内容问题）、关于我（彩色文字，Suzuri 没有文字颜色）。写库后 10 篇走 Plate 渲染，目录、图片、无控制台报错。
- **全量门禁**（合并后）：`pnpm verify`、`pnpm typecheck`、`pnpm typecheck:core`、后台 tsc + vite build、前台 `next build`、Core bundle 全过；Core 全量 vitest 1024 过 / 4 失败 / 20 跳过，失败全是第 8 节的老问题；`pnpm e2e:plate` 通过。
- **待站长定**：① 迁移后 10 篇里有 9 篇的草稿仍是 Lexical（草稿历史是增量链，转换器按设计不动）：要不要让转换器一并转换或归档这些草稿；② FRP 那篇先在后台把嵌套代码块改正再迁；关于我页的彩色文字是去掉颜色还是让 Suzuri 加文字颜色；③ 提示框迁移后不再显示 NOTE/TIP 文字（只剩图标），Suzuri 静态渲染会在行内链接 / 公式旁插入 U+FEFF，带尺寸的图片投影成 HTML——三项都要 Suzuri 处理或接受；④ 上线时：文件引用会在第一次被改动时就地转成多使用方格式，Plate 译文的去重哈希算法变了；⑤ Next 16.4.2 每次新开 dev / build 都会被安全公告打断一次，是否升级 Next；⑥ 新装依赖时 pnpm 仍会偶发把 Haklex 补丁打两遍（`commands-entry.mjs` 重复导出），装完要检查。
- **需手动清理**：C 的临时目录 `/private/tmp/claude-501/-Users-sin-orca-workspaces-SinPersonalSpace-plate-rehearsal/`（含日常库克隆和真实内容导出，按规矩不批量删除，由站长手动删）。

## 14. 新版 Suzuri 验收与本地对照预览（2026-11-27）

**在本机查看。** 在 `/Users/sin/orca/workspaces/SinPersonalSpace/suzuri-migration` 运行：

```sh
node scripts/dev.mjs --test
```

打开[迁移预演](http://127.0.0.1:2523/debug/plate-migration)，点「给实况照片保留一张封面」，也可[直接打开示例](http://127.0.0.1:2523/debug/plate-migration?sample=1)。桌面左栏是 Haklex 原稿，右栏是转换器现场生成的 Suzuri 正文；手机上下排列。示例和媒体随仓库提供，使用本机已准备好的隔离栈即可查看，无需导入日常库。索引还会列出隔离库中已有的公开内容。看完按 Ctrl+C 停止。若 Agent 终端中的 Next 16.4.2 首次因安全公告退出，按提示重跑同一条命令。

**升级与回归。** 提交 `a33fd17` 替换了同版本的 tarball，大小 308,600 字节，SHA-256 为 `463c8129c8679509cf5f5a66aa2a7e8e2360b08a1f721fa91a4f2b2bc59baf06`。锁文件记录新 SRI。pnpm 首次安装因四个既有依赖的构建脚本未表态而退出，将它们显式设为 `false` 后，`pnpm install --frozen-lockfile --force --config.side-effects-cache=false` 成功。前台、后台、Core 实际安装的包文件均与 tarball 逐字节一致。四份 Haklex rich-editor 实例中，`$setRichBlocksType`、`restoreBlockIds` 各自的导出均只有一份。

旧包实测在行内节点旁留下 U+FEFF，并将带尺寸的图片投影成 HTML。更新包后，Yozora 的自定义提示框仍缺标签，补上后五种语气及默认 NOTE 的服务端回归通过。Core 保留信封内的尺寸，派生的 `text` 是标准 Markdown 图片。用隔离文章实测，搜索能按图片替代文字找到文章，搜 `naturalWidth` 找不到这篇；RSS 输出含正确的图片元素。提交 `4a6742f` 加入代表性样稿，经真实转换器覆盖提示框、行内链接和公式、表格、代码、带宽度图片与实况照片。

| 门禁 | 结果 |
| --- | --- |
| SDK 构建、根 `pnpm verify` | 通过，51 个检查脚本全部完成 |
| Web、Core 和后台类型检查 | `pnpm typecheck`、`pnpm typecheck:core`、后台 `pnpm exec tsc --noEmit` 均通过 |
| 后台 Vite、Web Next、Core bundle | 均通过；Next 连接隔离 Core 2533，生成 52/52 页 |
| Core 内容 Vitest | 302/302 个已执行用例通过，其中 Plate 20/20。命令退出 1，3 个旧套件因旧夹具导入路径而未加载 |
| Core 全量 Vitest | 1025 通过、4 失败、20 跳过；4 个用例失败仍为翻译增量 3 个、搜索排序 1 个。另有上述 3 个夹具加载失败及 4 个旧套件的 Redis 注入失败。协调方接受既有基线 |
| `pnpm e2e:plate` | 隔离栈通过，覆盖真实路由、服务端 HTML、浏览器正文、图片灯箱、实况播放和兼容回退 |
| Ego Lite 实测 | Sin (Chrome)，1920×991 深浅两色、390×844 手机。示例三种标签可见，链接与公式所在段落的 U+FEFF 计数为 0。索引进入对照页时，运行时异常、控制台错误及资源错误均为 0。后台真实写作页三种标签与可编辑正文分行，无横向溢出 |

PNG 在本机 `/Users/sin/.orca/bots/x/scratch/plate-preview/`，分别为 `desktop-dark.png`、`desktop-light.png`、`mobile-plate.png`。测试库此前缺少页头读取的 `GET /fn/ps/update`，本次在隔离库安装了仓库自带函数的只读版本，返回无活动状态。临时后台样稿已清理。详细运行日志在本工作树的 `.local/verification/upgrade/`。

**Phase 5 前的决定。** Sin 先看本地预览。FRP 的嵌套代码块和「关于我」的彩色文字由 Sin 在生产迁移前手动编辑。演示文章 `rich-text-components-20261014` 继续用 Lexical，迁移文章关联的 9 份旧草稿保留原样。
