# Yozora 实况图

从 LivePhotoDemo 的本地提交 `aa579ae` 引入文件封装和无框架的长按播放器，存放在当前 workspace，不依赖相邻的 Demo 目录或 npm 发布。Haklex 适配器另外导出同一份节点定义供后台和前台使用。

**写作**：文章、手记或页面切换富文本，在工具栏点 **Live photo** 或输入 `/live`。封面支持 JPEG、PNG、HEIC/HEIF，以及浏览器可解码的 WebP、GIF（静态封面）、AVIF、BMP；输入最多 20 MB / 2400 万像素。视频支持 MP4/M4V、MOV、WebM、MKV、AVI，输入最多 100 MB、30 秒、4K。插入、替换封面和替换视频都先准备兼容副本，再上传。已合规的 MP4 保留；其他输入按轨道换容器或转成 H.264、yuv420p、AAC（有音轨时）。存储的 MP4 最多 6 MB，超限仍无法压入时需缩短原片。源文件不被修改，HEIC/MOV 原件不会额外上传到图床。HDR、Dolby Vision 和未知高位深色彩暂不支持。

**转换接口**：鉴权 `POST /files/live-photo/normalize/:kind`（kind 为 image/video，multipart 字段 file），不写入图床或正文；204 表示沿用原 MP4，200 返回 JPEG 或 MP4 二进制。Core 单任务处理，工作文件随请求清理。视频和 HEIC 都只靠 Core 主机上的 ffprobe 与 ffmpeg（要 7.1 以上才能拼 iPhone 的分块 HEIC，并带 HEVC 解码、libx264、AAC；线上镜像由 scripts/deploy/core-image.Dockerfile 装好）：HEIC 先按整张算像素，超过 2400 万直接拒，再转 JPG；视频转 H.264 MP4；都是单线程，省内存。普通图片走原有流程。

**保存**：两个文件通过现有鉴权上传接口分别上传为 `image` 和 `file`；正文存 Lexical 的 `live-photo` 块，保留 `src`、`videoSrc` 等持久字段。Core 校验并投影 Markdown（封面、图注、视频链接），富文本和文件引用不丢失。附件按原有 Core 策略存放，不把原视频转存到浏览器草稿。

**阅读**：共用 ArticleBody 的富文本详情注册此节点，默认显示封面；长按 250ms 播放，松手停止，拖动/失焦取消。键盘聚焦 LIVE 按钮后按住空格或回车；无法播放时保留封面。下载按钮输出 JPEG Motion Photo，不代表 Apple 原生格式；跨域下载需资源服务器允许 CORS。

**本地回归**：Core 的 `test/editor/live-photo.spec.ts` 测保存、URL 校验和封面引用。`node scripts/e2e/live-photo.mjs` 复用正在运行的后台和前台（默认 9528、2323），用合成素材与测试上传响应，不写真实文章或图床。只开一个独立浏览器。上线时 Core、后台、前台都需要包含该版本，先更新 Core 和前台，再从后台发布带此节点的文章。
