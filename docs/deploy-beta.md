# 灰度上线：新前台先放在 beta 子域名上自己用

2026-11-02 用户定：新前台和旧 Shiro 放在同一台服务器，新前台用子域名（下面写作 `beta.你的域名`），只给自己用、不让搜索引擎收录；线上 Core 换成本仓库的版本，新旧两个前台读同一份线上数据。主域名继续是旧 Shiro，自己用一两周没问题再切换。

Agent 不使用聊天里给的 root 密码。站长把本机公钥装进了服务器，Agent 用这把密钥登录：只读检查随时可做，改线上数据、配置、服务之前先说清要执行什么和怎么回滚，站长同意后再执行。

## 为什么线上 Core 要换

本仓库的 `apps/core` 和线上一样是 Mix Space Core 10.5.3，在上面加了二十多处修改（`git log -- apps/core` 可以看到）。新前台用到其中几样，原版 Core 没有：

- 碎碎念模块（`/murmurs`）和最近动态里的碎碎念；
- 社交名片二维码不被每小时的清理任务删掉；
- 云函数 `ctx.storage.cache.del` 与 `ctx.throws` 状态码的修复（“正在用 / 在听”靠它）；
- 登录失败跳回博客而不是 Core 根地址；
- 几处防泄露的安全修复（读者邮箱、手记密码、未发布文章不出现在站点地图和 RSS 等）。

这些都是新增功能和修复，旧 Shiro 和线上后台照常能用。换之前完整备份，出问题就换回原来的 Core、恢复备份。

## 第 0 步：先看清服务器上现在是怎么跑的

服务器上 Docker、1Panel、pm2 + Nginx 都有，先确认 Core、MongoDB、Redis、旧 Shiro 各自用的哪一种、反向代理配在哪里。在自己的电脑上执行（只读，不改任何东西，不打印密码和环境变量）：

```bash
ssh root@服务器IP 'bash -s' < scripts/deploy/server-inspect.sh > server-inspect.txt
```

扫一眼 `server-inspect.txt`，确认里面没有密码，再发给 Agent。下面第 3、4 步的具体命令按这份结果来定。

## 2026-11-02 盘点结果（Agent 用 SSH 密钥只读查看）

- 服务器：Ubuntu 24.04，2 核，内存 1.9G（另有 3.4G swap），硬盘 30G 只剩约 4G；宿主机 Node 20，没有 pnpm。
- Core：Docker Compose（`/root/mx-space/core/docker-compose.yml`），镜像 `innei/mx-server`（10.x，容器里 Node 22），MongoDB 7、Redis 各一个容器，数据在 `/root/mx-space/core/data/`（库约 515M，Core 数据目录约 519M）；`ALLOWED_ORIGINS=https://sin6626.me,https://www.sin6626.me`；只监听 `127.0.0.1:2333`。
- 旧 Shiro：Next standalone，`/root/mx-space/shiro-release/standalone`，端口 4860，由 PM2 守护（宿主机 PM2 不在 root 的 PATH 里）。
- 反向代理：1Panel（v2）的 OpenResty 容器；站点 `sin6626.me` → 4860，`api.sin6626.me` → 2333，`s3.sin6626.me` → MinIO 9000。
- DNS 在西部数码（`myhostadmin.net`），没有泛解析，`beta.sin6626.me` 要新加一条 A 记录指向 38.95.74.213。
- Docker 构建缓存 4.4G 可以清掉（不影响正在跑的服务）。

因为内存和硬盘都小，**不在服务器上编译**：Core 和前台都在本机构建好再传上去。Core 用现在的镜像做底、叠上本仓库编译好的代码，回滚就是把 compose 的镜像改回原来的；前台用 `node:24` 容器跑在 `127.0.0.1:2324`。

## 2026-11-02 已做：清理磁盘、备份

- 清理（磁盘 4G → 12G 可用）：Docker 构建缓存 4.4G（`docker builder prune -af`）、系统日志 journal 压到 200M（原 2.9G）、apt 缓存、三个单文件（1Panel 安装包 tar.gz、旧 dmesg.0、旧 btmp.1）、两年前不用的 `innei/shiro:latest` 镜像。Core 和 Shiro 清理后都正常（ping 200）。
- 留给站长自己决定、自己删的目录（批量删除按规矩由站长手动）：`/1panel-v2.1.8-linux-amd64`（154M，1Panel 安装解压目录）、`/root/mx-space/shiro`（1.5G，Shiro 源码和依赖，线上跑的是 `shiro-release`）、`/root/mx-space/mx-web-yun`（250M）。
- 备份在服务器 `/root/backups/2026-11-02/`（权限 700），本机拷了一份到 `.local/backups/server-20261102/`（不进 git，SHA-256 已核对）：整库 `mongodump --archive --gzip`（1.3M，dry run 读回通过；文章 13、手记 10、评论 38），Core 数据目录（不含它自己的每日备份，30M），compose 文件，镜像清单。
- 正在跑的 Core 镜像另打了固定标签 `innei/mx-server:running-20261102`，回滚用。
- 注意：线上 compose 文件写的是 `innei/mx-server:latest`（现在是 v11.1.2），而正在跑的容器是旧的 `:10`（库里的迁移记录到 v10.4.3）。谁在那个目录执行 `docker compose up -d`，Core 就会直接跳到 v11 并跑一串迁移。
- 安全：`/var/log/btmp` 记录了两万多次 SSH 登录失败（有人在扫密码），而服务器开着 root 密码登录。建议改成只允许密钥登录。

## 2026-11-03 已做：新 Core 和旧 Shiro 的兼容性测试

站长担心换了 Core 旧 Shiro 会坏，所以先在旁边起一个测试 Core，不碰线上：

