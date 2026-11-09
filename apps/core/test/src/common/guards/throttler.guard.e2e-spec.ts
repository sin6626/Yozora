import { Get, Req } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { ThrottlerModule } from '@nestjs/throttler'
import { YOZORA_INTERNAL } from '~/app.config'
import { ApiController, apiRoutePrefix } from '~/common/decorators/api-controller.decorator'
import { ExtendThrottlerGuard } from '~/common/guards/throttler.guard'
import { RedisService } from '~/processors/redis/redis.service'
import { createE2EApp } from 'test/helper/create-e2e-app'
import { redisHelper } from 'test/helper/redis-mock.helper'

// Next's server rebuilds its caches with a burst of requests from one IP (89 in 5.6 s after one webhook),
// close to the per-IP limit. Requests carrying the shared internal key and no forwarded reader IP skip the
// throttle; anything forwarded for a reader is throttled as that reader. The key never makes a request "logged in".
let seenUser: unknown
@ApiController('ping')
class PingController {
  @Get('/')
  ping(@Req() req: any) {
    seenUser = req.user ?? req.raw?.user
    return { ok: 1 }
  }
}

describe('ExtendThrottlerGuard internal key', async () => {
  let app: NestFastifyApplication
  const proxy = createE2EApp({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
    controllers: [PingController],
    providers: [
      { provide: RedisService, useValue: (await redisHelper).RedisService },
      { provide: APP_GUARD, useClass: ExtendThrottlerGuard },
    ],
  })
  beforeEach(() => {
    app = proxy.app
    YOZORA_INTERNAL.key = 'internal-secret'
  })
  afterAll(() => {
    YOZORA_INTERNAL.key = ''
  })

  // Each case uses its own socket address so throttle counters don't leak between cases
  const twice = async (remoteAddress: string, headers: Record<string, string>) => {
    const codes: number[] = []
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: 'GET', url: `${apiRoutePrefix}/ping`, headers, remoteAddress })
      codes.push(res.statusCode)
    }
    return codes
  }

  it('lets the internal key through when no reader IP is forwarded, without logging in', async () => {
    expect(await twice('10.0.0.1', { 'x-yozora-internal-key': 'internal-secret' })).toEqual([200, 200])
    expect(seenUser).toBeUndefined()
  })

  it.each(['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'cf-connecting-ipv6'])(
    'throttles as the reader when %s is forwarded',
    async (header) => {
      const reader = header === 'cf-connecting-ipv6' ? '2001:db8::7' : `203.0.113.${header.length}`
      expect(await twice('10.0.0.2', { 'x-yozora-internal-key': 'internal-secret', [header]: reader })).toEqual([200, 429])
    },
  )

  it('throttles a wrong key', async () => {
    expect(await twice('10.0.0.3', { 'x-yozora-internal-key': 'internal-secreT' })).toEqual([200, 429])
    expect(await twice('10.0.0.4', { 'x-yozora-internal-key': 'short' })).toEqual([200, 429])
  })

  it('throttles everyone when no key is configured', async () => {
    YOZORA_INTERNAL.key = ''
    expect(await twice('10.0.0.5', { 'x-yozora-internal-key': '' })).toEqual([200, 429])
  })
})
