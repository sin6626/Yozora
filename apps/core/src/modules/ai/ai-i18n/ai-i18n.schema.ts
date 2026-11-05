import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { I18N_KEY_PATHS } from '../ai-translation/translation-entry.model'

export const UploadI18nSourceSchema = z.object({
  messages: z.record(z.string().min(1), z.string()),
})
export class UploadI18nSourceDto extends createZodDto(UploadI18nSourceSchema) {}

export const GenerateI18nSchema = z
  .object({
    langs: z.array(z.string()).optional(),
    group: z.string().optional(),
    onlyMissing: z.boolean().optional(),
  })
  .default({})
export class GenerateI18nDto extends createZodDto(GenerateI18nSchema) {}

export const QueryI18nEntriesSchema = z.object({
  group: z.string().optional(),
  /** `1`: also return translations whose Chinese changed since (the migration script must not overwrite them) */
  withStale: z.literal('1').optional(),
})
export class QueryI18nEntriesDto extends createZodDto(QueryI18nEntriesSchema) {}

export const I18nEntryKeySchema = z.object({
  keyPath: z.enum(I18N_KEY_PATHS),
  lookupKey: z.string().min(1),
  lang: z.string().min(1),
})
export class I18nEntryKeyDto extends createZodDto(I18nEntryKeySchema) {}

export const SaveI18nEntrySchema = I18nEntryKeySchema.extend({
  text: z.string(),
  /** Only write while the entry has no hand-written translation, else 409 (the migration script) */
  keepManual: z.boolean().optional(),
})
export class SaveI18nEntryDto extends createZodDto(SaveI18nEntrySchema) {}