- 镜像：服务器上 `/root/mx-space/beta-core/Dockerfile` 以正在跑的 `innei/mx-server:running-20261102` 为底，删掉里面的 `*.mjs`，换成本机 `apps/core/out` 的构建产物（sharp 等原生依赖沿用镜像里的），打成 `yozora/mx-server:beta-test`。
- 数据：用 11-02 的备份恢复成另一个库 `mx-space-beta`（`mongorestore --nsFrom='mx-space.*' --nsTo='mx-space-beta.*'`，4088 条），配独立的 Redis 容器，测试 Core 只监听 `127.0.0.1:2334`。
- 启动要点：我们这版 Core 用 Better Auth，生产模式下没有密钥会拒绝启动，要沿用线上 compose 的 `JWT_SECRET`（从线上容器原样传入，不落盘）。启动只跑了一个新迁移 `v10.5.3-api-key-reference`（只新增）。测试库的图片引用记录全是 active，测试 Core 的整点孤儿图片清理不会删图床文件。
- 对比：`scripts/deploy/compare-cores.mjs`（在服务器上用宿主机 Node 跑，只发不带登录的 GET）把旧 Shiro 源码里用到的 37 个接口在 2333 和 2334 上逐个比：状态码全部一致，旧 Shiro 读的字段一个都没少。取值不同的只有两处，都是预期内：文章/手记/页面的 `available_translations` 不再列出原文语言 `zh`（Shiro 源码没用这个字段）；标签篇数不再把草稿算进去（本仓库的修复）。另外抽了 10 篇有评论的文章和手记，评论条数和字段一致；Socket.IO `/web` 两边都能握手。`/fn/built-in/ip` 两边都是 500（线上原本就报 `ctx.res.throws is not a function`），不是新问题。
- 后台：Core 优先用数据目录里的 `admin/`。线上数据目录里是站长更新过的 mx-admin 6.4.7，镜像自带的是 6.4.0。本仓库的 `apps/admin` 是 6.4.0 加我们的修改（碎碎念菜单、社交名片、手记衬线字体等）。换 Core 时数据目录不变，所以后台先还是 6.4.7；要用碎碎念等新菜单，再单独把本仓库的后台放进去。
- 测试完已删掉两个测试容器；测试库 `mx-space-beta` 留着（很小），以后可再用。全程线上 Core、Shiro、两个公网域名都是 200。

## 2026-11-03 已做：线上 Core 换成本仓库版本

站长同意后执行：

- 换之前再整库备份一次：服务器 `/root/backups/2026-11-03/`（`mongo-mx-space.archive.gz`，文章 13、手记 10、评论 38，与线上库一致；原 compose 文件也拷在这里）。
- 镜像固定标签 `yozora/mx-server:20261103`（就是测试用的 `beta-test`）。
- `/root/mx-space/core/docker-compose.yml` 只改两行：`image` 从 `innei/mx-server:latest` 改为 `yozora/mx-server:20261103`（顺带消除了“有人 `docker compose up -d` 就会跳到 v11”的隐患）；`ALLOWED_ORIGINS` 加上 `https://beta.sin6626.me`。`JWT_SECRET` 等其他配置、数据目录都不变。
- `docker compose up -d --no-deps app`，只重建 Core 容器，MongoDB 和 Redis 没动。停机约 17 秒，启动只跑了 `v10.5.3-api-key-reference` 一个迁移，无报错，健康检查 healthy。
- 检查：公网 `api.sin6626.me` 的接口 200；Shiro 首页、文章、手记、列表、时间线 200 且标题都在；浏览器真实打开文章页，3 条评论正常显示、在线人数有数、控制台无报错；后台仍是数据目录里的 mx-admin 6.4.7；Socket.IO 公网握手正常。

回滚（约 20 秒）：

```bash
cp -p /root/backups/2026-11-03/docker-compose.yml /root/mx-space/core/docker-compose.yml
sed -i 's#image: innei/mx-server:latest#image: innei/mx-server:running-20261102#' /root/mx-space/core/docker-compose.yml
cd /root/mx-space/core && docker compose up -d --no-deps app
```

新加的迁移只新增数据，旧 Core 不受影响；只有数据出问题时才需要用备份恢复。

## 2026-11-03 已做：新前台在服务器上跑起来

服务器内存只有 1.9G，不在上面构建：本机构建 Next 的 standalone（`apps/web/next.config.ts` 的 `output: "standalone"`），服务器只用 `node:24-alpine` 容器运行。

**构建**（本机，约 3 分钟，不影响正在开的 `pnpm dev`）：

```bash
git worktree add --detach /tmp/yozora-build HEAD
cd /tmp/yozora-build && pnpm install --frozen-lockfile --prefer-offline
node scripts/deploy/build-web.mjs /tmp/yozora-build ~/Documents/Project/SinProject/SinPersonalSpace/.local/deploy/yozora-web.tgz
```

构建时要预渲染页面、从线上 Core 取数据。本机直连服务器并发一多就有一半 TLS 连接被重置，走 Clash 也会断，线路只有约 150KB/s。`build-web.mjs` 开一条 SSH 隧道到服务器本机的 443，Core 域名的连接走隧道，其他（Google 字体、力扣、GitHub）照旧走系统代理；每个请求的超时放宽到 90 秒（`MIX_SPACE_TIMEOUT_MS`，只在构建时）；Next 预渲染失败会重试 3 次（`staticGenerationRetryCount`）。Core 地址必须带 `/api/v2`（生产模式的 Core 挂在这个前缀下，本地开发模式没有），它会写进预渲染好的页面里，所以构建和运行时要一致。

**上传与运行**（服务器 `/root/mx-space/yozora-web/`，权限 700）：

- 包传到 `yozora-web.tgz`，解压到 `releases/<提交号>/`，`chown -R 1000:1000`，`current` 软链指向它。
- `web.env`（权限 600）里是 `MIX_SPACE_WEBHOOK_SECRET`，后台加 Webhook 时 Secret 填这个值（`cat /root/mx-space/yozora-web/web.env`）。
- 启动：

```bash
W=/root/mx-space/yozora-web
docker run -d --name yozora-web --restart unless-stopped --memory 400m --user 1000:1000 \
  -p 127.0.0.1:2324:3000 --env-file $W/web.env \
  -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3000 -e TZ=Asia/Shanghai -e NEXT_TELEMETRY_DISABLED=1 \
  -e MIX_SPACE_API_URL=https://api.sin6626.me/api/v2 -e SITE_NOINDEX=1 -e NODE_OPTIONS=--max-old-space-size=300 \
  -v $(readlink -f $W/current):/app -w /app/apps/web node:24-alpine node server.js
```

- 更新：传新包、解压到新的 `releases/<提交号>/`、改 `current`，`docker rm -f yozora-web` 后再执行上面的启动命令。回滚就是把 `current` 指回上一个版本再重建容器。停掉 beta：`docker rm -f yozora-web`。
- 第一次（`releases/7dd878b`）：本机 `127.0.0.1:2324` 首页、文章、手记、碎碎念、一言、时间线、英日文页面都是 200，`robots.txt` 整站禁止，页面带 `noindex, nofollow`。容器约 205MB 内存，之后服务器可用内存约 200MB（另有 3.4G swap）。
- 容器里的前台在服务端取数据也走公网地址 `https://api.sin6626.me/api/v2`（服务器自己绕回来），Core 看到的是容器 IP，和旧 Shiro 分开限流。

## 2026-11-03 已做：beta.sin6626.me 上线与跨域修复

