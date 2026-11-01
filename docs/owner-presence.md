# 站长“正在用 / 在听”

访客在页面顶部、站名下面能看到站长此刻在用的 App 和在听的歌，比如“在用 Visual Studio Code · 在听 夜に駆ける – YOASOBI”。往下滚、页头变成导航条以后不显示。

## 链路

1. 站长 Mac 上的 [Yohaku Companion](https://github.com/Innei/YohakuCompanion)（菜单栏小工具，Apple Silicon、macOS 15 以上）读系统的“最前面的 App”和“正在播放”，按它自己的隐私规则过滤后，每隔几秒（默认 10 秒）用“MixSpace 兼容通道”POST 给 Core。
2. Core 的云函数 `/fn/ps/update`（源码 `scripts/functions/ps-update.ts`）校验密钥，只留 App 名、https 图标、歌名和歌手，存进 Redis（两分钟过期），有变化时通过 WebSocket 广播 `fn#ps-update` / `fn#media-update`。窗口标题不存不播。
3. 前台 `components/owner-presence.tsx` 打开页面时 GET 一次，之后听广播即时更新；标签页可见时每分钟再读一次（过期不会广播）。

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

App 图标要 Companion 把图标传到图床（Destinations → Application Icon Hosting，S3 兼容），没配时前台用一盏小灯代替。

## 测试

- `node scripts/verify-presence.mjs`：云函数的密钥、清洗、只在变化时广播、清空，前台解析（pnpm verify）
- `node scripts/e2e/owner-presence.mjs`：真实走一遍 POST → 广播 → 页头显示 → DELETE（pnpm e2e，需要 pnpm dev 和已安装的云函数）
- Core：`apps/core/test/src/modules/serverless/serverless.service.spec.ts` 里 `throws` 保留状态码、`cache.del` 真的删除两条
