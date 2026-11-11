# 线上 Core 镜像：以 Innei 的 mx-server 运行镜像为底（Alpine 3.23、Node 22），放进本仓库构建的 apps/core/out。
# 用法（服务器上，构建目录里有 out/）：cp 本文件为 Dockerfile 后 docker build -t yozora/mx-server:<提交号> .
# ffmpeg（Alpine 3.23 是 8.0，带 ffprobe、HEVC 解码、libx264、AAC，镜像多约 124MB）：实况图上传时把 iPhone 的
# HEIC 转 JPG、HEVC/MOV 转 H.264 MP4（apps/core/src/modules/file/live-photo-media.ts）。放在 COPY 前面，换代码时这一层走缓存。
FROM innei/mx-server:running-20261102
RUN apk add --no-cache ffmpeg
COPY out/ /app/