- 站长在 1Panel 建了反向代理站点 `beta.sin6626.me`（监听 80/443，转发 `http://127.0.0.1:2324`），Let's Encrypt 证书（HTTP 验证，自动续签），HTTP 跳 HTTPS。申请证书时不要勾“IP 证书”，否则报 `x509: cannot parse IP address of length 0`；勾错后编辑也改不掉，要删掉重建。
- 跨域白名单写法：Core 拿请求来源的域名部分（`new URL(origin).host`）和 `ALLOWED_ORIGINS` 逐项通配比对，所以**只能写域名**：`sin6626.me,www.sin6626.me,beta.sin6626.me`。原来线上写的是带 `https://` 的完整地址，永远比对不上，只是旧 Shiro 走同域的 `sin6626.me/api/v2` 没受影响；新前台从浏览器直连 `api.sin6626.me`（点赞、评论、阅读数、订阅、在线人数、正在用），全部被跨域拦下。Better Auth 的可信来源会把只写域名的条目补成 `https://`、`http://` 两种，登录不受影响。改后重启 Core（停机约 16 秒），改前的 compose 在 `/root/backups/2026-11-03/docker-compose.before-origins.yml`。
- 页脚星带在服务器上没有力扣的星：力扣中国站对这台洛杉矶服务器的 IP 一律返回 Cloudflare 人机验证（403 “Just a moment...”），带浏览器请求头也一样，不是跨域问题；GitHub 正常。本机（国内）取得到。不绕过人机验证。
- 本机脚本（`pnpm draft`、`migrate-murmurs.mjs`、`install-ps-function.mjs`）原来用 `new URL("/xxx", api)` 拼地址，会丢掉线上的 `/api/v2`；已改用 `scripts/lib/core-url.mjs`。线上要先在后台建 API Token，填进 `.local/publish.json` 的 `prod`（`api` 写 `https://api.sin6626.me/api/v2`）。

## 2026-11-03 已做：线上后台换成本仓库版本、力扣同步

**后台**：Core 优先用数据目录的 `admin/`，首页每次请求都从磁盘读（并把脚本、样式路径改写成 `/proxy/...`），所以替换目录即生效，不用重启 Core。

```bash
# 本机：在构建目录里 pnpm --filter mx-admin build，打包 apps/admin/dist
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf .local/deploy/yozora-admin.tgz -C /tmp/yozora-build/apps/admin/dist .
# 服务器：解压到新目录，再换名
D=/root/mx-space/core/data/mx-space
mkdir -p $D/admin-yozora-<提交号> && tar -xzf yozora-admin.tgz -C $D/admin-yozora-<提交号>
mv $D/admin $D/admin-<旧版本>-<日期> && mv $D/admin-yozora-<提交号> $D/admin
```

现在线上是本仓库的 mx-admin 6.4.0（a781a05 构建），原来的 6.4.7 在 `admin-6.4.7-20261103`，回滚把名字换回来即可。登录页正常；`/proxy/Sin` 404 是后台“登录页背景”填了文字 `Sin` 而不是图片地址，旧后台也一样。

**力扣同步**：`scripts/sync-leetcode.mjs` 在 Mac 上从力扣中国站取全部年份的提交日历，存进 Core 的公开 JSON 配置片段 `theme/leetcode-calendar`（`{ updatedAt, submissionCalendar }`，日历是字符串，和力扣返回的一样），内容没变不写；连线上时自动走系统代理并重试。页脚星带（`apps/web/lib/activity-sky.ts`）先直接问力扣，取不到（线上服务器被 Cloudflare 拦）再读这个片段。`--install` 装 launchd 定时任务 `me.sin6626.yozora.leetcode-sync`（`~/Library/LaunchAgents/`，每天 13:00，睡眠错过醒来补跑，日志 `.local/logs/leetcode-sync.log`），`--uninstall` 卸掉；plist 里写死了 `/usr/local/bin/node` 和仓库路径，换 Node 安装位置或挪仓库后重新 `--install`。第一次同步 460 天；beta 页脚现在有力扣 460 天、GitHub 112 天的星。

beta 前台已更新到 `releases/1b5a6d4`（上一个 `7dd878b` 留着）。

## 2026-11-03 已做：线上 Webhook、社交账号、本地内容迁移

- **Webhook**：用后台令牌经接口新建（`POST /webhooks`），地址 `https://beta.sin6626.me/api/webhooks/mix-space`，事件与本地相同的 30 个，scope 5，Secret 是服务器 `web.env` 里那个（只在内存里传）。用同一密钥签名的 `health_check` 返回 200，错误签名 401。注意 Core 返回的字段是蛇形写法（`payload_url`）。
- **社交账号**：`PATCH /owner` 只改 `socialIds`，线上从 GitHub、哔哩哔哩补齐到和本地一样（加 X、微信、QQ 名片），其他资料不动。二维码在图床 `dev/` 前缀下，公开可访问。
- **内容迁移**：先只读对比（`scripts/deploy/diff-db.mjs`，经 SSH 隧道连线上 Mongo，结果 `.local/deploy/db-diff-20261103.txt`），再用 `scripts/deploy/migrate-content.mjs`（默认试运行，`--apply` 才写，按 `_id` 覆盖写入，可重复跑）。迁移前整库备份 `/root/backups/2026-11-03/mongo-before-migration.archive.gz`。共写入 84 条：
  - 碎碎念 56 条（去掉“测试碎碎念（可删除）”和只写了“ces”加图的两条测试）、一言 5 条；
  - 页面“关于我 / 关于本站”只改副标题（这里的主人 / 这个站是如何来的；正文 content 两边一样，`text` 是本地 Core 重新生成的纯文本副本，不搬）；
  - 6 条修正过的日文 AI 摘要，9 条本地改过的 AI 译文（两个页面三种语言、累有感英日、FRP 英文）、3 条新补的译文、“瞎扯淡”分类的英日译名 2 条、首页配置片段 `theme/yozora`。
- **没迁**：Test 1/2、富文本组件对照演示文章及其摘要译文、6 条测试评论、草稿、思考（速记，24 条已全部复制成碎碎念）、会话账号令牌、统计日志、云函数与 Shiro 主题配置，以及**站点设置（options）**：本地与线上有 18 项不同（网站地址、OAuth、图床、SEO 标题、评论、AI、备份等），其中网站地址、OAuth、图床是本地开发用的，SEO 标题本地已是 Sin’s Yozora 而线上 Shiro 仍用旧标题，正式切换时逐项决定。
- **为什么不迁文章手记的“改动”**：本地库是从线上导入的，导入时图片地址被改成了本机 `http://127.0.0.1:2333/objects/image/import-*`，对比出来的“不同”全是这个；线上那份才是对的。本地补的译文若带这种地址，迁移脚本按两边正文里图片出现的顺序换回线上 S3 地址（38 个），写入前检查不得含指向本地 Core（端口 2333）的地址。
- 直接改库不会触发 Webhook：迁移后清掉 Redis 的 `mx-api-cache:*`、`mx:snippet_cache*`、`mx:translation_entry_dict*`，再在服务器上用 `web.env` 的密钥签一个 `CONTENT_REFRESH` 发给 `127.0.0.1:2324/api/webhooks/mix-space`，beta 的缓存整体作废。核对：线上碎碎念 56、一言 5、新副标题、`yozora` 200、分类英文名 Ramblings；Shiro 首页和关于页 200。

