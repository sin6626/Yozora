import { Get, HttpCode } from '@nestjs/common'
import { ApiController } from '~/common/decorators/api-controller.decorator'
import { HttpCache } from '~/common/decorators/cache.decorator'

// 服务端渲染的前台（Yozora）：读者看页面时浏览器不直接请求 Core，访问记录就记不到。
// 前台每打开一页向这里报一次 GET /pageview?path=<页面路径>&ref=<document.referrer>，
// 真正记录的是全局的 AnalyzeInterceptor（和其他 GET 同一套规则：爬虫、本机、已登录不记），它把路径换成读者看的页面。
@ApiController('pageview')
export class PageviewController {
  @Get('/')
  @HttpCode(204)
  @HttpCache.disable
  pageview() {}
}
