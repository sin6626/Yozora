import { execFile, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { connect, createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { loadEnvFile } from 'node:process'
import { createDevLifecycle } from './dev-lifecycle.mjs'
import { getResourceViolation, sampleResourceUsage, validateResourceBudget } from './resource-budget.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
if (existsSync(join(root, '.env.local'))) loadEnvFile(join(root, '.env.local'))
const testing = process.argv.includes('--test')
const coreNoWatch = testing && process.env.SIN_CORE_NO_WATCH === '1'
const coreOnly = process.argv.includes('--core-only')
const webOnly = process.argv.includes('--web-only')
const adminOnly = process.argv.includes('--admin-only')
const withAdmin = process.argv.includes('--with-admin')
if ([coreOnly, webOnly, adminOnly].filter(Boolean).length > 1 || (withAdmin && (coreOnly || webOnly || adminOnly))) {
  throw new Error('--core-only、--web-only、--admin-only、--with-admin 不能同时使用。')
}
const agentVerification = testing && process.env.SIN_VERIFY === '1'
const dataRoot = testing
  ? join(root, '.local/verification')
  : resolve(process.env.MIX_SPACE_DATA_ROOT || join(root, '../ShrioRenovation/.local'))
const mediaRoot = testing
  ? join(dataRoot, 'core')
  // 上传文件（头像、普通文件、图标）的持久目录。图片按 Core 设计只走对象存储图床，不在本地存放。
  : resolve(process.env.MIX_SPACE_MEDIA_ROOT || join(root, '.local/media'))
const logs = join(root, testing ? '.local/verification/logs' : '.local/logs')
const ports = testing
  ? { mongo: 27029, redis: 6391, core: 2533, web: 2523, admin: 9529 }
  : { mongo: 27018, redis: 6380, core: 2333, web: 2323, admin: 9528 }
const host = '127.0.0.1'
const api = `http://${host}:${ports.core}`
const web = `http://${host}:${ports.web}`
const admin = `http://${host}:${ports.admin}`
const databaseFile = join(dataRoot, 'database')
const database = webOnly || adminOnly ? null : testing ? 'sinpersonalspace-verify'
  : readFileSync(databaseFile, 'utf8').trim()
if (database && !testing && !/^shrio-(?:local|import-\d{8}(?:-[a-z0-9]+)?)$/.test(database)) throw new Error('共享 database 文件中的数据库名称无效。')
const redisDir = database ? join(dataRoot, 'redis', database) : null
const resourceBudget = agentVerification ? validateResourceBudget({
  rootPid: Number(process.env.SIN_RESOURCE_ROOT_PID || process.pid),
  maxRssMiB: Number(process.env.SIN_MAX_RSS_MIB || 2560),
  minFreePercent: Number(process.env.SIN_MIN_FREE_PERCENT || 20),
}) : null
if (resourceBudget && (resourceBudget.maxRssMiB > 2560 || resourceBudget.minFreePercent < 20)) throw new Error('Agent 验证预算只能收紧。')
// 让 Core 的 fetch 走本机代理：Node 默认不读代理设置，直连 GitHub 取读者资料常断开（fetch failed），读者登录失败。
// 终端里有 HTTPS_PROXY 等变量就用它；没有时读 macOS 系统代理（Clash 等通常只开“系统代理”）；都没有就直连。
// NO_PROXY 保证本地地址（Webhook 发给 127.0.0.1:2323、Mongo、Redis 等）仍直连。SIN_SYSTEM_PROXY 供测试替代 scutil 的结果。
function systemProxy() {
  if ('SIN_SYSTEM_PROXY' in process.env) return process.env.SIN_SYSTEM_PROXY || null
  if (process.platform !== 'darwin') return null
  try {
    const out = execFileSync('scutil', ['--proxy'], { encoding: 'utf8' })
    const host = out.match(/HTTPSProxy : (\S+)/)?.[1]
    const port = out.match(/HTTPSPort : (\d+)/)?.[1]
    return /HTTPSEnable : 1/.test(out) && host && port ? `http://${host}:${port}` : null
  } catch {
    return null
  }
}
function coreProxy() {
  const fromEnv = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].map((key) => process.env[key]).find(Boolean)
  if (fromEnv) return { NODE_USE_ENV_PROXY: '1' }
  const proxy = systemProxy()
  if (!proxy) return {}
  return { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: proxy, HTTP_PROXY: proxy, NO_PROXY: process.env.NO_PROXY || 'localhost,127.0.0.1,::1' }
}
const coreEnv = {
  NODE_ENV: 'development',
  DB_HOST: host, DB_PORT: String(ports.mongo), REDIS_HOST: host, REDIS_PORT: String(ports.redis),
  MONGO_CONNECTION: '', DB_CONNECTION_STRING: '', REDIS_CONNECTION_STRING: '', DB_USER: '', DB_PASSWORD: '', REDIS_PASSWORD: '', DB_OPTIONS: '',
  COLLECTION_NAME: database, PORT: String(ports.core), HOST: host,
  MX_DISABLE_TELEMETRY: 'true', DISABLE_TELEMETRY: 'true', BETTER_AUTH_URL: api,
  MX_DEV_API_URL: api, MX_DEV_WEB_URL: web, MX_DEV_ADMIN_URL: admin,
  ALLOWED_ORIGINS: `${host}:${ports.web},localhost:${ports.web},${host}:${ports.admin}`,
  MX_DATA_DIR: mediaRoot, DOTENV_CONFIG_PATH: '/dev/null', DOTENV_CONFIG_OVERRIDE: 'false',
  ...coreProxy(),
}
if (process.argv.includes('--print-config')) {
  console.log(JSON.stringify({ root, dataRoot, mediaRoot, logs, ports, database, redisDir, coreEnv, coreOnly, webOnly, adminOnly, withAdmin, resourceBudget }))
  process.exit(0)
}
let lifecycle
let mongo
let mongoStart

function fail(error) {
  if (lifecycle) {
    if (!lifecycle.stopping) lifecycle.fail(error)
  } else {
    console.error(error.message)
    process.exitCode = 1
  }
}

function cliPath(directory, packageName, binName) {
  const packageFile = createRequire(join(root, directory, 'package.json')).resolve(`${packageName}/package.json`)
  const { bin } = JSON.parse(readFileSync(packageFile, 'utf8'))
  return resolve(dirname(packageFile), typeof bin === 'string' ? bin : bin[binName])
}

function start(name, command, args, directory, env = {}) {
  return lifecycle.start(command, args, {
    name, cwd: join(root, directory), env: { ...process.env, ...env },
    logFile: join(logs, `${name}.log`),
  })
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const finish = (ready) => { socket.destroy(); resolve(ready) }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(500, () => finish(false))
  })
}

