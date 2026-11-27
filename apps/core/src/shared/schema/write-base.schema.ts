import { zCoerceDate, zNonEmptyString } from '~/common/zod'
import {
  CONTENT_FORMATS,
  ContentFormat,
  isRichContentFormat,
} from '~/shared/types/content-format.type'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { BaseCommentIndexSchema } from './base.schema'
import { ImageSchema } from './image.schema'

export const WriteBaseSchema = BaseCommentIndexSchema.extend({
  title: zNonEmptyString,
  text: z.string(),
  images: z.array(ImageSchema).optional(),
  created: zCoerceDate.optional(),
  meta: z.record(z.string(), z.any()).optional().nullable().default(null),
  contentFormat: z
    .enum(CONTENT_FORMATS)
    .default(ContentFormat.Markdown)
    .optional(),
  content: z.string().optional(),
})

export const WriteBaseSchemaWithRefine = WriteBaseSchema.superRefine(
  (data, context) => {
    if (
      isRichContentFormat(data.contentFormat) &&
      (data.content == null || data.content.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message: `content is required when contentFormat is ${data.contentFormat}`,
        path: ['content'],
      })
    }
  },
)

export class WriteBaseDto extends createZodDto(WriteBaseSchema) {}

export type WriteBaseInput = z.infer<typeof WriteBaseSchema>

export const PartialWriteBaseSchema = WriteBaseSchema.partial()

export class PartialWriteBaseDto extends createZodDto(PartialWriteBaseSchema) {}

export type PartialWriteBaseInput = z.infer<typeof PartialWriteBaseSchema>
