# 站长“正在用 / 在听”

页头左边是头像（首页链接），右边是站名区。站长在电脑前时，站名停 6 秒后向上滚成“正在用的 App 图标 + 音频条”，停 14 秒（一个周期里占七成）再滚回站名，如此轮流。放歌时音频条舒缓地跳，没放歌时是几颗安静的点。这一格始终是站名的宽度，导航不会跟着挪。

鼠标移到图标上（键盘聚焦、触屏点一下也行）弹出一张字条：用首屏的霞鹜文楷写一句话，比如“Sin 正开着 [Chrome 图标] Google Chrome，耳机里是颜人中的《晚安》。”（App 名和歌名加重，主语是后台个人资料里的站长名字）；放歌时下面一行是放歌软件的图标（网易云、Apple Music、Spotify 等，lib/app-icons.ts 认得的；认不得时是一张很小的、在转的唱片）+ 进度线 + “1:20 / 4:49”，播放器没给进度时图标跟在句尾；没放歌时是“……，此刻很安静。”。中日文只在标点处换行。字条和夜航岛胶囊一样，浅色深色主题下都是深色。不显示 App 用了多久（站长明确不要被计时，云函数也不记）。站名区在头像链接外面，悬停它不会点亮头像。站名区被藏起来（读文章收成小胶囊、岛上播报）时卡片自动关掉。

顶部铺开和往下滚后的深色导航条里都会滚；读文章收成小胶囊时不滚，改成头像外圈的月光慢慢呼吸。没有图标时显示 App 名首字的小方块。调试页“页头站名滚动”有三个写死数据的示例。

## 链路

1. 站长 Mac 上的 [Yohaku Companion](https://github.com/Innei/YohakuCompanion)（菜单栏小工具，Apple Silicon、macOS 15 以上）读系统的“最前面的 App”和“正在播放”，按它自己的隐私规则过滤后，每隔几秒（默认 10 秒）用“MixSpace 兼容通道”POST 给 Core。
2. Core 的云函数 `/fn/ps/update`（源码 `scripts/functions/ps-update.ts`）校验密钥，只留 App 名、https 图标，以及歌名、歌手、播放器、时长、进度和采样时间（不记 App 用了多久），存进 Redis（两分钟过期）。换了 App、换了歌或进度比推算的差 5 秒以上（拖动了进度）时通过 WebSocket 广播 `fn#ps-update` / `fn#media-update`。窗口标题不存不播。Companion 只在音乐正在播放时才发歌曲信息，所以有歌就是在放，前台按采样时间往前推算进度。注意 Companion 只在切歌、暂停、拖动进度时重新采样，心跳时原样重发上次的进度（比如一直是 0.708 秒）；云函数把“同一首歌、进度数字没变”当成同一次采样，沿用第一次收到它的时间，否则页面会一直停在前几秒。
3. 前台 `components/owner-presence.tsx`（根布局的 SiteName 渲染，作为 SiteHeader 的 presence 放在头像链接后面；样式在 `owner-presence.css`）打开页面时 GET 一次，之后听广播即时更新；标签页可见时每分钟再读一次（过期不会广播）。停留时间只算看得见、没被打断的时间：小胶囊、播报、后台标签页、鼠标悬停、键盘聚焦、卡片或导航面板开着时都不走。读屏把“站长此刻：……”作为首页链接的描述（aria-describedby）。

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

Companion 传的图标是 32×32 的 PNG（它读 macOS 图标时用的默认尺寸，改不了），放大会糊。所以常见 App 改用离线图标集里的矢量标志：`apps/web/lib/app-icons.ts` 是“App 名 → 图标”对照表（Chrome、Edge、Safari、VS Code、Cursor、Claude、微信、QQ、网易云音乐等 30 多个，中英文名都列），`/api/app-icon/<key>`（`app/api/app-icon/[key]/route.ts`）在服务端把标志画到 macOS 风格的圆角白底上，返回 SVG（地址带版本号，缓存一年）。认不得的 App 仍用 Companion 的小图标，按原大小放在玻璃底上，不拉大；都没有时显示首字。新 App 在对照表里加一行即可。Core 每小时的孤儿图片清理只删通过 Core 上传、有记录的文件，Companion 直接传的图标不会被删。

## 测试

- `node scripts/verify-presence.mjs`：云函数的密钥、清洗、只在变化时广播、清空，前台解析（pnpm verify）
- `node scripts/e2e/owner-presence.mjs`：调试页示例的 6/14 秒节奏、宽度不变、图标/首字/跳动音频条/安静的点、字条的句子与文楷字体、矢量图标、小唱片在转和进度线、“此刻很安静。”不断行、悬停不点亮头像、卡片开着不滚、减少动态效果；真实页头在浏览器里拦截 GET、断开 WebSocket（不受站长实时上报干扰，也不写 Core）检查滚动、导航不挪、读屏描述、胶囊里光圈呼吸（pnpm e2e，需要 pnpm dev）
- Core：`apps/core/test/src/modules/serverless/serverless.service.spec.ts` 里 `throws` 保留状态码、`cache.del` 真的删除两条
- `node scripts/e2e/header-smooth.mjs`：夜航岛切换时头像大小不变、外框不冲过头（pnpm e2e）
