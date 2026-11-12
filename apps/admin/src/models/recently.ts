export enum RecentlyRefTypes {
  Post = 'Post',
  Note = 'Note',
  Page = 'Page',
}

// Core 只给引用的标题和拼链接要用的字段（文章 slug、分类 id，手记 nid，页面 slug）
export interface RecentlyRefType {
  id: string
  title: string
  slug?: string
  nid?: number
  categoryId?: string
}

export interface RecentlyModel {
  id: string
  content: string
  type?:
    | 'text'
    | 'book'
    | 'media'
    | 'music'
    | 'github'
    | 'link'
    | 'academic'
    | 'code'
  metadata?: Record<string, any> | null
  created: string
  modified?: string

  ref?: RecentlyRefType | null
  refType?: RecentlyRefTypes | null

  up: number
  down: number

  allowComment: boolean
  commentsIndex?: number
}
