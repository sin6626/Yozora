import { Reflector } from '@nestjs/core'
import { defer, lastValueFrom, of } from 'rxjs'
import { redisHelper } from 'test/helper/redis-mock.helper'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REDIS } from '~/app.config'
import { HttpCache } from '~/common/decorators/cache.decorator'
import { HttpCacheInterceptor } from '~/common/interceptors/cache.interceptor'
import { CacheKeys } from '~/constants/cache.constant'
import { EventScope } from '~/constants/business-event.constant'
import { WebhookService } from '~/modules/webhook/webhook.service'
import { RedisService } from '~/processors/redis/redis.service'

// Production keeps Core's HTTP cache on; dev and tests switch it off, so turn it back on here.
vi.mock('~/global/env.global', async (load) => ({ ...(await load<object>()), isTest: false }))

describe('webhook + production HTTP cache', async () => {
  const redis = await redisHelper
  const devSetting = REDIS.disableApiCache
  beforeAll(() => { REDIS.disableApiCache = false })
  afterAll(() => { REDIS.disableApiCache = devSetting })

  class AggregateLike {
    @HttpCache({ key: CacheKeys.Aggregate, ttl: 600, withQuery: true })
    aggregate() {}
  }
  const handler = AggregateLike.prototype.aggregate
  const redisService = Object.assign(Object.create(RedisService.prototype), { getClient: () => redis.CacheService.getClient() })
  const interceptor = new HttpCacheInterceptor(
    { get: (key: string) => redis.CacheService.get(key).then((v: string | null) => (v ? JSON.parse(v) : undefined)), set: (key: string, value: unknown) => redis.CacheService.set(key, JSON.stringify(value)) } as any,
    new Reflector(),
    { httpAdapter: { getRequestMethod: (req: any) => req.method } } as any,
    redisService,
  )
  let title = 'Old title'
  // Nest's handler is cold: the database read happens when the response is subscribed, so `defer` models it
  const read = async (theme = 'yozora', slow?: Promise<void>) => {
    const request = { method: 'GET', url: `/api/v2/aggregate?theme=${theme}`, query: { theme } }
    const response = { raw: { statusCode: 200 }, header() {}, getHeader() {} }
    const context = { getHandler: () => handler, switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as any
    const result$ = await interceptor.intercept(context, { handle: () => defer(async () => { const snapshot = title; await slow; return { seo: { title: snapshot } } }) })
    return (await lastValueFrom(result$)).seo.title
  }
  const webhook = (onNotify?: () => Promise<unknown>) => new WebhookService(
    { find: () => ({ select: () => ({ lean: async () => [{ id: 'h1', secret: 's', events: ['OPTION_UPDATE'], enabled: true, payloadUrl: 'http://blog.test/hook' }] }) }) } as any,
    { create: async () => ({ id: 'e1', updateOne: async () => {} }), updateOne: async () => {} } as any,
    { axiosRef: { post: async () => { await onNotify?.(); return { status: 200, data: {}, headers: {} } } } } as any,
    { registerHandler: () => () => {} } as any,
    { enrichPayload: async (_: unknown, data: unknown) => data } as any,
    redisService,
  )

  it('a read that started before the save cannot put the old value back after the webhook', async () => {
    title = 'Before save'
    let finishSlowRead!: () => void
    const slowRead = read('race', new Promise<void>((resolve) => { finishSlowRead = resolve }))
    await new Promise((resolve) => setTimeout(resolve, 20)) // the slow request has read the old snapshot

    title = 'After save'
    await webhook().sendWebhook('OPTION_UPDATE', { id: '000000000000000000000001', key: 'seo' }, EventScope.TO_SYSTEM)

    finishSlowRead()
    expect(await slowRead).toBe('Before save') // that visitor still gets what was true when they asked
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await read('race')).toBe('After save')
  })

  it('a read right after the webhook gets the new value', async () => {
    title = 'Old title'
    expect(await read()).toBe('Old title')
    await new Promise((resolve) => setTimeout(resolve, 50)) // the interceptor stores the response without awaiting
    title = 'New title'
    expect(await read()).toBe('Old title') // cached, as in production

    const hook = { id: 'h1', secret: 's', events: ['OPTION_UPDATE'], enabled: true, payloadUrl: 'http://blog.test/hook' }
    let afterNotify: string | undefined
    const service = new WebhookService(
      { find: () => ({ select: () => ({ lean: async () => [hook] }) }) } as any,
      { create: async () => ({ id: 'e1', updateOne: async () => {} }), updateOne: async () => {} } as any,
      { axiosRef: { post: async () => { afterNotify = await read(); return { status: 200, data: {}, headers: {} } } } } as any,
      { registerHandler: () => () => {} } as any,
      { enrichPayload: async (_: unknown, data: unknown) => data } as any,
      Object.assign(Object.create(RedisService.prototype), { getClient: () => redis.CacheService.getClient() }),
    )
    await service.sendWebhook('OPTION_UPDATE', { id: '000000000000000000000001', key: 'seo' }, EventScope.TO_SYSTEM)

    expect(afterNotify).toBe('New title')
  })
})
