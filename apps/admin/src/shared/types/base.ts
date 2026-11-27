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

/**
 * 更新已有内容前现读一次它在库里的格式再判断，不用页面里记下的格式：从草稿箱打开关联草稿（?draftId=）、
 * 恢复历史版本、别的标签页改过格式时，那份记录要么没读过、要么已经过期。读不到格式时不放行。
 * 新建（没有 refId）不用查。
 */
export async function publishFormatError(
  refId: string | undefined,
  nextFormat: string | undefined,
  readFormat: (id: string) => Promise<string | undefined>,
): Promise<string | null> {
  if (!refId) return null
  let published: string
  try {
    published = (await readFormat(refId)) || 'markdown'
  } catch {
    return '读不到已发布内容的格式，暂时不能发布，请稍后再试。'
  }
  return lexicalOverwriteError(published, nextFormat)
}
