# 站长“正在用 / 在听”

页头头像右边的站名区：站长在电脑前时，站名停 6 秒后向上滚成“正在用的 App 图标 + 跳动的音频条”，4 秒后滚回站名，如此轮流。不写 App 名和歌名，鼠标停在上面时暂停，提示框里能看到“在用 Microsoft Edge · 在听 小孩 – 罗燕涛”。这一格始终是站名的宽度，导航不会跟着挪。顶部铺开和往下滚后的深色导航条里都会滚；读文章收成小胶囊时不滚，改成头像外圈的月光慢慢呼吸。没有图标时显示 App 名首字的小方块。调试页“页头站名滚动”有三个写死数据的示例。

## 链路

1. 站长 Mac 上的 [Yohaku Companion](https://github.com/Innei/YohakuCompanion)（菜单栏小工具，Apple Silicon、macOS 15 以上）读系统的“最前面的 App”和“正在播放”，按它自己的隐私规则过滤后，每隔几秒（默认 10 秒）用“MixSpace 兼容通道”POST 给 Core。
2. Core 的云函数 `/fn/ps/update`（源码 `scripts/functions/ps-update.ts`）校验密钥，只留 App 名、https 图标、歌名和歌手，存进 Redis（两分钟过期），有变化时通过 WebSocket 广播 `fn#ps-update` / `fn#media-update`。窗口标题不存不播。
3. 前台 `components/owner-presence.tsx`（由根布局的站名 SiteBrand 渲染，样式在 `site-header.css` 的 `.brand-ticker`）打开页面时 GET 一次，之后听广播即时更新；标签页可见时每分钟再读一次（过期不会广播）。停留时间只算看得见、没被打断的时间：小胶囊、播报、后台标签页、鼠标悬停、导航面板展开时都不走。读屏把“站长此刻：……”作为首页链接的描述（aria-describedby）。

Mac 睡眠、锁屏、关机或 Companion 退出后，最多约三分钟从网站上消失。

## 安装云函数

```bash
node scripts/install-ps-function.mjs
```

第一次运行会生成密钥，存在 `.local/presence.json`（不进 git，权限 600）。重复运行只更新函数代码、密钥不变；`--rotate-key` 换新密钥；`--prod` 装到线上（读 `.local/publish.json` 的 prod 配置）；`--dry-run` 只看不写。

## 配置 Yohaku Companion

在 Companion 的 Settings → Destinations → MixSpace 里填：

- Endpoint：`http://127.0.0.1:2333/fn/ps/update`（线上换成 Core 的 https 地址，Companion 只允许本机用 http）
- API Token：`.local/presence.json` 里对应环境的 `key`
- Request Method：POST

建议：General 里开 Applications 和 Media Playback，关掉 Window Titles；不想公开的 App（微信、游戏等）在 Privacy & Rules 里设成 Hide，或用 Alias 改个名字。

App 图标由 Companion 传到图床（Destinations → Application Icon Hosting），和后台“设置 → 存储 → 图床设置”用同一个 S3：

- Bucket `mx-images`，Region `auto`，Access Key / Secret Key 从后台图床设置复制（站长自己填）
- Advanced：S3 Endpoint `https://s3.sin6626.me`，Object Path `app-icons`，Public URL Prefix `https://s3.sin6626.me/mx-images`
- 保存后打开 Enabled 再保存，用 Upload Test Icon… 验证公开地址能访问

图标是 32×32 的 PNG。Core 每小时的孤儿图片清理只删通过 Core 上传、有记录的文件，Companion 直接传的图标不会被删。

## 测试

- `node scripts/verify-presence.mjs`：云函数的密钥、清洗、只在变化时广播、清空，前台解析（pnpm verify）
- `node scripts/e2e/owner-presence.mjs`：调试页示例的滚动节奏、宽度不变、图标/首字/音频条、悬停暂停、减少动态效果；真实页头在浏览器里拦截 GET、断开 WebSocket（不受站长实时上报干扰，也不写 Core）检查滚动、导航不挪、读屏描述、胶囊里光圈呼吸（pnpm e2e，需要 pnpm dev）
- Core：`apps/core/test/src/modules/serverless/serverless.service.spec.ts` 里 `throws` 保留状态码、`cache.del` 真的删除两条