## 2026-11-04 已做：beta 前台更新到 2131c7a、清掉线上测试数据

- 这次只有前台有改动（1b5a6d4 之后 17 个提交：读取中小火箭、“今晚的天空”配色选择、各列表页进场动画、浅色星图去掉十字、站点图标），Core、后台、SDK 都没变，所以只换前台，Core 不重启。
- 构建照上面“新前台”一节：`git worktree add --detach /tmp/yozora-build HEAD` → `pnpm install --frozen-lockfile --prefer-offline` → `build-web.mjs`，包 64MB。构建前先跑 `pnpm verify`（这次查出 `verify-post-list.mjs` 的模块替身缺 `./reveal`，修了才构建）。
- 上传用 `rsync --partial`（断了重跑能续传，服务器有 rsync），约 7 分钟。上传进行时另开 SSH 连接被服务器断开过一次（`Connection closed by ... port 22`），等上传完再做别的。
- 切换：解压到 `releases/2131c7a`、`chown -R 1000:1000`、`current` 指过去、`docker rm -f yozora-web` 后用上面同一条命令启动（重建前用 `docker inspect yozora-web` 核对过启动参数和文档一致）。停机约 5 秒。
- 验证：服务器本机 `127.0.0.1:2324` 首页、文章、手记、时间线、一言、友链、作品、思考、碎碎念、英日文、页面、文章与手记详情、feed、sitemap、新图标都是 200；robots 整站禁止、页面 noindex；公网 `https://beta.sin6626.me` 200；无头浏览器打开首页、文章、一言、时间线没有脚本报错。
- 回滚：`ln -sfn /root/mx-space/yozora-web/releases/1b5a6d4 /root/mx-space/yozora-web/current`，再重建容器。
- 容器约 242MB / 400MB，之后服务器可用内存约 160MB（另有 3.4G swap），比上一版略紧。
- 线上测试数据：删了 04-20 的测试评论线程 3 条（都已是软删除）、页面草稿 `test`、4 条指向已不存在内容的搜索索引，和本地同一批（本地库是线上导入的，_id 相同）。删前导出到服务器 `/root/backups/2026-11-04/test-data-online.json`（600），删除脚本也在那里。恢复：把备份里的文档按 `_id` 插回对应集合。
- 社交账号：11-03 之后本地又加了 Discord（名片，用户名 sin6626me）和 Telegram，线上没有。`GET /owner` 两边对比（字段是蛇形 `social_ids`），按本地顺序 `PATCH /owner` 只改 `socialIds`，线上已有的 5 项用线上的值，补上缺的 2 项；改前的值备份在本机 `.local/backups/prod-owner-social-ids-20261104.json`。头像、名字没动。改个人资料没有 Webhook，beta 首屏最多 5 分钟后出现新图标（已核对 7 个都在）。
- 整库只读对比（`.local/deploy/db-diff-20261104.txt`，隧道 `172.19.0.3:27017`）：除社交账号外没有漏迁的内容。本地多的是富文本组件对照演示文章、只写了“ces”的测试碎碎念、测试评论 `XXS`（已删）、思考 24 条（线上思考是 0 条，碎碎念里已有它们的副本）；线上多的是之后在线上新发的文章《以 STEP 为框架理解 Plate 的测试实践》、手记《大学特种兵》、友链 Elowen's Space、读者 dfgf 在手记《大学特种兵》下的真实评论（不是测试，别删）、力扣日历片段；“两边都不同”的文章、手记、译文、友链头像、话题图标、作品头像都是导入时本地把图片地址改成了本机地址，线上那份才对；站点设置、云函数密钥、会话、统计、订阅本来就各是各的。
- 磁盘（30G 用了 18G）留给站长自己清：新版本稳定后可删最老的前台版本 `rm -rf /root/mx-space/yozora-web/releases/7dd878b`（约 260MB，1b5a6d4 留作回滚）；不用的镜像标签 `docker rmi innei/mx-server:latest innei/mx-server:10 yozora/mx-server:beta-test`（**不要删** `innei/mx-server:running-20261102`，那是 Core 的回滚镜像）；兼容性测试留下的库 `mx-space-beta`（6.4MB）可删可留。日志不用管：`serverless_logs` 有 Core 自带的 7 天 TTL 索引，稳定后约 6.5MB；`webhook_events` 只有个位数。

## 2026-11-04 已做：线上 Core 换成 20261104、配置片段改名 yozora

站长要求“把配置片段改名 Yozora 并部署到线上”后执行（本轮改动见 AGENTS.md 2026-11-04“后台掌控前台的数据”）。

- 备份：服务器 `/root/backups/2026-11-04/mongo-before-core-20261104.archive.gz`（整库，文章 13、手记 10、评论 35）和 `docker-compose-before-core-20261104.yml`。
- 构建：本机 `git worktree add --detach /tmp/yozora-build HEAD` → `pnpm install --frozen-lockfile --prefer-offline`（pnpm 会因 prisma 等构建脚本被忽略而返回 1，依赖已装好；它往 `pnpm-workspace.yaml` 写的占位要 `git checkout` 还原）→ `pnpm build:sdk && pnpm --filter @mx-space/core build`，`apps/core/out` 约 60M，`rsync --partial` 传到服务器。
- 镜像：`/root/mx-space/core-image-20261104/`（Dockerfile 与 11-03 相同：以 `innei/mx-server:running-20261102` 为底、换掉 `*.mjs`），标签 `yozora/mx-server:20261104`。
- 切换：compose 里镜像标签 `20261103` → `20261104`，`docker compose up -d --no-deps app`，约 9 秒 healthy，无新迁移。
- 检查：公网 API、旧 Shiro 首页与文章列表、beta 都是 200；后台 Webhook 事件列表多了 14 个新事件（共 62 个）；楼中楼接口带 `readers`，线上 7 个真实回复楼都没有邮箱字段。
- 配置片段：线上 `theme/sin-space` 改名 `theme/yozora`，补上 hero、footer、accounts、copyright（空）和英日文，文案与原来写死的相同（原片段备份在本机 `.local/backups/prod-snippet-sin-space-20261104.json`）。改名要在构建前端之前做（构建时预渲染会读它）。
- Webhook：beta 那条订阅加勾 14 个新事件（30 → 44，原列表备份 `.local/backups/prod-webhook-events-20261104.json`）。

