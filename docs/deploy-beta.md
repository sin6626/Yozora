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

- 配置片段 `sin-space`（首页技术栈、英文日文的站点描述、作品译名）：在线上后台“附加功能 → 配置片段”按本地那份新建；没有时前台用写死的默认值。
- “正在用 / 在听”的云函数：在 `.local/publish.json` 里配好线上的 API Token 后执行 `node scripts/install-ps-function.mjs --prod`，再把 Yohaku Companion 的地址改成线上 Core（见 [owner-presence.md](./owner-presence.md)）。
- 碎碎念：线上原来的速记要复制成碎碎念的话，先 `node scripts/migrate-murmurs.mjs --prod --dry-run` 看一遍，再去掉 `--dry-run`（只复制不删）。
- 英文、日文译文：本地补的那些在本地库里，要的话用 [manual-translation.md](./manual-translation.md) 的工具写到线上。

## 自己用的这段时间

- 在电脑和手机上都用一用：首页、文章、手记、碎碎念、一言星空、搜索、评论、登录、深浅主题、三种语言。
- 遇到问题截图记下来，带回本仓库修。`pnpm e2e` 是对着本地开发服务写的，不要对线上跑。
- 回滚：beta 前台直接停掉 pm2 进程即可；Core 出问题就换回原来的版本、必要时恢复第 1 步的备份。

## 正式切换（以后）

主域名指向新前台、去掉 `SITE_NOINDEX`、后台“网站地址”改成主域名、Webhook 地址改到主域名、停掉旧 Shiro。
