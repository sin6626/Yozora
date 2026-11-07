import { Module } from '@nestjs/common'
import { AnalyzeController } from './analyze.controller'
import { AnalyzeService } from './analyze.service'
import { PageviewController } from './pageview.controller'

@Module({
  controllers: [AnalyzeController, PageviewController],
  exports: [AnalyzeService],
  providers: [AnalyzeService],
})
export class AnalyzeModule {}
