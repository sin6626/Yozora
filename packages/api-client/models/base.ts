export interface Count {
  read: number
  like: number
}

export interface Image {
  height: number
  width: number
  type: string
  accent?: string
  src: string
  blurHash?: string
}

export interface Pager {
  total: number
  size: number
  currentPage: number
  totalPage: number
  hasPrevPage: boolean
  hasNextPage: boolean
}

export interface PaginateResult<T> {
  data: T[]
  pagination: Pager
}

export interface BaseModel {
  created: string
  id: string
}

export interface BaseCommentIndexModel extends BaseModel {
  commentsIndex?: number

  allowComment: boolean
}
export interface TextBaseModelMarkdown extends BaseCommentIndexModel {
  title: string
  text: string
  contentFormat?: 'markdown'
  content?: undefined
  images?: Image[]
  modified: string | null
  meta?: Record<string, any> | null
}

export interface TextBaseModelLexical extends BaseCommentIndexModel {
  title: string
  text?: string
  contentFormat: 'lexical'
  content: string
  images?: Image[]
  modified: string | null
  meta?: Record<string, any> | null
}

/** `content` is a JSON-encoded @suzuri/editor envelope; `text` is its Markdown projection. */
export interface TextBaseModelPlate extends BaseCommentIndexModel {
  title: string
  text?: string
  contentFormat: 'plate'
  content: string
  images?: Image[]
  modified: string | null
  meta?: Record<string, any> | null
}

export type TextBaseModel =
  | TextBaseModelMarkdown
  | TextBaseModelLexical
  | TextBaseModelPlate

/** Rich format the client renders: the response then omits the Markdown `text` when the document uses it. */
export type ContentPreference = 'lexical' | 'plate'

export type ModelWithLiked<T> = T & {
  liked: boolean
}

export interface TranslationMeta {
  sourceLang: string
  targetLang: string
  translatedAt: string
}

export type ModelWithTranslation<T> = T & {
  isTranslated: boolean
  translationMeta?: TranslationMeta
  availableTranslations?: string[]
}
