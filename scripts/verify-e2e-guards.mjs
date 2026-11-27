// 直接写库的浏览器测试（scripts/e2e/plate-content.mjs）只许连隔离验证环境：
// 没给全 MONGO_URL/MONGO_DB/WEB_URL、或者指向日常库（27018 / shrio-import-*）、别的端口、远程主机时，在连数据库之前就退出。
// 后半段真的启动那个脚本：预加载里把所有网络连接换成“记一笔然后退出 99”，证明拒绝时一次连接都没发起。
// 用法：node scripts/verify-e2e-guards.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isolatedTarget } from './lib/e2e-guard.mjs'

const safe = { MONGO_URL: 'mongodb://127.0.0.1:27029', MONGO_DB: 'sinpersonalspace-verify', WEB_URL: 'http://127.0.0.1:2523' }
assert.deepEqual(isolatedTarget(safe), { mongoUrl: safe.MONGO_URL, db: safe.MONGO_DB, webUrl: safe.WEB_URL })

const unsafe = [
  ['什么都不给', {}],
  ['缺 MONGO_DB', { ...safe, MONGO_DB: undefined }],
  ['缺 WEB_URL', { ...safe, WEB_URL: undefined }],
  ['日常库端口', { ...safe, MONGO_URL: 'mongodb://127.0.0.1:27018' }],
  ['日常库名', { ...safe, MONGO_DB: 'shrio-import-20261014' }],
  ['日常前台', { ...safe, WEB_URL: 'http://127.0.0.1:2323' }],
  ['远程 Mongo', { ...safe, MONGO_URL: 'mongodb://38.95.74.213:27029' }],
  ['副本集多主机', { ...safe, MONGO_URL: 'mongodb://127.0.0.1:27029,10.0.0.2:27029' }],
  ['SRV 地址', { ...safe, MONGO_URL: 'mongodb+srv://127.0.0.1:27029' }],
  ['远程前台', { ...safe, WEB_URL: 'https://sin6626.me' }],
  ['不是地址', { ...safe, MONGO_URL: 'oops' }],
]
for (const [label, env] of unsafe) assert.throws(() => isolatedTarget(env), /缺少|拒绝|不是合法地址/, label)
assert.equal(isolatedTarget({ ...safe, MONGO_DB: 'other', E2E_ALLOW_NON_ISOLATED: '1' }).db, 'other', '显式开关才放行别的库')

const script = fileURLToPath(new URL('./e2e/plate-content.mjs', import.meta.url))
const trap = `data:text/javascript,${encodeURIComponent(`
import net from 'node:net'
const hit = (...args) => { process.stderr.write('NETWORK_CALL ' + JSON.stringify(args[0]) + '\\n'); process.exit(99) }
net.Socket.prototype.connect = hit
net.connect = hit
net.createConnection = hit
`)}`
for (const [label, env] of [unsafe[0], unsafe[3], unsafe[4], unsafe[5]]) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['MONGO_URL', 'MONGO_DB', 'WEB_URL', 'E2E_ALLOW_NON_ISOLATED', 'PLATE_E2E_KEEP'].includes(key)))
  const run = spawnSync(process.execPath, ['--import', trap, script], {
    env: { ...clean, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) },
    encoding: 'utf8',
    timeout: 60_000,
  })
  assert.notEqual(run.status, 99, `${label}：脚本在拒绝前发起了网络连接\n${run.stderr}`)
  assert.notEqual(run.status, 0, `${label}：脚本应当拒绝运行`)
  assert.match(run.stderr, /缺少|拒绝/, `${label}：要说明为什么拒绝\n${run.stderr}`)
}

console.log('PASS e2e guards: DB-writing browser tests refuse missing or non-isolated Mongo/DB/Web targets before any connection')
