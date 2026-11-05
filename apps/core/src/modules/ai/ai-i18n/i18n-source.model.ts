import { modelOptions, prop } from '@typegoose/typegoose'

import { I18N_SOURCE_COLLECTION_NAME } from '~/constants/db.constant'

/** One UI text entry in Chinese, as the blog last uploaded it (`locale.switched` → `已切换到{name}`). */
@modelOptions({
  options: { customName: I18N_SOURCE_COLLECTION_NAME },
  schemaOptions: { timestamps: false },
})
export class I18nSourceModel {
  @prop({ required: true, unique: true })
  key: string

  @prop({ required: true })
  text: string

  @prop({ required: true, type: Date })
  updated: Date
}
