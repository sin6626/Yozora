import { URL } from 'node:url'
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common'
import { Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { ReturnModelType } from '@typegoose/typegoose'
import { RedisKeys } from '~/constants/cache.constant'
import * as SYSTEM from '~/constants/system.constant'
import { REFLECTOR } from '~/constants/system.constant'
import { AnalyzeModel } from '~/modules/analyze/analyze.model'
import { OptionModel } from '~/modules/configs/configs.model'
import { RedisService } from '~/processors/redis/redis.service'
import { getNestExecutionContextRequest } from '~/transformers/get-req.transformer'
import { InjectModel } from '~/transformers/model.transformer'
import { getIp } from '~/utils/ip.util'
import { getRedisKey } from '~/utils/redis.util'
import { scheduleManager } from '~/utils/schedule.util'
import { isbot } from 'isbot'
import { Observable } from 'rxjs'
import { UAParser } from 'ua-parser-js'

@Injectable()
export class AnalyzeInterceptor implements NestInterceptor {
  private readonly parser = new UAParser()
  private readonly queue: TaskQueuePool<any>

  constructor(
    @InjectModel(AnalyzeModel)
    private readonly model: ReturnModelType<typeof AnalyzeModel>,
    @InjectModel(OptionModel)
    private readonly options: ReturnModelType<typeof OptionModel>,
    private readonly redisService: RedisService,
    @Inject(REFLECTOR) private readonly reflector: Reflector,
  ) {
    this.queue = new TaskQueuePool(1000, this.model)
  }

  // Every non-skipped GET counts as an API call; batched so a burst of Next's server requests is one $inc
  private pendingCalls = 0
  private callTimer: ReturnType<typeof setTimeout> | null = null
  // A failed write puts its batch back so the next one carries it. ponytail: if Mongo applied the $inc but the
  // reply was lost, that batch is counted twice; acceptable for a display counter.
  private countApiCall(count = 1) {
    this.pendingCalls += count
    this.callTimer ??= setTimeout(() => {
      const batch = this.pendingCalls
      this.pendingCalls = 0
      this.callTimer = null
      this.options
        .updateOne({ name: 'apiCallTime' }, { $inc: { value: batch } }, { upsert: true })
        .catch((error) => {
          console.error(error)
          this.countApiCall(batch)
        })
    }, 1000)
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Promise<Observable<any>> {
    const call$ = next.handle()
    const request = getNestExecutionContextRequest(context)
    if (!request) {
      return call$
    }

    if (request.method.toUpperCase() !== 'GET') {
      return call$
    }

    const shouldSkipLogging = this.reflector.get(
      SYSTEM.SKIP_LOGGING_METADATA,
      context.getHandler(),
    )
    if (shouldSkipLogging) return call$

    const ip = getIp(request)

    if (['127.0.0.1', 'localhost', '::-1'].includes(ip)) {
      return call$
    }

    if (request.user) {
      return call$
    }

    if (isbot(request.headers['user-agent'])) {
      return call$
    }

    const url = request.url.replace(/^\/api(\/v\d)?/, '')

    if (url.startsWith('/proxy')) {
      return call$
    }

    this.countApiCall()

    // 访问记录只认前台浏览器报来的页面访问（pageview.controller.ts）：其他 GET 多半是 Next 服务端取数据，不是读者在看页面。
    // 路径换成读者看的页面，来源换成页面的 document.referrer；不像本站页面就不记
    const parsed = new URL(`http://a.com${url}`)
    if (parsed.pathname !== '/pageview') return call$
    const page = parsed.searchParams.get('path')
    if (!page || !/^\/(?!\/)/.test(page) || page.length > 300) return call$
    const ref = parsed.searchParams.get('ref')
    const path = page
    const referer = ref && /^https?:\/\//i.test(ref) && ref.length <= 500 ? ref : undefined

    scheduleManager.schedule(async () => {
      try {
        if (request.headers['user-agent']) {
          this.parser.setUA(request.headers['user-agent'])
        }

        const ua = this.parser.getResult()

        this.queue.push({
          ip,
          ua,
          path,
          country:
            request.headers['cf-ipcountry'] || request.headers['CF-IPCountry'],
          referer,
        })

        const client = this.redisService.getClient()
        const count = await client.sadd(getRedisKey(RedisKeys.AccessIp), ip)
        if (count) {
          await this.options.updateOne(
            { name: 'uv' },
            { $inc: { value: 1 } },
            { upsert: true },
          )
        }
      } catch (error) {
        console.error(error)
      }
    })

    return call$
  }
}

class TaskQueuePool<T> {
  private pool: T[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly interval: number = 1000,
    private readonly collection: any,
  ) {}

  push(model: T) {
    this.pool.push(model)

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.batchInsert()
        this.timer = null
      }, this.interval)
    }
  }

  private async batchInsert() {
    if (this.pool.length === 0) return

    await this.collection.insertMany(this.pool)
    this.pool = []
  }
}
