import { Body, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'

import { ApiController } from '~/common/decorators/api-controller.decorator'
import { Auth } from '~/common/decorators/auth.decorator'
import { HTTPDecorators } from '~/common/decorators/http.decorator'
import { IsAuthenticated } from '~/common/decorators/role.decorator'
import type { IpRecord } from '~/common/decorators/ip.decorator'
import { IpLocation } from '~/common/decorators/ip.decorator'
import { BizException } from '~/common/exceptions/biz.exception'
import { ErrorCodeEnum } from '~/constants/error-code.constant'
import { MongoIdDto } from '~/shared/dto/id.dto'
import { OffsetDto } from '~/shared/dto/pager.dto'

import { RecentlyModel } from './recently.model'
import { RecentlyAttitudeDto, RecentlyDto } from './recently.schema'
import { RecentlyService } from './recently.service'

@ApiController(['recently', 'shorthand'])
export class RecentlyController {
  constructor(private readonly recentlyService: RecentlyService) {}

  @Get('/latest')
  async getLatestOne() {
    return await this.recentlyService.getLatestOne()
  }

  // 登录的站长能看到引用了未公开内容的标题；访客只看到公开的引用
  @Get('/all')
  getAll(@IsAuthenticated() isAuthenticated: boolean) {
    return this.recentlyService.getAll(isAuthenticated)
  }

  @Get('/')
  async getList(
    @Query() query: OffsetDto,
    @IsAuthenticated() isAuthenticated: boolean,
  ) {
    const { before, after, size } = query

    if (before && after) {
      throw new BizException(
        ErrorCodeEnum.InvalidParameter,
        'you can only choose `before` or `after`',
      )
    }

    return await this.recentlyService.getOffset({
      before,
      after,
      size,
      includeHidden: isAuthenticated,
    })
  }

  @Get('/:id')
  async getOne(
    @Param() { id }: MongoIdDto,
    @IsAuthenticated() isAuthenticated: boolean,
  ) {
    return await this.recentlyService.getOne(id, isAuthenticated)
  }

  @Post('/')
  @HTTPDecorators.Idempotence()
  @Auth()
  async create(@Body() body: RecentlyDto) {
    return await this.recentlyService.create(body as unknown as RecentlyModel)
  }

  @Delete('/:id')
  @Auth()
  async del(@Param() { id }: MongoIdDto) {
    const res = await this.recentlyService.delete(id)
    if (!res) {
      throw new BizException(ErrorCodeEnum.EntryNotFound)
    }

    return
  }

  @Put('/:id')
  @Auth()
  async update(@Param() { id }: MongoIdDto, @Body() body: RecentlyDto) {
    const res = await this.recentlyService.update(id, body)
    if (!res) {
      throw new BizException(ErrorCodeEnum.EntryNotFound)
    }

    return res
  }

  /**
   * 表态：点赞，点踩
   */
  @Get('/attitude/:id')
  async attitude(
    @Param() { id }: MongoIdDto,
    @Query() { attitude }: RecentlyAttitudeDto,
    @IpLocation() { ip }: IpRecord,
  ) {
    const result = await this.recentlyService.updateAttitude({
      attitude,
      id,
      ip,
    })
    return {
      code: result,
    }
  }
}