async function waitForPort(port) {
  const deadline = Date.now() + 120000
  while (!lifecycle.stopping && Date.now() < deadline) {
    if (await isPortOpen(port)) return
    await delay(250)
  }
  throw new Error(`等待端口 ${port} 就绪超时或启动已取消，请查看 ${logs}。`)
}

try {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major !== 24 || minor < 21) throw new Error('需要 Node.js 24.21.0 或更高的 Node.js 24 LTS。')
  if (resourceBudget) {
    const usage = await sampleResourceUsage(resourceBudget.rootPid)
    if (!usage.pids.includes(process.pid)) throw new Error('资源监控根必须是当前启动器或其批次祖先进程。')
    const violation = getResourceViolation(usage, resourceBudget)
    if (violation) throw new Error(violation)
    resourceBudget.rootStartedAt = usage.rootStartedAt
  }
  const requiredPorts = adminOnly ? [ports.admin] : webOnly ? [ports.web]
    : [ports.mongo, ports.redis, ports.core, ...(coreOnly ? [] : [ports.web]), ...(withAdmin ? [ports.admin] : [])]
  for (const port of requiredPorts) {
    await new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', () => reject(new Error(`端口 ${port} 已被占用，未启动任何服务。请先停止原项目服务。`)))
      server.listen(port, host, () => server.close(resolve))
    })
  }
  if (!coreOnly && !adminOnly) cliPath('apps/web', 'next', 'next')
  if (adminOnly || withAdmin) cliPath('apps/admin', 'vite', 'vite')
  if (adminOnly && !(await isPortOpen(ports.core))) {
    throw new Error(`Core ${api} 尚未运行，请先启动 pnpm dev 或 pnpm dev:core。`)
  }
  let MongoMemoryServer
  let secret
  if (!webOnly && !adminOnly) {
    cliPath('apps/core', '@nestjs/cli', 'nest')
    const redisVersion = execFileSync('redis-server', ['--version'], { encoding: 'utf8' }).match(/\bv=([\d.]+)/)?.[1]
    if (redisVersion !== '8.10.2') throw new Error(`需要 Redis 8.10.2，当前为 ${redisVersion || '未知版本'}。`)
    ;({ MongoMemoryServer } = createRequire(join(root, 'package.json'))('mongodb-memory-server'))
    const secretFile = join(dataRoot, 'jwt-secret')
    if (testing) {
      for (const directory of [join(dataRoot, 'mongo'), redisDir, mediaRoot]) mkdirSync(directory, { recursive: true, mode: 0o700 })
      try { writeFileSync(secretFile, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
    } else {
      for (const directory of [join(dataRoot, 'mongo'), redisDir, mediaRoot]) {
        if (!existsSync(directory)) throw new Error(`共享数据目录不存在：${directory}，未自动创建或复制数据库。`)
      }
    }
    secret = readFileSync(secretFile, 'utf8').trim()
    if (secret.length < 32) throw new Error('共享 jwt-secret 文件无效。')
  }
  if (process.argv.includes('--check')) {
    console.log('依赖、端口和共享数据路径检查通过；未启动服务。')
    process.exit(0)
  }
  mkdirSync(logs, { recursive: true, mode: 0o700 })
  lifecycle = createDevLifecycle(async () => {
    await mongoStart?.catch(() => {})
    await mongo?.stop({ doCleanup: false })
  }, resourceBudget)
  if (!webOnly && !adminOnly) {
    mongo = new MongoMemoryServer({
      binary: { version: '7.0.45' },
      instance: { ip: host, port: ports.mongo, portGeneration: false, dbPath: join(dataRoot, 'mongo') },
    })
    mongoStart = mongo.start()
    await mongoStart
    const mongoLog = createWriteStream(join(logs, 'mongo.log'), { flags: 'a', mode: 0o600 })
    mongoLog.on('error', fail)
    mongoLog.write(`MongoDB 7.0.45 started on ${host}:${ports.mongo}\n`)
    mongo.instanceInfo.instance.mongodProcess.stdout.pipe(mongoLog, { end: false })
    mongo.instanceInfo.instance.mongodProcess.stderr.pipe(mongoLog, { end: false })
    mongo.instanceInfo.instance.once('instanceClosed', () => fail(new Error(`MongoDB 已退出，请查看 ${join(logs, 'mongo.log')}。`)))
    await start('redis', 'redis-server', ['--bind', host, '--port', String(ports.redis), '--dir', redisDir, '--appendonly', 'yes'], '.')
    await waitForPort(ports.redis)
    if (coreNoWatch && !existsSync(join(root, 'apps/core/dist/main.js'))) throw new Error('请先编译 Core，再运行无监听的隔离验证。')
    await start('core', process.execPath, coreNoWatch ? ['dist/main.js'] : [cliPath('apps/core', '@nestjs/cli', 'nest'), 'start', '-w', '--path', 'tsconfig.json', '--'], 'apps/core', { ...coreEnv, JWT_SECRET: secret })
    await waitForPort(ports.core)
    // 界面文字的中文原文推给 Core（后台开着 AI i18n 时据此翻译新增、改过的条目）；不等它，失败只提示
    if (!testing) execFile(process.execPath, [join(root, 'scripts/push-i18n-source.mjs')], (error, stdout, stderr) => {
      console.log(error ? `界面文字没推给 Core：${(stderr || error.message).trim()}` : stdout.trim().split('\n').at(-1))
    })
  }
  if (!coreOnly && !adminOnly) {
    await start('web', process.execPath, [cliPath('apps/web', 'next', 'next'), 'dev', '-H', host, '-p', String(ports.web)], 'apps/web', {
      MIX_SPACE_API_URL: webOnly ? (process.env.MIX_SPACE_API_URL || api) : api, NEXT_TELEMETRY_DISABLED: '1',
      ...(agentVerification ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=1792`.trim() } : {}),
    })
    await waitForPort(ports.web)
  }
  if (adminOnly || withAdmin) {
    await start('admin', process.execPath, [cliPath('apps/admin', 'vite', 'vite'), '--host', host, '--port', String(ports.admin), '--strictPort'], 'apps/admin', {
      VITE_APP_BASE_API: api, VITE_APP_GATEWAY: api, VITE_APP_WEB_URL: web,
    })
    await waitForPort(ports.admin)
  }
  if (!lifecycle.stopping) console.log(`${coreOnly || adminOnly ? '' : `博客 ${web}\n`}${adminOnly || withAdmin ? `后台 ${admin}\n` : ''}${webOnly || adminOnly ? '' : `接口 ${api}\n数据库 ${database}\n`}日志 ${logs}，按 Ctrl+C 停止本命令创建的服务。`)
} catch (error) {
  fail(error)
}