- 前台：同一个构建目录 `build-web.mjs`（81383e8，包 68MB），`rsync --partial` 上传，解压到 `releases/81383e8`，`current` 指过去，按上面同一条命令重建容器（重建前核对过启动参数）。本机 2324 端口 15 个页面 200，公网 beta 首页、英文首页的首屏、页脚、萌备都来自 `theme/yozora`，话题页显示简介；重新保存一次线上片段（内容不变），投递记录 `SNIPPET_UPDATE 200`；无头浏览器打开 5 个页面无脚本报错。容器约 232MB / 400MB。前台回滚：`current` 指回 `releases/2131c7a` 再重建容器（旧版本读 `sin-space`，会退回占位文案）。
- 线上 SEO 设置：站长定“除了旧站自己的 theme/shiro 片段，别的都按 Yozora”，网站标题“葉は静かに落ちる”→“Sin’s Yozora”、描述“有朋自远方来, 不亦说乎”→“夜深里也有月亮和星星陪我作伴”（关键字本来就相同；原值备份 `.local/backups/prod-option-seo-20261104.json`）。`OPTION_UPDATE` 投递 200，beta 标题立即变。旧 Shiro 的浏览器标题也读 SEO 设置（不读 theme/shiro），它自己的缓存过期后会一起变成 Sin’s Yozora。

回滚 Core（约 10 秒）：

```bash
sed -i 's#image: yozora/mx-server:20261104#image: yozora/mx-server:20261103#' /root/mx-space/core/docker-compose.yml
cd /root/mx-space/core && docker compose up -d --no-deps app
```

回滚 Core 后旧 Core 不认识新事件名，Webhook 订阅里的新事件会被忽略，不影响别的事件。配置片段改回原名用后台“配置与云函数”改名即可，但新前台读的是 `yozora`。

## 2026-11-05 已做：第二轮复查的修复上线（cf9d6bf）

站长同意后执行，Core、前台、后台三样都换（改动见 AGENTS.md 2026-11-04“第二轮复查修复”）。

- 备份：服务器 `/root/backups/2026-11-05/`（`mongo-before-deploy-20261105.archive.gz` 整库，文章 13、手记 10、评论 35；`docker-compose-before-20261105.yml`）。
- 构建：本机 `/tmp/yozora-build` 工作目录（cf9d6bf），Core、SDK、前台、后台都从这里构建，用完已删。
- **Core**：`/root/mx-space/core-image-20261105/`（先把 1104 的 `out/` 拷过来再 `rsync --delete`，只传差异，几秒），镜像 `yozora/mx-server:20261105`，compose 改标签后 `docker compose up -d --no-deps app`，约 22 秒 healthy，无新迁移。公网 API、旧 Shiro 首页与文章列表、beta 都是 200。**SSH 在执行切换命令前断过一次**（什么都没执行）；之后切换都写成服务器上的脚本用 `nohup` 跑（`switch-core.sh`、`switch-web.sh` 和日志都在备份目录），断线也不会停在半路。
- **配置片段**：构建前台之前，线上 `theme/yozora` 补上 `i18n.en.techStack`、`i18n.ja.techStack`（标题、说明，与本地相同），图标行不变；改前备份本机 `.local/backups/prod-snippet-yozora-before-tech-i18n-20261105.json`。本机直连线上第一次 TLS 被重置，脚本给每个请求加了重试后成功（设同一个值，重试无害）。
- **前台**：`releases/cf9d6bf`（包 65MB），启动参数与上一版一致（`docker inspect` 核对过），停机约 2 秒。服务器本机 15 个页面 200，英文/日文首页技术栈标题是 Tech stack / 技術スタック，页脚星带有力扣的星，robots 整站禁止、页面 noindex，公网 beta 200；无头浏览器打开首页、英文首页、文章、手记、一言、时间线、一篇文章详情无脚本报错。容器约 239MB / 400MB，服务器可用内存约 170MB。
- **后台**：本仓库 cf9d6bf 构建（带“附加功能 → Yozora 主题”），数据目录 `admin/` 换成新版，原来的 a781a05 构建改名 `admin-yozora-a781a05-20261105`；`/proxy/qaqdmin` 200，入口脚本与本机构建一致。
- **力扣日历**：`NODE_USE_ENV_PROXY=1 node scripts/sync-leetcode.mjs --prod`，线上 `theme/leetcode-calendar` 现在记着账号 `sin-mt`（460 天）。

回滚：

```bash
# Core（约 20 秒）
sed -i 's#image: yozora/mx-server:20261105#image: yozora/mx-server:20261104#' /root/mx-space/core/docker-compose.yml
cd /root/mx-space/core && docker compose up -d --no-deps app
# 前台：current 指回 81383e8，再按“新前台”一节的命令重建容器
ln -sfn /root/mx-space/yozora-web/releases/81383e8 /root/mx-space/yozora-web/current
# 后台
D=/root/mx-space/core/data/mx-space; mv $D/admin $D/admin-yozora-cf9d6bf && mv $D/admin-yozora-a781a05-20261105 $D/admin
```

磁盘留给站长自己清：`/root/mx-space/core-image-20261104`（60M）、前台旧版本 `releases/7dd878b`、`releases/1b5a6d4`、上传用的 `yozora-web.tgz`、`yozora-admin.tgz`。

## 2026-11-05 已做：第三、四轮修复 + AI i18n + 首页影子上线（ac758f0）

站长同意后执行，Core、后台、前台三样都换，外加 i18n 数据迁移和 /shin 页面（改动见 AGENTS.md 2026-11-05 各条）。

