# Yozora 实况图

从 LivePhotoDemo 的本地提交 `aa579ae` 引入文件封装和无框架的长按播放器，存放在当前 workspace，不依赖相邻的 Demo 目录或 npm 发布。Haklex 适配器另外导出同一份节点定义供后台和前台使用。

**写作**：文章、手记或页面切换富文本，在工具栏点 **Live photo** 或输入 `/live`。选择 JPEG/PNG 封面和浏览器能播放的短 MP4（建议 H.264/AAC，附件最大 6 MB，最多 30 秒）。上传完成后才插入。图片过大、视频不能解码或上传失败，会保留弹窗；单独重试视频不会重复上传已成功的封面。博客没有安装 Demo 的 macOS 转换服务，HEIC/MOV 先转换。普通图片走原有流程。

**保存**：两个文件通过现有鉴权上传接口分别上传为 `image` 和 `file`；正文存 Lexical 的 `live-photo` 块，保留 `src`、`videoSrc` 等持久字段。Core 校验并投影 Markdown（封面、图注、视频链接），富文本和文件引用不丢失。附件按原有 Core 策略存放，不把原视频转存到浏览器草稿。

**阅读**：共用 ArticleBody 的富文本详情注册此节点，默认显示封面；长按 250ms 播放，松手停止，拖动/失焦取消。键盘聚焦 LIVE 按钮后按住空格或回车；无法播放时保留封面。下载按钮输出 JPEG Motion Photo，不代表 Apple 原生格式；跨域下载需资源服务器允许 CORS。

**本地回归**：Core 的 `test/editor/live-photo.spec.ts` 测保存、URL 校验和封面引用。`node scripts/e2e/live-photo.mjs` 复用正在运行的后台和前台（默认 9528、2323），用合成素材与测试上传响应，不写真实文章或图床。只开一个独立浏览器。上线时 Core、后台、前台都需要包含该版本，先更新 Core 和前台，再从后台发布带此节点的文章。
