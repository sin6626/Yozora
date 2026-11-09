import { redisHelper } from '@/helper/redis-mock.helper'
import { Get } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { ReturnModelType } from '@typegoose/typegoose'
import { ApiController, apiRoutePrefix } from '~/common/decorators/api-controller.decorator'
import { RedisKeys } from '~/constants/cache.constant'
import { AnalyzeInterceptor } from '~/common/interceptors/analyze.interceptor'
import { AnalyzeModel } from '~/modules/analyze/analyze.model'
import { PageviewController } from '~/modules/analyze/pageview.controller'
import { OptionModel } from '~/modules/configs/configs.model'
import { RedisService } from '~/processors/redis/redis.service'
import { getRedisKey } from '~/utils/redis.util'
import { scheduleManager } from '~/utils/schedule.util'
import { createE2EApp } from 'test/helper/create-e2e-app'
import { vi } from 'vitest'

// 服务端渲染的前台（Yozora）读者看页面时浏览器不直接请求 Core，访问记录就记不到。
// 前台每打开一页向 Core 报一次 GET /pageview?path=…&ref=…，Core 按原来的访问记录规则记一条：
// 路径是读者看的页面、来源是页面的 document.referrer，IP 和设备取浏览器自己的；爬虫、本机照旧不记，路径不像本站页面就不记。
@ApiController('ping')
class PingController {
  @Get('/')
  ping() {
    return { ok: 1 }
  }
}

describe('GET /pageview', async () => {
  let app: NestFastifyApplication
  let analyzes: ReturnModelType<typeof AnalyzeModel>
  let options: ReturnModelType<typeof OptionModel>
  const redis = (await redisHelper).RedisService
  const proxy = createE2EApp({
    controllers: [PageviewController, PingController],
    providers: [
      { provide: RedisService, useValue: (await redisHelper).RedisService },
      { provide: APP_INTERCEPTOR, useClass: AnalyzeInterceptor },
    ],
    models: [AnalyzeModel, OptionModel],
    async pourData(modelMap) {
      analyzes = modelMap.get(AnalyzeModel)!.model as ReturnModelType<typeof AnalyzeModel>
      options = modelMap.get(OptionModel)!.model as ReturnModelType<typeof OptionModel>
    },
  })
  beforeEach(() => {
    app = proxy.app
    // 测试全局把 scheduleManager 换成了空函数，这里让访问记录照常写进去
    vi.spyOn(scheduleManager, 'schedule').mockImplementation((callback: () => void) => { callback() })
  })

  const browser = (ip: string, ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36') => ({
    'x-forwarded-for': ip,
    'user-agent': ua,
    referer: 'https://beta.example.com/posts/tech/hello',
  })
  const visit = (query: string, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: `${apiRoutePrefix}/pageview?${query}`, headers })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 1300))

  it('records the page the reader opened, with the real referrer', async () => {
    const res = await visit(`path=${encodeURIComponent('/posts/tech/hello')}&ref=${encodeURIComponent('https://www.google.com/')}`, browser('203.0.113.7'))
    expect(res.statusCode).toBe(204)
    await settle()
    const row = await analyzes.findOne({ ip: '203.0.113.7' }).lean()
    expect(row).toMatchObject({ path: '/posts/tech/hello', referer: 'https://www.google.com/' })
    expect(row!.ua?.browser?.name).toBe('Chrome')
  })

  it('skips bots, local requests and paths that are not site pages', async () => {
    await visit('path=%2Fnotes%2F1', browser('203.0.113.8', 'Googlebot/2.1 (+http://www.google.com/bot.html)'))
    await visit('path=%2Fnotes%2F1', browser('127.0.0.1'))
    await visit(`path=${encodeURIComponent('https://evil.example.com/')}`, browser('203.0.113.9'))
    await visit(`path=${encodeURIComponent('//evil.example.com')}`, browser('203.0.113.9'))
    await visit(`path=${encodeURIComponent(`/${'a'.repeat(400)}`)}`, browser('203.0.113.9'))
    await visit('', browser('203.0.113.9'))
    await settle()
    expect(await analyzes.countDocuments({ ip: { $in: ['203.0.113.8', '127.0.0.1', '203.0.113.9'] } })).toBe(0)
  })

  // Next's server requests Core for every page it builds; those are not visits. Only /pageview (sent by the
  // reader's browser) is a visit, but every GET still counts toward the admin's "API calls" number.
  const apiCalls = async () => (await options.findOne({ name: 'apiCallTime' }).lean())?.value || 0
  const todayIps = () => redis.getClient().smembers(getRedisKey(RedisKeys.AccessIp))

  it('an ordinary GET is counted as an API call but is not a visit', async () => {
    const before = await apiCalls()
    const res = await app.inject({ method: 'GET', url: `${apiRoutePrefix}/ping`, headers: browser('203.0.113.20') })
    expect(res.statusCode).toBe(200)
    await settle()
    expect(await analyzes.countDocuments({ ip: '203.0.113.20' })).toBe(0)
    expect(await todayIps()).not.toContain('203.0.113.20')
    expect(await apiCalls()).toBe(before + 1)
  })

  it('a pageview is a visit and an API call', async () => {
    const before = await apiCalls()
    await visit('path=%2Fnotes%2F2', browser('203.0.113.21'))
    await settle()
    expect(await analyzes.countDocuments({ ip: '203.0.113.21', path: '/notes/2' })).toBe(1)
    expect(await todayIps()).toContain('203.0.113.21')
    expect(await apiCalls()).toBe(before + 1)
  })

  // Codex review: a failed $inc must not drop that batch; the next successful write carries it
  it('keeps API call counts when a batch write fails and adds them to the next one', async () => {
    const before = await apiCalls()
    const write = vi.spyOn(options, 'updateOne').mockRejectedValueOnce(new Error('mongo down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await app.inject({ method: 'GET', url: `${apiRoutePrefix}/ping`, headers: browser('203.0.113.30') })
    await app.inject({ method: 'GET', url: `${apiRoutePrefix}/ping`, headers: browser('203.0.113.31') })
    await settle()
    await app.inject({ method: 'GET', url: `${apiRoutePrefix}/ping`, headers: browser('203.0.113.32') })
    await settle()
    await settle()
    expect(write).toHaveBeenCalled()
    expect(await apiCalls()).toBe(before + 3)
  })
})
