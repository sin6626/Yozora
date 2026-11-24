# 久遠 真 的 Live2D 模型：调研与推荐路线

2026-11-24 调研，只调研，没有改代码，也没有下载或安装软件。人设见 [persona-shin.md](persona-shin.md)，放进站里的边界见 [persona-plan.md](persona-plan.md)：Yozora 像 Mix Space 的一个主题，人设目前只出现在首页影子和 /shin 页。

价格、版本、条款都会变，下面每条都写了来源；标【弱】的只有单篇帖子或搜索摘要做依据。

---

## 结论（先看这里）

**推荐路线：在米画师一次约齐“Live2D 立绘 + 拆分 + 建模”，做一个胸像到半身的小模型，只放在 /shin 页；网页上用官方 Cubism Web SDK，读者打开 /shin 才加载。**

1. **现有图不能直接拆。** 四张定稿图都是 AI 生成的单张平面图，分辨率只有 440–760px，背景和人物画在一起，被挡住的地方没有画，各张图之间也对不上（见第三节）。所以必须找画师按 Live2D 的要求重新画一张分层立绘，现有图只当设定参考。
2. **找一个能同时画立绘和建模的人（或工作室）一次做完。** 画和拆层要按建模的需要来，分开找两个人容易返工；米画师有平台托管和分阶段付款。按米画师橱窗的报价，立绘加拆分约 ¥2650–5300，只做建模约 ¥1650–3700，两项合计大致 **¥4000–9000**（第五节）。
3. **用 Live2D，不用 Spine 或 Inochi2D。** 个人非商用站，Cubism Editor 免费版和网页发布都不用付钱（第二节）。Spine 要花 $379 买专业版，国内会用 Spine 做动漫角色的人少。Inochi2D 的网页运行库还是原型，不能上线。
4. **在站里要放得克制。** 只放在 /shin 页的主图位置：眨眼、呼吸、头发随风、视线跟着鼠标，不说话、不弹对话框、不跟着全站走。首页影子还是现在的静态圆形头像。理由是 Yozora 不把人设堆进站里，Live2D 的运行库（约 200KB）和贴图（几 MB）也只该让真想看她的人加载。
5. **网页端用官方 SDK，不引入 PixiJS。** Cubism Core 约 202KB；PixiJS v8 再加约 280KB（gzip 后），站里目前没有用 Pixi。和首页星空画布同时存在没有问题，因为两者不在同一页（第四节）。

**需要站长决定的事**见文末。

---

## 一、制作流程：从立绘到能动的模型