- 备份：服务器 `/root/backups/2026-11-05b/`（`mongo-before-deploy-ac758f0.archive.gz` 整库，`mongorestore --dryRun` 通过；`docker-compose-before-ac758f0.yml`），本机另存 `.local/backups/server-20261105b/`。切换脚本 `switch-core.sh`、`switch-web.sh` 和日志也在这个目录。
- **Core**：`/root/mx-space/core-image-ac758f0/`，镜像 `yozora/mx-server:20261105-ac758f0`，停机约 18 秒，healthy，无新迁移。公网 API、旧 Shiro、beta 200。
- **后台**：数据目录 `admin/` 换成 ac758f0 构建，上一版改名 `admin-yozora-cf9d6bf`；`/proxy/qaqdmin` 200，入口脚本与本机构建一致。
- **Webhook**：44 → 46 个事件（补 `TRANSLATION_DELETE`、`I18N_UPDATE`），原列表 `.local/backups/prod-webhook-events-20261105b.json`。
- **i18n 迁移**：`push-i18n-source.mjs --prod`（430 条）→ 后台 AI 设置 `i18nLanguages` 设为 en、ja（原值空，备份 `.local/backups/prod-option-ai-i18n-20261105.json`）→ `import-i18n-legacy.mjs --prod --drop-snippet-i18n`（写入 880 条，片段 `i18n` 已删，原片段备份 `.local/backups/snippet-yozora-before-i18n-drop-prod-2026-11-05.json`）→ 剩下的 `hero.shadowLabel` 两条由 Agent 手写（站长选的，不调用 AI）→ 打开 `enableI18n`。**注意：开关关着时 `GET /ai/i18n` 的语言列表是空的，前台就没有英文、日文页面，所以开关必须在构建前台之前打开。** 旧前台不认识 `I18N_UPDATE`，切换前那两次投递是 400；新前台上线后重发一次是 200。
- **/shin 页面**：按本地（站长改过的）版本在线上新建，三张图从本机文件传到线上图床，孤儿列表里没有它们。线上 AI 设置开着“自动生成翻译”，Core 建页面后自动生成了英文、日文译文（`/en/shin` 标题是 Kuon Shin）。
- **前台**：`releases/ac758f0`（包 69MB），启动参数与上一版一致，停机约 3 秒。服务器本机 16 个地址 200（含 `/shin`、`/en/shin`），robots 整站禁止、页面 noindex；公网无头浏览器打开首页、英文、日文、/shin、文章、手记、一言、时间线无脚本报错，三种语言首页影子分别链到 `/shin`、`/en/shin`、`/ja/shin`，读屏文字是各自语言。容器约 231MB / 400MB，服务器可用内存约 164MB。

回滚：

```bash
# Core（约 20 秒）
sed -i 's#image: yozora/mx-server:20261105-ac758f0#image: yozora/mx-server:20261105#' /root/mx-space/core/docker-compose.yml
cd /root/mx-space/core && docker compose up -d --no-deps app
# 前台：current 指回 cf9d6bf，再按“新前台”一节的命令重建容器（旧前台读片段 i18n，回滚前台要先把片段备份里的 i18n 放回去）
ln -sfn /root/mx-space/yozora-web/releases/cf9d6bf /root/mx-space/yozora-web/current
# 后台
D=/root/mx-space/core/data/mx-space; mv $D/admin $D/admin-yozora-ac758f0 && mv $D/admin-yozora-cf9d6bf $D/admin
```

磁盘留给站长自己清：`/root/mx-space/core-image-20261105`、上传用的 `yozora-web-ac758f0.tgz`、`yozora-admin-ac758f0.tgz`，以及上一节列的旧版本。

## 2026-11-08 已做：X / Discord 分享卡片前台（f28dd0b）

按站长要求，仅切换 beta 前台，从 `releases/ac758f0` 到 `releases/f28dd0b`（封面设计为 1302adc）。未改 Core、admin、主站或数据库配置。后台网站地址仍是主站；本次仅给 beta 指定分享基址和爬虫例外，普通搜索爬虫仍禁止，页面继续 noindex。

构建和容器运行时均设 `SITE_NOINDEX=1`，并传入同一份环境变量：

```sh
export BETA_SHARE_URLS='https://beta.sin6626.me/ https://beta.sin6626.me/posts/study%26think/drive-based-learning-insights https://beta.sin6626.me/notes/10'
```

未设该变量的灰度部署仍对所有爬虫禁抓。开启后仅 Twitterbot / Discordbot 可抓上述页面和 `/api/og?`。第一轮用 11 个 worker 预渲染使线上读取超时，未切换版本；重启原 beta 前台释放内存后，构建脚本改用单 worker、每次预渲染一页，82 页成功。使用独立 worktree 构建 standalone；以旧 release 为 rsync 的 `--copy-dest` 上传至新目录，校验 server.js、BUILD_ID、OG route 和字体的 SHA-256 后切换。

验证：容器口、HTTPS 虚拟主机、公网源站（本机保留正式 TLS 域名指定源站 IP）均按两个爬虫的 UA 读取三页。标题、og:url、og:image、twitter:image 都正确，三张图均为 1200×630 PNG，页面 noindex，robots 保留测试范围。跨境 TLS 偶发重置，公网检查重试通过；未向平台发帖。验收时容器约 214 MiB / 400 MiB，未 OOM、未重启。临时构建 worktree 已移除。

旧容器 `yozora-web-pre-f28dd0b` 已停止并保留，挂载原版目录。切换脚本和验收日志在服务器 `/root/mx-space/yozora-web/switch-og-f28dd0b.{sh,log}`。如需回滚，先核实当前仍为这一版，再执行：

```sh
W=/root/mx-space/yozora-web
test "$(readlink -f "$W/current")" = "$W/releases/f28dd0b" &&
  docker stop yozora-web && docker rename yozora-web yozora-web-f28dd0b-stopped &&
  ln -sfn "$W/releases/ac758f0" "$W/current" &&
  docker rename yozora-web-pre-f28dd0b yozora-web && docker start yozora-web
```

**同日恢复首页角色**：此前上线只切了前台，正式片段缺少 `hero.mascot` 和 `hero.shadow`。已把本机 `.local/mascot/{back,blink,front}.webp`、`.local/persona/shin-avatar.webp` 原样放在现有对象存储的 `mx-images/theme/yozora/hero/`（文件名带内容哈希），四个公开对象逐个校验 SHA-256。它们是独立维护的主题素材，不用开发图链，也不属于 Core 上传后等待引用登记的文件。通过后台 API 只补这两项、保留其他字段，影子指向既有页面 `shin`；未升级 Core、未重建前台。中英日首页 HTML 均有三层角色图和本语言的角色页链接。修改前片段备份在 `.local/backups/yozora-prod-before-hero-20261108-213755.json`；如需撤回，只还原这两个字段，不要覆盖之后的其他配置。

## 2026-11-08 已做：实况图富文本节点（3b895ae）

按站长要求从同一提交构建 Core、beta 前台和 mx-admin。顺序：Core 健康 → beta 可用 → 替换后台。旧主站 Shiro 未更换。服务器上的数据库备份在 `/root/backups/yozora-live-3b895ae/mongo-serial.archive.gz`；第一次并行 dump 未完成，不可用，随后用单集合并发重做，gzip 检查与 mongorestore --dryRun 通过。本机 `.local/backups/server-live-3b895ae/` 内有逐项校验过 SHA-256 的有效备份和原 compose。

