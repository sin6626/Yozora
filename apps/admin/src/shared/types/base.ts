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

/**
 * 已发布的文章若是旧版 Lexical 富文本，只能按 Lexical 保存：改存成 Markdown 或 Plate 会丢内容（迁移由离线工具做）。
 * 返回要提示的错误文案；可以保存时返回 null。
 */
export function lexicalOverwriteError(
  publishedFormat: string | undefined,
  nextFormat: string | undefined,
): string | null {
  return publishedFormat === 'lexical' && nextFormat !== 'lexical'
    ? '这篇是旧版 Lexical 富文本，不能改存成其他格式，请先用迁移工具转换。'
    : null
}