Live2D 官方教程把流程分成：处理插画 → 准备让插画动起来 → 表情 → 身体动作 → 头部 XY 转动 → 动画；网页嵌入另有一套：模型准备 → 物理 → 动作和表情 → 导出给网页用。（[官方教程目录](https://docs.live2d.com/en/cubism-editor-tutorials/top/)）

| 步骤 | 输入 | 产出 | 谁来做 | 大约多久 |
|---|---|---|---|---|
| 0. 定稿设定 | persona-shin.md + 定稿图 | 一张统一的设定说明（发长、耳机位置、姿势、表情清单） | **站长**（我可以帮忙整理说明） | 1–2 天 |
| 1. 画 Live2D 立绘 | 设定说明 | 高分辨率、分好层、被挡住的地方都补画好的 PSD | **画师** | 立绘 7–14 天起（[米画师 森佐木](https://www.mihuashi.com/stalls/99913)）【弱】 |
| 2. 拆分整理 | 立绘的 PSD | 一份拆分用 PSD 和一份导入用 PSD（每个部件合成一层、图层不重名） | 画师（通常和第 1 步一起报价） | 包含在上一步 |
| 3. 建模（rigging） | 导入用 PSD | .cmo3 工程，网格、变形器、参数（转头、眨眼、呼吸等） | **建模师** | 只做建模 3–4 周（[nizima 一例](https://nizima.com/OrdermadePlan/DetailOrdermadePlan/648)）【弱】 |
| 4. 物理、表情、动作 | 建好的模型 | physics3.json、exp3.json（表情）、motion3.json（待机动作） | 建模师 | 包含在上一步，表情、动作按个加价 |
| 5. 导出 | .cmo3 | .moc3、.model3.json、贴图 PNG 等运行时文件 | 建模师 | 包含在上一步 |
| 6. 放进网站 | 运行时文件 | /shin 页上能动的她 | **Agent**（写代码），站长验收 | 几天 |

各步骤的要点（来自官方手册）：

- **拆分**：把插画分成睫毛、眼球、轮廓线这样的部件，分得越细，动起来越好；推荐用 Photoshop 或 CLIP STUDIO PAINT。拆分时用图层蒙版，不直接涂在原图层上。（[About Material Separation](https://docs.live2d.com/en/cubism-editor-manual/divide-the-material/)）
- **补画被挡住的部分**：头发要分成刘海、侧发、后发，并补画原图里被挡住的地方；眼睛分睫毛、眼球、眼白；嘴分上唇、下唇、口腔。（[官方教程 1. 处理插画](https://docs.live2d.com/en/cubism-editor-tutorials/psd/)）
- **导入用 PSD**：每个部件合成一层，图层名不能重复；颜色配置用 sRGB，线稿和剪贴蒙版要合并，不能用图层蒙版。（[How to create PSDs to import](https://docs.live2d.com/en/cubism-editor-manual/reimport-psd/)、[Notes on PSD creation](https://docs.live2d.com/en/cubism-editor-manual/precautions-for-psd-data/)）

**站长自己能做的**：第 0 步写设定、第 6 步验收；如果想学，可以用 Cubism Editor 免费版自己建模（第二节的上限够做一个简单的胸像）。**必须找人做的**：第 1、2 步。站长的图都是 AI 生成的，按全局规则缺图要找画师，不能用 CSS 或 SVG 画。第 3–5 步可以自己学着做，但想要好看，还是交给建模师。

---

## 二、工具和许可

### Cubism Editor 免费版和 PRO 版

当前版本是 5.3（5.3.00 于 2026-01-20 发布）【弱，来源 [Live2D 官方 X](https://x.com/Live2D/status/2095436656325365913)、[5.3 新功能](https://docs.live2d.com/en/cubism-editor-manual/new-function5-3/)】。

**免费版的上限**（[官方对比页](https://www.live2d.com/en/cubism/comparison/)）：

| 项 | 免费版上限 |
|---|---|
| 贴图 | 1 张，最大 2048px |
| ArtMesh（网格） | 100 个 |
| 参数 | 30 个（其中混合形状最多 3 个） |
| 变形器 | 50 个 |
| 部件 | 30 个 |
| 弯曲变形器细分 | 9×9（PRO 是 100×100） |
| 导出图片、视频 | 最大 1280×720，视频带 Live2D 标志 |
| 超出上限 | 文件存不了 |

一个简单的胸像（转头、眨眼、眼珠、眉毛、呼吸、身体轻摆、头发物理）大概用 20–30 个参数，挤一挤能放进免费版；想加多个表情或手臂动作就会超出（这是我的估计，不是官方数字）。

**谁可以用免费版**：个人和年营收低于 1000 万日元的小企业，免费版和 PRO 版都能用于商用和非商用；PRO 有 42 天试用，试用期只能用于演示、评估和学习。（[对比页](https://www.live2d.com/en/cubism/comparison/)、[帮助中心](https://help.live2d.com/en/other/other_14/)、[About](https://www.live2d.com/en/cubism/about/)）**个人非商用站完全可以用免费版。**

**PRO 价格**（个人档，年营收低于 1000 万日元，[官方商店](https://store.live2d.com/en/)）：月付 ¥2,080 日元；年付首年 ¥14,280 日元。学生买三年 PRO 有大幅折扣（[About](https://www.live2d.com/en/cubism/about/)，页面上写了 76% 和 80% 两个数字）。只有站长自己建模、又超出免费版上限时才需要买；外包的话建模师自己有 PRO。

**要注意**：建模师用 PRO 做出来的 .cmo3 工程，如果超出免费版上限，站长用免费版打开后存不了。以后想自己改，要么买 PRO，要么约稿时请建模师控制在免费版上限以内。

### 在网站上发布要不要额外授权

- 发布内容时才可能需要“出版许可”（Publication License），但**个人和小企业免除许可和费用**（可扩展应用除外）。（[SDK 授权说明](https://www.live2d.com/en/sdk/license/)）
- 许可协议第 1.21、1.22 条：个人、学生、社团、年营收低于 1000 万日元的小企业属于这一类；第 2.2 条免除出版许可。营收超过这个数要通知 Live2D。（[Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)）**站长的博客不需要签任何许可。**
- 两部分代码的许可不同：网页框架 CubismWebFramework 用 Live2D Open Software License，核心 Cubism Core 用 Live2D Proprietary Software License。（[LICENSE.md](https://github.com/Live2D/CubismWebFramework/blob/develop/LICENSE.md)）
- **Core 不能放进 Yozora 的公开仓库**：协议第 5.3.2 条不允许把 Core 放在“要求公开源码或允许第三方修改”的开源许可下，而 Yozora 是公开的开源仓库（含 AGPL 代码）。官方仓库同样不收 Core，要从官网单独下载（[CubismWebSamples](https://github.com/Live2D/CubismWebSamples)、[Web SDK 下载页](https://www.live2d.com/en/sdk/download/web/)）。做法是部署时再取 Core，或者从 Live2D 的 CDN 加载。Core 是否在 SDK 自带的 RedistributableFiles.txt 里，这次没有核实（要下载 SDK 才能看）。
- **AI 图**：Live2D 不限制作品内容和制作过程，包括和 AI 有关的内容，只禁止侵犯他人权利的用法。（[Live2D 帮助中心](https://help.live2d.com/en/other/other_33/)）但官方市场 nizima 禁止 AI 生成的作品，也禁止用 AI 图做底稿的模型（[nizima AI 政策](https://docs.nizima.com/guide/ai-policy/)），所以那里不能用。

### 替代方案

| 方案 | 费用 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **Live2D Cubism** | 个人免费 | 动漫角色的事实标准，国内约稿和教程多，有官方网页 SDK | Core 闭源，不能放进公开仓库 | **推荐** |
| Spine | 网格和 IK 都要专业版 $379（基础版 $69 不含网格）（[价格](https://esotericsoftware.com/spine-purchase)） | 网页运行库完善（spine-player、spine-webgl、spine-pixi，[spine-ts](https://github.com/EsotericSoftware/spine-runtimes/tree/4.3/spine-ts)）；许可买断，不按月收费（[Editor 许可](https://esotericsoftware.com/spine-editor-license)） | 擅长游戏骨骼动画；动漫脸转头不如 Live2D 自然；国内很少有画师会用 Spine 做这种角色 | 不推荐 |
| Inochi2D | 开源，BSD-2 | 完全开源，可以放进仓库 | 编辑器最后正式版是 0.8.6（2024-09，[inochi-creator](https://github.com/Inochi2D/inochi-creator)）；网页运行库 inox2d 自称“原型阶段，不建议用于生产”（[inox2d](https://github.com/Inochi2D/inox2d)）；几乎没人接单 | 不推荐，等成熟 |
| 预先录好的透明视频 | 视频怎么做取决于画面来源 | 最轻，不加运行库 | 不能和读者互动；Safari 不支持 VP9 透明，要单独做一份 HEVC 透明视频，或用“上下拼接 + WebGL 合成”的办法（[Jake Archibald 2024](https://jakearchibald.com/2024/video-with-transparency/)） | Live2D 做好后可以当兜底：手机或减少动态效果时用 |
| 静态分层图 + CSS 呼吸 | 只需画师的分层图 | 首页丛雨就是这样做的（三层图夹着文字），站里已有现成做法 | 只能眨眼、呼吸这类简单动作 | 预算不够时的退路 |

---

## 三、现有素材够不够

**不够。** 现有图只能当设定参考，需要画师重画一张分层立绘。

看过的图（`.local/intro-video/refs/`，都是 AI 生成）：

| 图 | 尺寸 | 能不能拿来拆 | 问题 |
|---|---|---|---|
| ref1 全身 | 440×1024 | 不能 | 分辨率太低（拆分通常要求画布高 3000–4000px 以上，[知乎拆分规范](https://zhuanlan.zhihu.com/p/716796126)【弱】）；背景（校园、路灯、月亮）和人物画在一起；双臂交叉抱本子，挡住了胸前、衬衫、挂绳，被挡住的地方没有画 |
| ref2 脸 | 600×600 | 不能 | 耳机戴在头上（其他图挂在脖子上）；下半张脸被毛衣袖子挡住，嘴没有画 |
| ref3 三视图 | 604×646 | 不能，但**最适合当设定参考** | 正、侧、背三面都有，背景干净；每个人只有约 200px 宽 |
| ref4 写代码 | 760×1024 | 不能 | 是带场景的插画，人物坐着、被桌子挡住；可以当“戴眼镜”差分的参考 |

**图之间对不上的地方**（交给画师前要先定下来，写进约稿说明）：

- 耳机：挂在脖子上（ref1、ref3）还是戴在头上（ref2、ref4）。设定写的是平时挂在脖子上。
- 发长：ref4 比 ref1 短。设定写的是“到肩胛骨上方，所有视图一致”。
- 发梢渐变：ref1 渐变占了将近一半头发，设定只要最末端约十厘米。
- 姿势：设定的正式形象是“抱本子站着”。Live2D 能做，但双臂、本子都要单独分层，身体被挡住的部分要补画；手臂挡着，身体能摆动的幅度小。另一个选择是双手自然垂下（三视图里的姿势），动起来更自然。要站长选。

**需要画师补画、提供的东西**（这是约稿清单，不是我能用 CSS 画的）：

1. 一张正面、胸像到半身（到腰或大腿）的 Live2D 立绘，透明背景，画布高 3000px 以上。
2. 头发：刘海、侧发（左右）、后发、呆毛、发梢渐变分开画，被挡住的发根和后发内侧都要补全。
3. 脸：脸型、耳朵（藏在头发后的部分也要画）、眉毛（左右）、眼睛（上下睫毛、眼白、瞳孔、四角星高光单独一层，左右分开）、闭眼时的眼皮、嘴（上下唇、口腔、牙齿、舌头）、脸红。
4. 发夹（月牙和星星）单独一层。
5. 衣服：开衫的身体、左右袖子分开；衬衫领口；挂绳和卡片（卡片上只有星星）；领口下被开衫和手臂挡住的衬衫要补全。
6. 耳机（按定下的位置）单独一层。
7. 小本子（封面一颗月光色星星）单独一层，如果选抱本子的姿势。
8. 可选：眼镜单独一层，做成可以开关的“写代码”差分。
9. 表情（数量见“要站长决定的事”）：比如平常、好奇（呆毛立起）、开心、困惑；每个表情需要的眉毛、眼睛、嘴的形状由画师和建模师商量着画。

**AI 参考图要事先说明**：国内多数画 OC 人设的画师不接 AI 参考图，接了也可能被挂出来（[知乎](https://www.zhihu.com/question/1933963036827324734)、[知乎](https://www.zhihu.com/question/648004687)【中，讨论帖多但都是个人看法】）。下单前要说清楚图是 AI 生成的，请画师在这个基础上重新设计，这部分可能按“角色设计”另外收费（参考价 ¥1500，[米画师 雾原栖](https://www.mihuashi.com/stalls/202981)，已下架【弱】）。另外，AI 生成的图在国内的版权看具体情况：北京互联网法院 2023 年判过 AI 图片受著作权保护，但前提是人在里面有足够的智力投入（[中国知识产权网](http://www.cnipr.com/sj/al/bq/202401/t20240110_253643.html)）。画师重画后，新立绘的版权归属按约稿合同写。

---

## 四、怎么放进网站

### 运行库的选择

| 方案 | 现状 | 支持 Cubism 5 | 体积 | 结论 |
|---|---|---|---|---|
| **官方 Cubism Web SDK**（CubismWebFramework + Core） | 最新 5-r.5（2026-04-02），兼容 Cubism 5.3，WebGL/WebGL2 渲染（[CHANGELOG](https://github.com/Live2D/CubismWebFramework/blob/develop/CHANGELOG.md)） | 是 | Core 约 202KB（官方 CDN 文件大小）+ 框架源码 | **推荐**：不加新的大依赖，跟着官方更新 |
| pixi-live2d-display（guansss） | 稳定版 0.4.0（2022-09）只支持 Pixi 6；0.5.0-beta（2023-12）支持 Pixi 7；最后提交 2023-12，之后没有维护（[npm](https://registry.npmjs.org/pixi-live2d-display)、[GitHub](https://github.com/guansss/pixi-live2d-display)） | 否（只到 Cubism 4） | — | 不用 |
| untitled-pixi-live2d-engine（社区分支，MIT） | 1.4.0（2026-09-20），PixiJS 8，支持 Cubism 2–5，Core 仍要自己加载（[npm](https://registry.npmjs.org/untitled-pixi-live2d-engine)、[GitHub](https://github.com/Untitled-Story/untitled-pixi-live2d-engine)） | 是 | PixiJS 8 约 995KB，gzip 后 282KB（[bundlephobia](https://bundlephobia.com/api/size?package=pixi.js@8)）+ Core | 社区分支里最活跃，但为了一个模型引入 Pixi 太重 |

官方没有给 React/Next 的指南，示例都是纯 TypeScript（[CubismWebSamples](https://github.com/Live2D/CubismWebSamples)）。在 Next 里只能放在客户端组件里加载，不能服务端渲染（这是我的推断）。

### 体积和性能

- **Core**：官方 CDN 上的 `live2dcubismcore.min.js` 约 202KB（未压缩，调研时读取的文件大小）。
- **模型**：一张 2048 的贴图 PNG 大概 1–4MB【未核实】；解码后在显存里占约 16MB（2048×2048×4 字节）。胸像模型一张 2048 贴图就够；也可以导出小一些的贴图（nizima 预览用 512px，[nizima 文档](https://docs.nizima.com/en/guide/item-upload/live2d/)【弱】）。
- **和星空画布共存**：全站星空是一个固定铺满屏幕的 WebGL1 画布（`apps/web/components/starfield.tsx`，低功耗模式，像素比最高 1.5，内页安静时约每秒 15 帧）。Live2D 会再开一个 WebGL 画布。Chrome 桌面版一个页面大约能开 16 个 WebGL 上下文，安卓上少一些（[PlayCanvas 论坛](https://forum.playcanvas.com/t/too-many-active-webgl-contexts/13030)【弱】），两个没有问题。要做的是：模型画布离开视野、标签页隐藏时停帧（和星空现在的做法一样）；离开 /shin 页时释放 WebGL 上下文；“减少动态效果”时只显示静态图。
- **加载时机**：只在 /shin 页、模型出现在视野里时才加载 Core 和模型，不影响其他页面。首页影子保持静态图片，点了才进 /shin。

### Core 从哪里来

不能把 Core 提交进 Yozora 的公开仓库（见第二节）。两种做法：

1. 从 Live2D 官方 CDN 加载：最省事，但国内读者访问速度没有测过，而且依赖外部服务。
2. 部署脚本在构建时下载 Core，和前台一起发布到自己的服务器：速度可控，仓库里没有 Core。

推荐第 2 种。实施前要再确认 Core 在 SDK 的 RedistributableFiles.txt 里。

### 后台怎么控制

照首页丛雨和影子的做法（配置片段 `theme/yozora` 的 `hero.mascot`、`hero.shadow`，没填就不显示），给 /shin 的 Live2D 也留一个配置项，模型文件放图床。别人用 Yozora 主题时不会出现这个角色。这是实施时的设计，这一轮不做。

---

## 五、外包参考

### 找人的渠道（2026-11-24 查）

| 渠道 | 是什么 | 平台担保 | AI 规定 |
|---|---|---|---|
| **米画师**（推荐） | 国内主流约稿平台 | 平台托管，按阶段确认；中途取消按阶段付给画师（草稿 20%、线稿 30%、上色 60%）；成交抽 5%（[服务协议](https://www.mihuashi.com/terms/mihuashi)） | 要求原创；“禁止提交纯 AI 稿件”只见于[百度百科](https://baike.baidu.com/item/%E7%B1%B3%E7%94%BB%E5%B8%88/20290837)转述【弱】；没找到关于单主用 AI 参考图的规定 |
| 画加（网易） | 约稿平台 | 分阶段付款、平台担保、可仲裁（[知乎对比](https://zhuanlan.zhihu.com/p/1941454881383777309)）【弱】 | 没找到 |
| B 站工房 | B 站的约稿交易 | 有订单，但有人投诉画师超时后订单自动确认、钱退不回（[贴吧](https://tieba.baidu.com/p/8899420591)）【弱】 | 没找到 |
| 闲鱼、小红书、LOFTER | 只适合找人、看作品 | 小红书、LOFTER 不担保；有冒充“担保”的骗局（[搜狐 2026-09](https://www.sohu.com/a/1087905865_121123852)） | 不审核 |
| nizima（Live2D 官方市场） | 日本，有定制服务 | 抽 10%（[介绍](https://docs.nizima.com/en/guide/introduction/)） | 禁止 AI 作品和以 AI 图为底稿的模型（[AI 政策](https://docs.nizima.com/guide/ai-policy/)），**不适合** |
| VGen | 欧美平台，VTuber 模型多 | 有 | 画师不能交 AI 作品；单主给 AI 参考图不会被处罚，接不接画师决定（[AI Policy](https://help.vgen.co/hc/en-us/articles/12882944163991-AI-Policy)，只看到摘要） |
| Skeb | 日本约稿 | 有 | 交付物不能有 AI 内容；Live2D 只能按“视频”接单，拿不到模型文件（[Medium 2023-09](https://medium.com/skeb-jp/renewal-e0ad2b0c5cec)）【弱】，**不适合** |

### 价位（人民币，米画师橱窗，2026-11-24 查）

| 项目 | 报价 | 来源 |
|---|---|---|
| 立绘 + 拆分（含设计和 5 个表情） | ¥2650；加表情 ¥20/个，加动作 ¥100–200/个 | [鱼和鸟](https://www.mihuashi.com/stalls/113319) |
| 立绘 + 拆分 | ¥3888 | [幼子酥](https://www.mihuashi.com/stalls/57217) |
| 立绘 + 拆分 | ¥5263，7–14 天 | [森佐木](https://www.mihuashi.com/stalls/99913) |
| 立绘 ¥4500 起，拆分另加 ¥400 / 高精 ¥800，角色设计 ¥1500 | — | [雾原栖](https://www.mihuashi.com/stalls/202981)（已下架） |
| 只做建模 | ¥1650（全身，半身约 2/3）–¥3700 | [匿名函](https://www.mihuashi.com/stalls/12882)、[不在証明](https://www.mihuashi.com/stalls/90775)、[玖达](https://www.mihuashi.com/stalls/39226)、[杏野](https://www.mihuashi.com/stalls/468649) |
| 建模加表情 | ¥25/个（送 3 个） | [瑶酱](https://www.mihuashi.com/stalls/95971) |

一条龙的分档（[什么值得买 2026-08-11](https://post.smzdm.com/p/a5rgx20k/)，单篇文章，20 多个样本）：¥600–3000 是普通定制，¥3000–10000 是高精，¥1 万以上是顶级。

**加价惯例**（米画师多个橱窗）：商用 ×2，买断 ×3，加急 ×1.5–2。很多建模报价已经含个人商用。站长的博客按非商用算；如果以后想把她当长期 IP（persona-plan.md 待办 7），约稿时就写明买断或商用授权。

### 交付物清单（写进约稿说明）

**立绘部分**：

- 拆分用 PSD 和导入用 PSD 各一份，sRGB，画布高 3000px 以上，图层名不重复，左右用 L/R 并说好是画面左右还是角色左右。（[官方注意事项](https://docs.live2d.com/en/cubism-editor-manual/precautions-for-psd-data/)、[知乎拆分规范](https://zhuanlan.zhihu.com/p/716796126)【弱】）
- 被挡住的部分都要补画（第三节清单）。
- 没有部件之间的颜色渗边。

**模型部分**（文件类型见[官方文件说明](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)）：

- 运行时文件：`.moc3`、`.model3.json`、贴图 PNG、`.physics3.json`（头发、衣服、耳机线的物理）、`.exp3.json`（每个表情一个）、`.motion3.json`（待机动作），可能还有 `.pose3.json`、`.cdi3.json`。
- 参数至少要有：头的 X/Y/Z 转动、身体转动、左右眼开合、眼珠 X/Y、眉毛、呼吸、嘴的开合和形状；眼镜做成能开关的部件（如果要）。
- **工程源文件 `.cmo3`**：有它站长才能自己改模型，国内建模师普遍不卖，卖的话一般是总价 ×2（米画师 杏野）。只要 `.moc3` 的话，以后改动只能找原建模师。

**合同条款**：

- 工期：一条龙大约 4–6 周【弱】；免费修改次数（常见 2 次）。
- 用途：写明“个人非商用网站公开展示，可以在网页上交互”；署名放在 /shin 页。
- 画师和建模师通常保留署名权和作品展示权（[参考](https://yrfwch.com/how-to/2025/02/how-to-live2d-data)【弱】）。

---

## 要站长决定的事

1. **放在哪**：只在 /shin 页（推荐）；还是首页影子也换成 Live2D；还是先不做，只做静态分层图。
2. **姿势和范围**：抱本子站着（设定的正式形象，但手臂挡着身体，动起来受限制）还是双手自然垂下；胸像还是半身；要不要“戴眼镜”开关。
3. **动作和表情**：推荐最小一套：待机呼吸、眨眼、视线跟着鼠标、头发物理，加 3–4 个表情（平常、好奇、开心、困惑），不做口型。多一个表情、动作都要加钱。
4. **授权**：只要个人非商用（便宜），还是一次买断或商用（将来当 IP 用，约 ×2–×3）。
5. **要不要 `.cmo3` 源文件**：要的话贵一倍左右，但以后能自己改。
6. **预算和找人方式**：米画师找一条龙（推荐，合计约 ¥4000–9000），还是立绘和建模分开找。
7. **AI 参考图**：同意下单时说明图是 AI 生成的，并请画师重新设计；先把第三节列出的耳机、发长、发梢、姿势这几处定下来。

站长决定后，我可以把第三、五节整理成一份可以直接发给画师的约稿说明。

## 这次没有核实的

- Cubism Core 是否在 SDK 自带的 RedistributableFiles.txt 里（要下载 SDK 才能看）。
- 米画师、画加关于 AI 的条款原文（页面要登录或脚本渲染，只看到第三方转述）。
- 模型贴图的实际大小、国内访问 Live2D CDN 的速度。
- 官方商店的日元价格是否含税（推测不含 10% 消费税）。
- 调研 Core 大小时，子任务用 curl 读取了一次 CDN 上的 Core 文件（只读到 /dev/null 看大小，没有保存）。
