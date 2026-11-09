import { timingSafeEqual } from 'node:crypto'
import type { ExecutionContext } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { YOZORA_INTERNAL } from '~/app.config'
import type { FastifyBizRequest } from '~/transformers/get-req.transformer'
import { getNestExecutionContextRequest } from '~/transformers/get-req.transformer'
import { getIp } from '~/utils/ip.util'

// Headers getIp() reads a client IP from; a request carrying any of them is made on behalf of a reader
const FORWARDED_IP_HEADERS = [
  'true-client-ip',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'x-forwarded-for',
  'x-real-ip',
]

// The Yozora frontend's own server (cache rebuilds) sends the shared key and no reader IP.
// Only skips the throttle: it does not set req.user, so no drafts and the HTTP cache still applies.
const isInternalRequest = (headers: Record<string, unknown>) => {
  const expected = YOZORA_INTERNAL.key
  const given = headers['x-yozora-internal-key']
  if (!expected || typeof given !== 'string') return false
  if (FORWARDED_IP_HEADERS.some((name) => headers[name] !== undefined)) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

@Injectable()
export class ExtendThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = getNestExecutionContextRequest(context)

    if (req.user || isInternalRequest(req.headers)) {
      return true
    }
    return super.shouldSkip(context)
  }

  protected async getTracker(req: FastifyBizRequest) {
    // The Fastify request (not req.raw) so a request without forwarded headers falls back to its socket address
    return getIp(req)
  }
}
