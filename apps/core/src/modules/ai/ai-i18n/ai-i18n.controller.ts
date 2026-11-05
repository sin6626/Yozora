import { Body, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'

import { ApiController } from '~/common/decorators/api-controller.decorator'
import { Auth } from '~/common/decorators/auth.decorator'
import { HTTPDecorators } from '~/common/decorators/http.decorator'

import {
  GenerateI18nDto,
  I18nEntryKeyDto,
  QueryI18nEntriesDto,
  SaveI18nEntryDto,
  UploadI18nSourceDto,
} from './ai-i18n.schema'
import { AiI18nService } from './ai-i18n.service'

@ApiController('ai/i18n')
export class AiI18nController {
  constructor(private readonly service: AiI18nService) {}

  // The blog reads the two public endpoints with plain fetch: Bypass keeps them out of the snake_case
  // transform, which would rewrite the map keys (entry names, Chinese text, project ids), and the { data } wrap
  @Get('/')
  @HTTPDecorators.Bypass
  getConfig() {
    return this.service.getPublicConfig()
  }

  @Put('/source')
  @Auth()
  uploadSource(@Body() body: UploadI18nSourceDto) {
    return this.service.uploadSource(body.messages)
  }

  @Get('/status')
  @Auth()
  getStatus() {
    return this.service.getStatus()
  }

  @Post('/generate')
  @Auth()
  generate(@Body() body?: GenerateI18nDto) {
    return this.service.generateNow(body ?? {})
  }

  @Get('/groups')
  @Auth()
  getGroups() {
    return this.service.getGroups()
  }

  @Get('/entries')
  @Auth()
  getEntries(@Query() query: QueryI18nEntriesDto) {
    return this.service.getEntries(query.group, query.withStale === '1')
  }

  @Put('/entries')
  @Auth()
  saveEntry(@Body() body: SaveI18nEntryDto) {
    return this.service.saveEntry(body)
  }

  @Delete('/entries')
  @Auth()
  deleteEntry(@Body() body: I18nEntryKeyDto) {
    return this.service.deleteEntry(body)
  }

  @Get('/:lang')
  @HTTPDecorators.Bypass
  getTranslations(@Param('lang') lang: string) {
    return this.service.getPublicTranslations(lang)
  }
}