- Core：`yozora/mx-server:live-3b895ae`；原镜像 `yozora/mx-server:20261105-ac758f0` 保留。新 bundle 覆盖基础镜像中的同名入口，`node main.mjs` 导入新哈希模块，已对运行容器内的入口验哈希。
- beta：`releases/3b895ae`，保留三个 OG 实测链接和 noindex；旧容器 `yozora-web-pre-live-3b895ae` 已停止并保留，挂载 `releases/f28dd0b`。
- 后台：Core 数据目录 `admin/` 为新版，旧目录 `admin-before-live-3b895ae` 保留。线上写文章页 `https://api.sin6626.me/proxy/qaqdmin#/posts/edit` 的富文本工具栏可点开 **Live photo** 弹窗；只读浏览器检查确认实际的 JPEG/PNG 与 MP4 两个文件框，未放行任何写请求。截图在本机 `.local/previews/live-photo-online/admin-insert.jpg`。
- 本地：pnpm verify、实况图 4 项 Core 测试和真实编辑器/渲染器的隔离浏览器回归通过（测试上传响应，不写库）。线上：公网和服务器 HTTPS 入口验过 Core、旧主站、beta 首页/文章/手记、OG 图、原有丛雨与久遠真；实况图前后台脚本及样例 JPG/MP4 与构建哈希一致。未真实上传、保存或发布测试文章；功能范围见 `packages/live-photo/README.md`。
- 切换脚本及验收结果保存在 `/root/backups/yozora-live-3b895ae/{switch.sh,switch.log,check.py,expected.json}`。需回滚时先核对线上仍为此版本，停止新 beta 容器：将后台 `admin/` 改名留存并将旧后台目录改回 `admin/`，用备份 compose 还原 Core 并 `docker compose up -d --no-deps app`，beta 的 `current` 指回旧 release 后恢复旧容器原名并启动。回滚代码不应自动覆盖数据库，也不清理既有媒体。

## 第 1 步：备份

- MongoDB：`mongodump` 整库导出（Docker 跑的就在容器里执行再拷出来），放到服务器以外的地方再留一份。
- Core 的数据目录（`MX_DATA_DIR`，里面有日志、云函数缓存等）和启动配置（环境变量文件、`ecosystem.config.cjs` 或 compose 文件）。
- Nginx / 1Panel 里博客相关的站点配置。

## 第 2 步：把代码推到 GitHub

现在所有提交都只在本地。推送到 `sin6626/Yozora` 需要站长同意；服务器上从 GitHub 拉代码。

## 第 3 步：线上 Core 换成本仓库版本

具体做法等第 0 步的结果。不管哪种方式，要点都一样：

- 构建：在仓库根目录 `pnpm install --frozen-lockfile`，再 `pnpm build:sdk && pnpm --filter @mx-space/core build`（产物在 `apps/core/out`，入口 `main.mjs`）。
- 沿用原来的环境变量和数据目录，尤其是 `MX_ENCRYPT_KEY`（后台加密存的密钥靠它解开）、数据库地址、Redis 地址、`MX_DATA_DIR`。
- 跨域白名单加上 beta 域名：启动参数 `--allowed_origins` 或环境变量 `ALLOWED_ORIGINS`，逗号分隔，原来的主域名也要保留。
- 换完先看旧 Shiro 和线上后台是否一切照常，再继续。

## 第 4 步：部署新前台到 beta 子域名

（实际做法改成了本机构建、服务器只运行，见上面“新前台在服务器上跑起来”一节；下面是最初的设想。）

在服务器上（Node 24、pnpm 12）：

```bash
pnpm install --frozen-lockfile
MIX_SPACE_API_URL=https://Core的公网地址 SITE_NOINDEX=1 pnpm build
```

运行时也要带同样的环境变量（`SITE_NOINDEX` 必须写 `1`，写 `true` 不认）：

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `MIX_SPACE_API_URL` | Core 的公网 HTTPS 地址 | 服务端取数据用，也会交给浏览器直接请求 Core（评论、点赞、登录、“正在听”） |
| `MIX_SPACE_WEBHOOK_SECRET` | 新生成的随机串 | 和线上后台 Webhook 的 Secret 一致 |
| `SITE_NOINDEX` | `1` | 灰度期间不让搜索引擎收录：`robots.txt` 整站禁止，页面带 `noindex`（`apps/web/lib/indexing.ts`）。构建和运行时都要设，正式切换时去掉 |

启动：`pnpm --filter @sin/web exec next start -p 端口`，用 pm2 守护；反向代理把 `beta.你的域名` 转到这个端口，配好 HTTPS 证书。

## 第 5 步：线上后台补配置

- Webhook（附加功能 → Webhooks）：新建一条，地址 `https://beta.你的域名/api/webhooks/mix-space`，Secret 填上一步的值，事件按 [webhook-local.md](./webhook-local.md) 勾 30 个（不要勾“全部事件”）。不配也能用，只是改了内容后前台要等缓存过期（几分钟到一小时）。
- 登录：GitHub、Google 的回调地址是 Core 的地址，Core 域名不变就不用改。读者登录靠 Core 的 Cookie，beta 和 Core 在同一个主域名下才带得上。
- “网站地址”先保持旧站的域名（站点地图、RSS、分享链接会指向主域名），正式切换时再改。

## 第 6 步：把本地才有的东西搬上线

- 配置片段 `yozora`（首页技术栈、英文日文的站点描述、作品译名）：在线上后台“附加功能 → 配置片段”按本地那份新建；没有时前台用写死的默认值。
- “正在用 / 在听”的云函数：在 `.local/publish.json` 里配好线上的 API Token 后执行 `node scripts/install-ps-function.mjs --prod`，再把 Yohaku Companion 的地址改成线上 Core（见 [owner-presence.md](./owner-presence.md)）。
- 碎碎念：线上原来的速记要复制成碎碎念的话，先 `node scripts/migrate-murmurs.mjs --prod --dry-run` 看一遍，再去掉 `--dry-run`（只复制不删）。
- 英文、日文译文：本地补的那些在本地库里，要的话用 [manual-translation.md](./manual-translation.md) 的工具写到线上。

## 自己用的这段时间

- 在电脑和手机上都用一用：首页、文章、手记、碎碎念、一言星空、搜索、评论、登录、深浅主题、三种语言。
- 遇到问题截图记下来，带回本仓库修。`pnpm e2e` 是对着本地开发服务写的，不要对线上跑。
- 回滚：beta 前台直接停掉 pm2 进程即可；Core 出问题就换回原来的版本、必要时恢复第 1 步的备份。

## 正式切换（以后）

主域名指向新前台、去掉 `SITE_NOINDEX`、后台“网站地址”改成主域名、Webhook 地址改到主域名、停掉旧 Shiro。

