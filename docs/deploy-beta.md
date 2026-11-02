# 灰度上线：新前台先放在 beta 子域名上自己用

2026-11-02 用户定：新前台和旧 Shiro 放在同一台服务器，新前台用子域名（下面写作 `beta.你的域名`），只给自己用、不让搜索引擎收录；线上 Core 换成本仓库的版本，新旧两个前台读同一份线上数据。主域名继续是旧 Shiro，自己用一两周没问题再切换。

Agent 不登录服务器、不使用聊天里给的 root 密码，服务器上的操作都由站长自己执行；Agent 负责准备脚本、配置和清单，并根据站长贴回来的输出调整。

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
