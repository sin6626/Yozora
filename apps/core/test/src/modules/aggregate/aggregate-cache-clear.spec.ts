import { redisHelper } from 'test/helper/redis-mock.helper'
import { describe, expect, it } from 'vitest'

import { CacheKeys } from '~/constants/cache.constant'
import { AggregateService } from '~/modules/aggregate/aggregate.service'

// HTTP cache entries are stored as <key>@<generation>; clearing the aggregate cache must still find them.
describe('clearAggregateCache', async () => {
  const redis = await redisHelper
  const client = redis.CacheService.getClient()

  it('removes the generation-suffixed RSS, sitemap and aggregate entries and leaves the rest', async () => {
    const cleared = [`${CacheKeys.RSS}@3`, `${CacheKeys.RSSXml}@3`, `${CacheKeys.SiteMap}@3`, `${CacheKeys.SiteMapXml}@3`, `${CacheKeys.Aggregate}?abc#en@3`, 'mx-api-cache:/aggregate/top@3']
    const kept = 'mx-api-cache:/posts?page=1@3'
    await Promise.all([...cleared, kept].map((key) => client.set(key, '{}')))

    const service = Object.assign(Object.create(AggregateService.prototype), { redisService: { getClient: () => client } })
    await service.clearAggregateCache()

    expect(await Promise.all(cleared.map((key) => client.exists(key)))).toEqual(cleared.map(() => 0))
    expect(await client.exists(kept)).toBe(1)
  })
})
