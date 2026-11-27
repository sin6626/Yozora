import { ObjectId, type Db } from 'mongodb'

export type Article = { refType: 'posts' | 'notes' | 'pages'; doc: Record<string, any> }

export async function findArticle(db: Db, id: string): Promise<Article> {
  for (const refType of ['posts', 'notes', 'pages'] as const) {
    const doc = await db.collection(refType).findOne({ _id: new ObjectId(id) })
    if (doc?.contentFormat === 'plate') {
      throw new Error('Manual translation does not support Plate sources. Use the Core translation editor.')
    }
    if (doc) return { refType, doc }
  }
  throw new Error(`找不到文章、手记或页面：${id}`)
}