后台“设置 → 网站”的 API 地址（serverUrl）、Gateway 地址（wsUrl）是 Core 自己用的，前台不读（前台连 Core 用部署时的 `MIX_SPACE_API_URL`）：GitHub、Google 登录的回调地址是 `serverUrl/auth/callback/<平台>`，退订链接、本地上传文件的地址也用 `serverUrl`，后台的实时连接用 `wsUrl`。线上现在是 `https://sin6626.me/api/v2` 和 `https://sin6626.me`，靠旧站那边把 `/api/v2` 转给 Core 才能用（2026-11-06 实测 200）。新前台没有这条转发，所以切换时二选一：在 1Panel 的主域名站点里保留 `/api/v2`（和 Socket.IO 路径）转发到 Core；或者把这两项改成 `https://api.sin6626.me/api/v2`、`https://api.sin6626.me`，同时把 GitHub、Google 的 OAuth 应用里的回调地址改成新地址。

2026-11-06 只读查过线上库：正文、草稿、评论、碎碎念里没有 `sin6626.me/api/v2` 的地址；但有 5 个存死的旧图片地址走的是 `https://sin6626.me/api/v2/objects/...`——友链头像 2 个（Guo xk 的博客、LZWcc's Blog）、话题图标 2 个（近况、占位符）、读者头像 1 个。同一个文件换成 `https://api.sin6626.me/api/v2/objects/...` 一样能打开。如果选“统一到 api 子域名”，切换时要把这 5 个地址一起改掉，再在主域名站点加一条 `/api/v2/*` → `https://api.sin6626.me/api/v2/*` 的 301 跳转，兜住已经发出去的退订邮件链接和别处存的旧图片地址。

注意：不要在线上用 mongosh 对整个库逐条 `JSON.stringify` 扫描（这次扫到 serverless_logs 等大集合时服务器可用内存掉到 21MB、SSH 断开，及时 kill 后恢复，服务没受影响）。只对内容集合的具体字段用正则 `countDocuments`。

## 2026-11-09 已做：缓存分层改造上线（b30be94）

站长同意后执行，只换 Core 和 beta 前台，后台不变（改动见 `docs/architecture-cache-plan.md` 与 AGENTS.md 2026-11-09 各条）。

- 备份：服务器 `/root/backups/yozora-cache-b30be94/`（`mongo.archive.gz` 整库，`mongorestore --dryRun` 通过；`compose-before.yml`；`web.env.before`；`yozora-web-inspect.json`）。切换脚本 `switch.sh` 与 `switch.log`、检查脚本和结果 `check.log`、`throttle.log` 也在这里。
- 构建：本机临时 worktree `/tmp/yozora-build`（b30be94），Core `apps/core/out` 用 rsync 传到 `/root/mx-space/core-image-b30be94/`（以上一版 `out/` 为底只传差异），服务器上构建镜像 `yozora/mx-server:cache-b30be94`，入口 `main.mjs` 哈希与本机一致；前台 standalone 包 75MB，解压到 `releases/b30be94`。worktree 和两个包都已删除。
- 内部密钥：切换脚本在服务器上用 `openssl rand -hex 32` 生成，写进 `/root/mx-space/core/.env`（600）和前台 `web.env`（600），没有打印，本机没有副本。compose 的 Core 环境变量加了 `- YOZORA_INTERNAL_KEY=${YOZORA_INTERNAL_KEY:?}`，镜像标签改为 `cache-b30be94`。
- 前台：`web.env` 加 `MIX_SPACE_INTERNAL_API_URL=http://mx-server:2333/api/v2`，容器启动参数与上一版相同，只是改为 `docker create` → `docker network connect core_mx-space yozora-web` → `docker start`。**以后重建前台容器都要加入这个网络**，否则内网连不上，前台会退回公网（照常可用，但重建缓存的请求会走 openresty）。
- 停机：Core 重建约 20 秒，前台约 10 秒。
- 验证：服务器本机 17 个地址 200（三种语言首页、文章、手记、碎碎念、一言、友链、思考、RSS、站点地图、robots、分享图），页面 `data-dpl-id="b30be94"`，robots 照旧；公网 beta、sin6626.me、API 200。容器里带密钥对 Core 并发 130 次全 200，不带密钥 100 次 200、30 次 429。openresty 的 api 日志里切换后前台容器只剩每分钟一次的 `/ai/i18n`（`proxy.ts` 读语言列表，量小没改）和分享图取头像（头像本来就是公网地址）。发一次 `/pageview?path=/posts&ref=…` 得 204，访问记录里是 `/posts` 和来源页；切换前最新的访问记录还是 `/aggregate` 这类接口地址。内存：刚启动时前台容器 331MB/400MB，一分钟后约 229MB，服务器可用约 250MB。

回滚：

```bash
# 先停新前台，把旧容器（挂着 releases/3b895ae）改回原名启动
W=/root/mx-space/yozora-web; B=/root/backups/yozora-cache-b30be94
docker stop yozora-web && docker rename yozora-web yozora-web-cache-b30be94-stopped
ln -sfn $W/releases/3b895ae $W/current && cp -p $B/web.env.before $W/web.env
docker rename yozora-web-pre-cache-b30be94 yozora-web && docker start yozora-web
# Core（约 20 秒）
cp -p $B/compose-before.yml /root/mx-space/core/docker-compose.yml
cd /root/mx-space/core && docker compose up -d --no-deps app
```

磁盘留给站长自己清：`/root/mx-space/core-image-20261104`、`core-image-20261105`、`core-image-ac758f0`，前台旧版本 `releases/7dd878b`、`1b5a6d4`、`2131c7a`、`81383e8`、`cf9d6bf`，以及停着的旧容器 `yozora-web-pre-live-3b895ae`。回滚要用的 `releases/3b895ae`、镜像 `live-3b895ae` 和容器 `yozora-web-pre-cache-b30be94` 先别删。

## 2026-11-10 事故：服务器内存耗尽，Core 被系统杀掉

上线前审查时对 beta 连续发了约 45 次页面请求、两次 `mongosh`，2GB 的服务器内存耗尽，内核 OOM 杀掉了 Core（dmesg 03:53），主站和 API 无响应、beta 502。根因是服务器本来就快满（MinIO ~290MB、Mongo ~270MB、Core ~210MB、旧 Shiro ~190MB、新前台 ~110MB、1Panel、Docker），而 `/etc/sysctl.conf` 里 `vm.swappiness = 0`，配好的 3.4GB 交换区一点没用。

- 站长同意后改为 `vm.swappiness = 10`（立即生效 + 写入 `/etc/sysctl.conf`，原文件备份 `/root/backups/sysctl.conf.bak-20261110`）。回滚：`sysctl -w vm.swappiness=0` 并还原备份。
- 恢复后（Core 自动重启）服务器内检查三个站点都是 200，负载 0.07。
- 以后对线上做只读检查：不跑 `mongosh`（一个就上百 MB），页面请求控制在几次；切换正式站后停掉旧 Shiro 能空出约 190MB。
