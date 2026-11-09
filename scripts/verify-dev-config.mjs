import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const launcher = fileURLToPath(new URL('./dev.mjs', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'sin-dev-config-'))
const databaseFile = join(directory, 'database')
writeFileSync(databaseFile, 'shrio-import-20261014')
const config = (args = [], env = {}) => JSON.parse(execFileSync(process.execPath, [launcher, '--print-config', ...args], {
  env: { ...process.env, MIX_SPACE_DATA_ROOT: directory, ...env }, encoding: 'utf8', stdio: 'pipe',
}))
try {
  const normal = config([], { SIN_VERIFY: '1', SIN_MAX_RSS_MIB: '1' })
  assert.equal(normal.dataRoot, directory)
  assert.equal(normal.database, 'shrio-import-20261014')
  assert.equal(normal.resourceBudget, null)
  // 媒体默认放在本仓库 .local/media，不再依赖旧项目开发目录 tmp（2026-10-24 曾被定时清理删空）。
  assert.equal(normal.coreEnv.MX_DATA_DIR, join(fileURLToPath(new URL('../', import.meta.url)), '.local/media'))
  assert.deepEqual(normal.ports, { mongo: 27018, redis: 6380, core: 2333, web: 2323, admin: 9528 })
  assert.equal('JWT_SECRET' in normal.coreEnv, false)
  // 2026-10-29：Node 的 fetch 默认不走 HTTPS_PROXY，Core 直连 GitHub 取读者资料时断开（fetch failed），登录失败。
  // 本机设了代理时让 Core 的 fetch 走代理（NO_PROXY 里的 127.0.0.1 等本地地址仍直连），没设时不加。
  // 终端里没有代理变量时读 macOS 系统代理（Clash 等只开“系统代理”），测试用 SIN_SYSTEM_PROXY 代替 scutil 的结果。
  const noEnvProxy = { HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '', NO_PROXY: '' }
  const viaEnv = config([], { ...noEnvProxy, HTTPS_PROXY: 'http://127.0.0.1:7897', SIN_SYSTEM_PROXY: '' }).coreEnv
  assert.equal(viaEnv.NODE_USE_ENV_PROXY, '1')
  const viaSystem = config([], { ...noEnvProxy, SIN_SYSTEM_PROXY: 'http://127.0.0.1:7897' }).coreEnv
  assert.deepEqual([viaSystem.NODE_USE_ENV_PROXY, viaSystem.HTTPS_PROXY, viaSystem.HTTP_PROXY], ['1', 'http://127.0.0.1:7897', 'http://127.0.0.1:7897'])
  assert.match(viaSystem.NO_PROXY, /127\.0\.0\.1/, '本地地址（Webhook 等）必须直连')
  assert.equal('NODE_USE_ENV_PROXY' in config([], { ...noEnvProxy, SIN_SYSTEM_PROXY: '' }).coreEnv, false)
  // 2026-11-09 内部密钥：同时启动 Core 和前台时随机生成、两边共用；终端设了就沿用；--web-only 没设就不带；不打印密钥本身
  assert.equal(config([], { YOZORA_INTERNAL_KEY: '' }).internalKeySource, 'random')
  const withKey = execFileSync(process.execPath, [launcher, '--print-config'], { env: { ...process.env, MIX_SPACE_DATA_ROOT: directory, YOZORA_INTERNAL_KEY: 'k'.repeat(64) }, encoding: 'utf8' })
  assert.equal(JSON.parse(withKey).internalKeySource, 'env')
  assert.equal(withKey.includes('k'.repeat(64)), false, '--print-config 不能打印密钥')
  assert.equal(config(['--web-only'], { YOZORA_INTERNAL_KEY: '' }).internalKeySource, null)
  assert.equal(config(['--web-only'], { YOZORA_INTERNAL_KEY: 'k'.repeat(64) }).internalKeySource, 'env')
  assert.equal('YOZORA_INTERNAL_KEY' in normal.coreEnv, false)
  const launcherSource = readFileSync(launcher, 'utf8')
  assert.match(launcherSource, /JWT_SECRET: secret, YOZORA_INTERNAL_KEY: internalKey/, 'Core 拿到同一份密钥')
  assert.match(launcherSource, /YOZORA_INTERNAL_KEY: internalKey, NEXT_TELEMETRY_DISABLED/, '前台拿到同一份密钥')
  const test = config(['--test'], { SIN_VERIFY: '1', SIN_MAX_RSS_MIB: '2560' })
  assert.equal(test.database, 'sinpersonalspace-verify')
  assert.notEqual(test.dataRoot, directory)
  assert.equal(test.resourceBudget.maxRssMiB, 2560)
  assert.equal(config(['--web-only'], { MIX_SPACE_DATA_ROOT: '/does-not-exist' }).database, null)
  assert.equal(config(['--admin-only'], { MIX_SPACE_DATA_ROOT: '/does-not-exist' }).database, null)
  assert.equal(config(['--with-admin']).withAdmin, true)
  assert.throws(() => config(['--core-only', '--web-only']), /不能同时/)
  assert.equal(readFileSync(databaseFile, 'utf8'), 'shrio-import-20261014')
  console.log('PASS shared paths, local ports, no secret output, isolated verification budget and web-only independence')
} finally {
  unlinkSync(databaseFile)
  rmdirSync(directory)
}
