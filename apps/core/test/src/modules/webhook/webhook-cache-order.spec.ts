import { describe, expect, it, vi } from 'vitest'

import { EventScope } from '~/constants/business-event.constant'
import { WebhookService } from '~/modules/webhook/webhook.service'

// The blog refetches from Core as soon as a webhook arrives. If Core's public HTTP cache
// (15 s by default, 10 min for /aggregate) still holds the old response, the blog re-caches stale data.
describe('WebhookService cache ordering', () => {
  it('clears the public HTTP cache before notifying subscribers', async () => {
    const order: string[] = []
    const hook = { id: 'h1', secret: 's', events: ['OPTION_UPDATE'], enabled: true, payloadUrl: 'http://blog.test/hook' }
    const service = new WebhookService(
      { find: () => ({ select: () => ({ lean: async () => [hook] }) }) } as any,
      { create: async () => ({ id: 'e1', updateOne: async () => {} }), updateOne: async () => {} } as any,
      { axiosRef: { post: vi.fn(async () => { order.push('notify'); return { status: 200, data: {}, headers: {} } }) } } as any,
      { registerHandler: () => () => {} } as any,
      { enrichPayload: async (_: unknown, data: unknown) => data } as any,
      { cleanCatch: vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); order.push('clear') }) } as any,
    )

    await service.sendWebhook('OPTION_UPDATE', { id: '000000000000000000000001', key: 'seo' }, EventScope.TO_SYSTEM)

    expect(order).toEqual(['clear', 'notify'])
  })
})
