import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { zCoerceBoolean } from '~/common/zod'
import { ArticleTypeEnum } from '~/constants/article.constant'
import {
  CONTENT_FORMATS,
  isRichContentFormat,
} from '~/shared/types/content-format.type'

/**
 * Meta schema
 */
export const MetaSchema = z.object({
  title: z.string(),
  date: z.preprocess(
    (val) => new Date(val as string | number | Date),
    z.date(),
  ),
  updated: z
    .preprocess((val) => new Date(val as string | number | Date), z.date())
    .optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  slug: z.string(),
})

export class MetaDto extends createZodDto(MetaSchema) {}

/**
 * Datatype schema
 */
export const DatatypeSchema = z.object({
  meta: MetaSchema.optional(),
  text: z.string(),
})

export class DatatypeDto extends createZodDto(DatatypeSchema) {}

/**
 * Data list schema
 */
export const DataListSchema = z.object({
  type: z.preprocess(
    (val) => (typeof val === 'string' ? val.toLowerCase() : val),
    z.enum(ArticleTypeEnum),
  ),
  data: z.array(DatatypeSchema),
})

export class DataListDto extends createZodDto(DataListSchema) {}

/**
 * Export markdown query schema
 */
export const ExportMarkdownQuerySchema = z.object({
  yaml: zCoerceBoolean.optional(),
  slug: zCoerceBoolean.optional(),
  show_title: zCoerceBoolean.optional(),
  with_meta_json: zCoerceBoolean.optional(),
})

export class ExportMarkdownQueryDto extends createZodDto(
  ExportMarkdownQuerySchema,
) {}

/**
 * Markdown preview schema
 */
export const MarkdownPreviewSchema = z.object({
  title: z.string(),
  md: z.string(),
})

export class MarkdownPreviewDto extends createZodDto(MarkdownPreviewSchema) {}

export const ContentPreviewSchema = z
  .object({
    contentFormat: z.enum(CONTENT_FORMATS),
    text: z.string().optional(),
    content: z.string().optional(),
  })
  .superRefine((data, context) => {
    const field = isRichContentFormat(data.contentFormat) ? 'content' : 'text'
    if (data[field] === undefined || (field === 'content' && !data.content)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is required`,
      })
    }
  })

export class ContentPreviewDto extends createZodDto(ContentPreviewSchema) {}

// Type exports
export type MetaInput = z.infer<typeof MetaSchema>
export type DatatypeInput = z.infer<typeof DatatypeSchema>
export type DataListInput = z.infer<typeof DataListSchema>
export type ExportMarkdownQueryInput = z.infer<typeof ExportMarkdownQuerySchema>
export type MarkdownPreviewInput = z.infer<typeof MarkdownPreviewSchema>
