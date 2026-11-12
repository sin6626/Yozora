import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { mongo } from 'mongoose'

import { BizException } from '~/common/exceptions/biz.exception'
import { CannotFindException } from '~/common/exceptions/cant-find.exception'
import { BusinessEvents, EventScope } from '~/constants/business-event.constant'
import { RedisKeys } from '~/constants/cache.constant'
import { CollectionRefTypes } from '~/constants/db.constant'
import { ErrorCodeEnum } from '~/constants/error-code.constant'
import { DatabaseService } from '~/processors/database/database.service'
import { EventManagerService } from '~/processors/helper/helper.event.service'
import { RedisService } from '~/processors/redis/redis.service'
import { InjectModel } from '~/transformers/model.transformer'
import { getRedisKey } from '~/utils/redis.util'
import { scheduleManager } from '~/utils/schedule.util'

import { CommentState } from '../comment/comment.model'
import { CommentService } from '../comment/comment.service'
import { ConfigsService } from '../configs/configs.service'
import { isNoteVisibleToVisitors } from '../note/note-visibility.util'
import { RecentlyModel } from './recently.model'
import { RecentlyAttitudeEnum } from './recently.schema'

const { ObjectId } = mongo

// 库里存集合名（posts / notes / pages），返回给前台和后台的是 SDK 约定的 Post / Note / Page；两种写法读的时候都认
type RefKind = CollectionRefTypes.Post | CollectionRefTypes.Note | CollectionRefTypes.Page
const refKindOf = (value: unknown): RefKind | undefined =>
  (({ Post: CollectionRefTypes.Post, Note: CollectionRefTypes.Note, Page: CollectionRefTypes.Page }) as Record<string, RefKind>)[value as string] ??
  ([CollectionRefTypes.Post, CollectionRefTypes.Note, CollectionRefTypes.Page] as string[]).find((kind) => kind === value) as RefKind | undefined
const refTypeName: Record<RefKind, string> = {
  [CollectionRefTypes.Post]: 'Post',
  [CollectionRefTypes.Note]: 'Note',
  [CollectionRefTypes.Page]: 'Page',
}
const refIdOf = (ref: unknown) => {
  const id = (ref as { _id?: unknown } | null)?._id ?? ref
  return id ? String(id) : null
}

