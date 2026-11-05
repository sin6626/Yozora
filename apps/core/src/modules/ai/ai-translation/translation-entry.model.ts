import { index, modelOptions, prop } from '@typegoose/typegoose'

import { TRANSLATION_ENTRY_COLLECTION_NAME } from '~/constants/db.constant'
import { BaseModel } from '~/shared/model/base.model'

export type TranslationEntryKeyPath =
  | 'category.name'
  | 'topic.name'
  | 'topic.introduce'
  | 'note.mood'
  | 'note.weather'
  | I18nKeyPath

/** AI i18n entries: UI text by entry name, site text by source hash, projects by id. */
export const I18N_KEY_PATHS = [
  'ui.text',
  'site.text',
  'project.name',
  'project.description',
] as const
export type I18nKeyPath = (typeof I18N_KEY_PATHS)[number]

export type TranslationEntryKeyType = 'entity' | 'dict'

@modelOptions({
  options: {
    customName: TRANSLATION_ENTRY_COLLECTION_NAME,
  },
})
@index({ keyPath: 1, lang: 1, keyType: 1, lookupKey: 1 }, { unique: true })
@index({ keyPath: 1, lang: 1 })
@index({ lookupKey: 1 })
export class TranslationEntryModel extends BaseModel {
  @prop({ required: true })
  keyPath: TranslationEntryKeyPath

  @prop({ required: true })
  lang: string

  @prop({ required: true })
  keyType: TranslationEntryKeyType

  @prop({ required: true })
  lookupKey: string

  @prop({ required: true })
  sourceText: string

  @prop({ required: true })
  translatedText: string

  @prop({ type: Date })
  sourceUpdatedAt?: Date

  /** Written by the owner (or imported from hand-written translations); AI never retranslates it unless the source changes */
  @prop()
  manual?: boolean

  /** A manual translation the AI redid after its source changed, waiting for the owner to look at it */
  @prop()
  needsReview?: boolean
}
