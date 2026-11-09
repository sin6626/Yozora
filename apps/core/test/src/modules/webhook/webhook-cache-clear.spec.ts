import { describe, expect, it, vi } from 'vitest'

import { BusinessEvents, EventScope } from '~/constants/business-event.constant'
import { WebhookService } from '~/modules/webhook/webhook.service'

// Next fetches from Core whether or not a webhook is subscribed, so a content change must clear
// Core's public HTTP cache even with no webhook configured. Chatty events that change no content must not.
describe('WebhookService clears the HTTP cache on content events', () => {
  const service = (hooks: unknown[] = []) => {
    const cleanCatch = vi.fn(async () => {})
    const svc = new WebhookService(
      { find: () => ({ select: () => ({ lean: async () => hooks }) }) } as any,
      { create: async () => ({ id: 'e1', updateOne: async () => {} }), updateOne: async () => {} } as any,
      { axiosRef: { post: async () => ({ status: 200, data: {}, headers: {} }) } } as any,
      { registerHandler: () => () => {} } as any,
      { enrichPayload: async (_: unknown, data: unknown) => data } as any,
      { cleanCatch } as any,
    )
    return { svc, cleanCatch }
  }

  it('clears on a post update with no webhook configured', async () => {
    const { svc, cleanCatch } = service()
    await svc.sendWebhook(BusinessEvents.POST_UPDATE, { id: '000000000000000000000001' }, EventScope.TO_SYSTEM_VISITOR)
    expect(cleanCatch).toHaveBeenCalledTimes(1)
  })

  it.each([
    BusinessEvents.VISITOR_ONLINE,
    BusinessEvents.VISITOR_OFFLINE,
    BusinessEvents.ARTICLE_READ_COUNT_UPDATE,
    BusinessEvents.ACTIVITY_UPDATE_PRESENCE,
    BusinessEvents.GATEWAY_CONNECT,
  ])('does not clear on %s', async (event) => {
    const { svc, cleanCatch } = service([{ id: 'h1', secret: 's', events: ['all'], enabled: true, payloadUrl: 'http://blog.test/hook' }])
    await svc.sendWebhook(event, {}, EventScope.ALL)
    expect(cleanCatch).not.toHaveBeenCalled()
  })
})
