import type { Image } from '~/models/base'

export type ContentFormat = 'markdown' | 'lexical' | 'plate'

/** Lexical or Plate: the JSON `content` is the source of truth and `text` is its Markdown projection. */
export const isRichFormat = (format?: string): format is 'lexical' | 'plate' =>
  format === 'lexical' || format === 'plate'

export type WriteBaseType = {
  title: string
  text: string
  allowComment: boolean
  contentFormat?: ContentFormat
  content?: string

  id?: string
  images: Image[]
  created?: string
  modified?: string

  meta?: any
}