@Injectable()
export class RecentlyService {
  constructor(
    @InjectModel(RecentlyModel)
    private readonly recentlyModel: MongooseModel<RecentlyModel>,
    private readonly eventManager: EventManagerService,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => CommentService))
    private readonly commentService: CommentService,
    private readonly configsService: ConfigsService,
  ) {}

  public get model() {
    return this.recentlyModel
  }

  private get commentCountPipeline() {
    return [
      {
        $lookup: {
          from: 'comments',
          as: 'comment',
          foreignField: 'ref',
          localField: '_id',
        },
      },
      {
        $addFields: {
          comments: {
            $size: '$comment',
          },
        },
      },
      {
        $project: {
          comment: 0,
        },
      },
      {
        $sort: {
          created: -1,
        },
      },
    ] as const
  }

  async getAll(includeHidden = false) {
    const result = (await this.model.aggregate([
      ...this.commentCountPipeline,
    ])) as RecentlyModel[]

    return this.attachRefs(result, includeHidden)
  }

  async getOne(id: string, includeHidden = false) {
    const result = (await this.model.aggregate([
      ...this.commentCountPipeline,
      {
        $match: {
          _id: new ObjectId(id),
        },
      },
    ])) as RecentlyModel[]

    return (await this.attachRefs(result, includeHidden))[0] || null
  }
  // 思考引用的站内文章、手记、页面：只取标题和拼链接要用的字段，永远不带正文、摘要、密码、位置。
  // 访客只看得到公开的（文章已发布；手记已发布、没有密码、不是还没到时间的定时公开；页面都算），其余引用清空，
  // 连引用的类型也不留；站长（includeHidden）能看到未公开内容的标题，方便编辑。
  async attachRefs<T extends { ref?: unknown; refType?: unknown }>(docs: T[], includeHidden = false) {
    const wanted: Record<RefKind, Set<string>> = {
      [CollectionRefTypes.Post]: new Set(),
      [CollectionRefTypes.Note]: new Set(),
      [CollectionRefTypes.Page]: new Set(),
    }
    for (const doc of docs) {
      const id = refIdOf(doc.ref)
      const kind = refKindOf(doc.refType)
      if (id && kind) wanted[kind].add(id)
    }
    const now = new Date()
    const found = new Map<string, Record<string, unknown>>()
    const fields = {
      [CollectionRefTypes.Post]: 'title slug categoryId created isPublished',
      [CollectionRefTypes.Note]: 'title nid created isPublished publicAt +password',
      [CollectionRefTypes.Page]: 'title slug created',
    }
    await Promise.all(
      (Object.keys(wanted) as RefKind[]).map(async (kind) => {
        if (!wanted[kind].size) return
        const list = (await this.databaseService
          .getModelByRefType(kind)
          .find({ _id: { $in: [...wanted[kind]] } })
          .select(fields[kind])
          .lean()) as Record<string, any>[]
        for (const doc of list) {
          const visible =
            kind === CollectionRefTypes.Post
              ? doc.isPublished !== false
              : kind === CollectionRefTypes.Note
                ? isNoteVisibleToVisitors(doc, now)
                : true
          if (!visible && !includeHidden) continue
          found.set(`${kind}:${doc._id}`, {
            _id: doc._id,
            title: doc.title,
            ...(doc.slug ? { slug: doc.slug } : {}),
            ...(doc.nid ? { nid: doc.nid } : {}),
            ...(doc.categoryId ? { categoryId: doc.categoryId } : {}),
            created: doc.created,
          })
        }
      }),
    )
    for (const doc of docs) {
      if (!doc.refType && !doc.ref) continue
      const kind = refKindOf(doc.refType)
      const ref = kind && found.get(`${kind}:${refIdOf(doc.ref)}`)
      doc.ref = ref || null
      doc.refType = ref && kind ? refTypeName[kind] : null
    }
    return docs
  }

  // 后台填的引用 id：只认站内的文章、手记、页面
  private async resolveRef(input: { ref?: unknown; refId?: unknown }) {
    const id = refIdOf(input.ref ?? input.refId)
    if (!id) return null
    const exist = await this.databaseService.findGlobalById(id)
    const kind = refKindOf(exist?.type)
    if (!kind) {
      throw new BizException(ErrorCodeEnum.RefModelNotFound)
    }
    // 模型里 ref 的类型写的是填充后的样子，存的是 ObjectId
    return { ref: new ObjectId(id) as unknown as RecentlyModel['ref'], refType: kind }
  }

  // 推给访客的消息和返回给站长的结果用同一份文档，但引用按各自的规则填
  private async withRefs(id: unknown) {
    const doc = await this.model.findById(id).lean()
    if (!doc) return null
    const [forVisitors] = await this.attachRefs([{ ...doc }])
    const [forOwner] = await this.attachRefs([doc], true)
    return { forVisitors, forOwner }
  }

  async getOffset({
    before,
    size,
    after,
    includeHidden = false,
  }: {
    before?: string
    size?: number
    after?: string
    includeHidden?: boolean
  }) {
    size = size ?? 10

    const configs = await this.configsService.get('commentOptions')
    const { commentShouldAudit } = configs

    const result = await this.recentlyModel.aggregate([
      {
        $match: (() => {
          if (after) return { _id: { $gt: new ObjectId(after) } }
          if (before) return { _id: { $lt: new ObjectId(before) } }
          return {}
        })(),
      },

      {
        $lookup: {
          from: 'comments',
          as: 'comment',
          foreignField: 'ref',
          localField: '_id',
          pipeline: [
            {
              $match: commentShouldAudit
                ? {
                    state: CommentState.Read,
                  }
                : {
                    $or: [
                      {
                        state: CommentState.Read,
                      },
                      {
                        state: CommentState.Unread,
                      },
                    ],
                  },
            },
          ],
        },
      },

      {
        $addFields: {
          comments: {
            $size: '$comment',
          },
        },
      },
      {
        $project: {
          comment: 0,
        },
      },
      {
        $sort: {
          _id: -1,
        },
      },
      { $limit: size },
    ])
    return this.attachRefs(result, includeHidden)
  }
  async getLatestOne() {
    const latest = await this.model.findOne().sort({ created: -1 }).lean()

    if (!latest) {
      return null
    }

    const commentCount = await this.commentService.model.countDocuments({
      refType: CollectionRefTypes.Recently,
      ref: latest._id,
    })
    const [withRef] = await this.attachRefs([latest])

    return {
      ...withRef,
      comments: commentCount,
    }
  }

  async create(model: RecentlyModel) {
    const ref = await this.resolveRef(model as { ref?: unknown; refId?: unknown })

    const res = await this.model.create({
      content: model.content,
      type: (model as any).type,
      metadata: (model as any).metadata,
      ...(ref ?? {}),
    })

    const docs = await this.withRefs(res._id)
    scheduleManager.schedule(async () => {
      await this.eventManager.emit(BusinessEvents.RECENTLY_CREATE, docs?.forVisitors, {
        scope: EventScope.TO_SYSTEM_VISITOR,
      })
    })
    return docs?.forOwner
  }

  async delete(id: string) {
    const [{ deletedCount }] = await Promise.all([
      this.model.deleteOne({
        _id: id,
      }),
      // delete comment ref
      this.commentService.model.deleteMany({
        ref: id,
        refType: CollectionRefTypes.Recently,
      }),
    ])
    const isDeleted = deletedCount === 1
    scheduleManager.schedule(async () => {
      if (isDeleted) {
        await this.eventManager.emit(
          BusinessEvents.RECENTLY_DELETE,
          { id },
          {
            scope: EventScope.TO_SYSTEM_VISITOR,
          },
        )
      }
    })

    return isDeleted
  }

  // 后台编辑是整条替换：没带引用就清掉引用，换成纯文字就清掉卡片信息
  async update(id: string, model: Partial<RecentlyModel>) {
    const ref = await this.resolveRef(model as { ref?: unknown; refId?: unknown })
    const metadata = (model as any).metadata
    const res = await this.model.findByIdAndUpdate(
      id,
      {
        $set: {
          content: model.content,
          type: model.type,
          modified: new Date(),
          ...(metadata ? { metadata } : {}),
          ...(ref ?? {}),
        },
        $unset: {
          ...(metadata ? {} : { metadata: 1 }),
          ...(ref ? {} : { ref: 1, refType: 1 }),
        },
      },
      { new: true },
    )

    if (!res) {
      return null
    }

    const docs = await this.withRefs(res._id)
    scheduleManager.schedule(async () => {
      await this.eventManager.emit(BusinessEvents.RECENTLY_UPDATE, docs?.forVisitors, {
        scope: EventScope.TO_SYSTEM_VISITOR,
      })
    })

    return docs?.forOwner
  }

  // The blog reads the thinking list from Core on every request, so clear Core's HTTP cache before replying;
  // otherwise the page refresh right after a vote shows the counts cached before it
  async updateAttitude(input: {
    id: string
    attitude: RecentlyAttitudeEnum
    ip: string
  }) {
    const result = await this.saveAttitude(input)
    await this.redisService.cleanCatch()
    return result
  }

  private async saveAttitude({
    id,
    attitude,
    ip,
  }: {
    id: string
    attitude: RecentlyAttitudeEnum
    ip: string
  }) {
    if (!ip) {
      throw new BizException(ErrorCodeEnum.CannotGetIp)
    }
    const model = await this.model.findById(id)

    if (!model) {
      throw new CannotFindException()
    }

    const attitudePath = {
      [RecentlyAttitudeEnum.Up]: 'up',
      [RecentlyAttitudeEnum.Down]: 'down',
    }

    const redis = this.redisService.getClient()
    const key = `${id}:${ip}`
    const currentAttitude = await redis.hget(
      getRedisKey(RedisKeys.RecentlyAttitude),
      key,
    )

    if (currentAttitude) {
      const { attitude: prevAttitude } = JSON.parse(currentAttitude)
      // 之前是点了赞，现在还是点赞，取消之前的点赞
      if (prevAttitude === attitude) {
        model.$inc(attitudePath[prevAttitude], -1)
        await redis.hdel(getRedisKey(RedisKeys.RecentlyAttitude), key)
        // 之前点了赞，现在点了踩，取消之前的点赞，并且踩 +1
      } else {
        model.$inc(attitudePath[prevAttitude], -1)
        model.$inc(attitudePath[attitude], 1)
        await redis.hset(
          getRedisKey(RedisKeys.RecentlyAttitude),
          key,
          JSON.stringify({ attitude, date: new Date().toISOString() }),
        )
      }

      await model.save()

      return prevAttitude === attitude ? -1 : 1
    }

    model.$inc(attitudePath[attitude], 1)
    await redis.hset(
      getRedisKey(RedisKeys.RecentlyAttitude),
      key,
      JSON.stringify({ attitude, date: new Date().toISOString() }),
    )
    await model.save()
    return 1
  }
}
