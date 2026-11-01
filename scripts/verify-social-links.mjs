import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查社交链接：后台能选的平台（apps/admin/src/constants/social.ts）和前台认识的平台（apps/web/lib/social.ts）一一对应，
// 前台每个平台都有已装的图标；填 ID 拼主页地址、贴完整链接原样用、去掉跟踪参数和 @、邮箱、旧键名 twitter。
// 用法：node scripts/verify-social-links.mjs（pnpm verify）
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/social.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports, encodeURIComponent })
const { socialLinks, socialCards, socialPlatformKeys } = module.exports
const plain = (value) => JSON.parse(JSON.stringify(value))

const adminKeys = [...readFileSync(new URL('../apps/admin/src/constants/social.ts', import.meta.url), 'utf8').matchAll(/key: '([\w-]+)'/g)].map((m) => m[1])
assert.deepEqual(adminKeys, [...socialPlatformKeys], '后台能选的平台要和前台认识的一一对应（顺序也一致）')
assert.equal(adminKeys.length, 23)

const sets = { 'simple-icons': require('@iconify-json/simple-icons/icons.json'), mingcute: require('@iconify-json/mingcute/icons.json') }
for (const link of [...socialLinks(Object.fromEntries(socialPlatformKeys.map((key) => [key, key === 'email' ? 'a@b.cn' : 'sin']))), ...socialCards({ wechat: 'sin', qq: '1', discord: 'sin', donate: { qr: 'https://s3.example.com/pay.webp' } })]) {
  const [prefix, name] = link.icon.split(':')
  assert.ok(sets[prefix]?.icons[name], `${link.label} 的图标 ${link.icon} 应当在已装的图标集里`)
  assert.match(link.color, /^#[0-9A-F]{6}$|^var\(--[\w-]+\)$/, `${link.label} 要有悬停用的品牌色`)
}

const hrefs = (ids) => plain(socialLinks(ids)).map((link) => link.href)
assert.deepEqual(hrefs({ github: 'sin6626', bilibili: '514794835?spm_id_from=333.1007.0.0' }), ['https://github.com/sin6626', 'https://space.bilibili.com/514794835'], '按后台顺序，去掉 ? 后面的跟踪参数')
assert.deepEqual(hrefs({ douyin: 'https://www.douyin.com/user/MS4wLjABAAAA_abc?from=share' }), ['https://www.douyin.com/user/MS4wLjABAAAA_abc?from=share'], '贴完整链接原样使用')
assert.deepEqual(hrefs({ x: 'javascript:alert(1)' }), ['https://x.com/javascript%3Aalert(1)'], '不是 http(s) 链接时当 ID，编码后拼在平台域名下')
assert.deepEqual(hrefs({ youtube: '@sin', twitter: 'sin', steam: '76561197960287930' }), ['https://www.youtube.com/@sin', 'https://x.com/sin', 'https://steamcommunity.com/profiles/76561197960287930'], 'YouTube 去掉开头的 @；旧键名 twitter 按 X；Steam 17 位数字 ID 走 /profiles/')
assert.deepEqual(hrefs({ email: 'sin@example.com', netease: '12345' }), ['mailto:sin@example.com', 'https://music.163.com/#/user/home?id=12345'])
assert.deepEqual(hrefs({ email: 'not-an-email', github: '', zhihu: 'a b', myspace: 'sin', weibo: 123 }), [], '无效邮箱、空值、含空格、不认识的平台、非字符串都跳过')
assert.deepEqual(plain(socialLinks({ GitHub: 'sin' }))[0], { key: 'github', label: 'GitHub', icon: 'simple-icons:github', color: '#181717', dark: true, href: 'https://github.com/sin' }, '键名不区分大小写；GitHub 是深色品牌')
assert.deepEqual(plain(socialLinks(Object.fromEntries(socialPlatformKeys.map((key) => [key, key === 'email' ? 'a@b.cn' : 'sin'])))).filter((link) => link.dark).map((link) => link.key), ['github', 'douyin', 'v2ex', 'x', 'steam'], '深色品牌：GitHub、抖音、V2EX、X、Steam')
// 名片类（微信、QQ）：不出现在直达链接里；值可以是号码字符串或 { id, qr }，二维码只放行 http(s)
assert.deepEqual(hrefs({ wechat: { id: 'sin', qr: 'https://s3.example.com/wx.webp' }, qq: '3554989283' }), [], '名片类不算直达链接（导航面板因此不显示）')
assert.deepEqual(plain(socialCards({ github: 'sin', wechat: { qr: 'https://s3.example.com/wx.webp' }, QQ: ' 3554989283 ' })), [
  { key: 'wechat', label: '微信', icon: 'simple-icons:wechat', color: '#07C160', dark: false, qr: 'https://s3.example.com/wx.webp' },
  { key: 'qq', label: 'QQ', icon: 'simple-icons:qq', color: '#1EBAFC', dark: false, id: '3554989283' },
])
assert.deepEqual(plain(socialCards({ wechat: { id: '', qr: 'javascript:alert(1)' }, qq: {} })), [], '号码和二维码都没有（或二维码不是 http(s)）时不显示')
// Discord 改为名片（主页链接要登录 Discord 才能看）：旧数据里的字符串当用户名显示，不再拼成链接；赞赏码只放二维码
assert.deepEqual(hrefs({ discord: '123456789012345678' }), [], 'Discord 不再是直达链接')
assert.deepEqual(plain(socialCards({ discord: 'sin6626', donate: { qr: 'https://s3.example.com/pay.webp' } })), [
  { key: 'discord', label: 'Discord', icon: 'simple-icons:discord', color: '#5865F2', dark: false, id: 'sin6626' },
  { key: 'donate', label: '赞赏', icon: 'mingcute:teacup-fill', color: 'var(--love)', dark: false, qr: 'https://s3.example.com/pay.webp' },
])
// 平台名称跟着站点语言（悬停提示、读屏文字用）：英文页面不能有汉字；日文页面不能直接用中文名（简体字），没传语言时是中文
const everyPlatform = (lang) => [
  ...plain(socialLinks(Object.fromEntries(socialPlatformKeys.map((key) => [key, key === 'email' ? 'a@b.cn' : 'sin'])), lang)),
  ...plain(socialCards(Object.fromEntries(socialPlatformKeys.map((key) => [key, 'sin'])), lang)),
]
const zhNames = Object.fromEntries(everyPlatform().map((item) => [item.key, item.label]))
assert.equal(Object.keys(zhNames).length, socialPlatformKeys.length, '每个平台都有名称')
for (const item of everyPlatform('en')) assert.ok(!/\p{Script=Han}/u.test(item.label), `英文名称不能有汉字：${item.key} → ${item.label}`)
for (const item of everyPlatform('ja')) if (/\p{Script=Han}/u.test(zhNames[item.key])) assert.notEqual(item.label, zhNames[item.key], `日文名称不能直接用中文：${item.key} → ${item.label}`)
assert.deepEqual(['bilibili', 'email', 'wechat', 'donate'].map((key) => [zhNames[key], everyPlatform('en').find((item) => item.key === key).label, everyPlatform('ja').find((item) => item.key === key).label]), [
  ['哔哩哔哩', 'Bilibili', 'ビリビリ動画'],
  ['邮箱', 'Email', 'メール'],
  ['微信', 'WeChat', 'WeChat'],
  ['赞赏', 'Tip', '投げ銭'],
])
console.log('PASS social links: admin and web platforms match, every icon installed, id/link/email/alias handling, WeChat/QQ/Discord/donate cards, names in zh/en/ja')
