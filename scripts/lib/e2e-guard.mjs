// 直接写库的浏览器测试只许连隔离验证环境（node scripts/dev.mjs --test）：Mongo 127.0.0.1:27029 的 sinpersonalspace-verify、前台 127.0.0.1:2523。
// 三个地址都要显式给出；连别的库或端口必须再设 E2E_ALLOW_NON_ISOLATED=1。校验在连接数据库之前完成。
export const ISOLATED = { mongoPort: '27029', db: 'sinpersonalspace-verify', webPort: '2523' }
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function isolatedTarget(env = process.env) {
  const { MONGO_URL: mongoUrl, MONGO_DB: db, WEB_URL: webUrl } = env
  const missing = ['MONGO_URL', 'MONGO_DB', 'WEB_URL'].filter((key) => !env[key])
  if (missing.length) throw new Error(`缺少 ${missing.join('、')}：直接写库的测试不设默认库，先用 node scripts/dev.mjs --test 起隔离环境`)
  if (env.E2E_ALLOW_NON_ISOLATED === '1') return { mongoUrl, db, webUrl }
  let mongo, web
  try {
    mongo = new URL(mongoUrl)
    web = new URL(webUrl)
  } catch {
    throw new Error('MONGO_URL 或 WEB_URL 不是合法地址')
  }
  const problems = []
  if (mongo.protocol !== 'mongodb:' || !localHosts.has(mongo.hostname) || mongo.port !== ISOLATED.mongoPort || mongo.host.includes(',')) problems.push(`Mongo 必须是本机 ${ISOLATED.mongoPort} 端口（现在 ${mongo.host}）`)
  if (db !== ISOLATED.db) problems.push(`数据库必须是 ${ISOLATED.db}（现在 ${db}）`)
  if (!localHosts.has(web.hostname) || web.port !== ISOLATED.webPort) problems.push(`前台必须是本机 ${ISOLATED.webPort} 端口（现在 ${web.host}）`)
  if (problems.length) throw new Error(`拒绝在非隔离环境运行：${problems.join('；')}。确实要连别处请设 E2E_ALLOW_NON_ISOLATED=1`)
  return { mongoUrl, db, webUrl }
}
