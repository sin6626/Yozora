import { Injectable } from '@nestjs/common'
import { isValidObjectId } from 'mongoose'

import { BusinessEvents } from '~/constants/business-event.constant'
import { CollectionRefTypes } from '~/constants/db.constant'
import { NoteModel } from '~/modules/note/note.model'
import { PageModel } from '~/modules/page/page.model'
import { PostModel, relatedPostsPopulate } from '~/modules/post/post.model'
import { InjectModel } from '~/transformers/model.transformer'

@Injectable()
export class EventPayloadEnricherService {
  constructor(
    @InjectModel(PostModel)
    private readonly postModel: MongooseModel<PostModel>,
    @InjectModel(NoteModel)
    private readonly noteModel: MongooseModel<NoteModel>,
    @InjectModel(PageModel)
    private readonly pageModel: MongooseModel<PageModel>,
  ) {}

  async enrichPayload(event: BusinessEvents, data: any): Promise<any> {
    if (!data?.id) return data

    switch (event) {
      case BusinessEvents.POST_CREATE: {
        return (
          (await this.postModel
            .findById(data.id)
            .populate('category')
            .lean({ getters: true })) ?? data
        )
      }
      case BusinessEvents.POST_UPDATE: {
        return (
          (await this.postModel
            .findById(data.id)
            .populate('category')
            .populate(relatedPostsPopulate())
            .lean({ getters: true })) ?? data
        )
      }
      case BusinessEvents.NOTE_CREATE:
      case BusinessEvents.NOTE_UPDATE: {
        return (
          (await this.noteModel.findById(data.id).lean({ getters: true })) ??
          data
        )
      }
      case BusinessEvents.PAGE_CREATE:
      case BusinessEvents.PAGE_UPDATE: {
        return (
          (await this.pageModel.findById(data.id).lean({ getters: true })) ??
          data
        )
      }
      default: {
        return data
      }
    }
  }

  // Whether a visitor may read this article right now. Asked of the database directly because the
  // note password is select:false and must never be loaded into a document that gets broadcast.
  async isVisibleToVisitors(refType: string, id: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false
    switch (refType) {
      case CollectionRefTypes.Post: {
        return !!(await this.postModel.exists({ _id: id, isPublished: { $ne: false } }))
      }
      case CollectionRefTypes.Note: {
        return !!(await this.noteModel.exists({
          _id: id,
          isPublished: { $ne: false },
          $and: [
            { $or: [{ password: null }, { password: '' }] },
            { $or: [{ publicAt: null }, { publicAt: { $lte: new Date() } }] },
          ],
        }))
      }
      case CollectionRefTypes.Page: {
        return !!(await this.pageModel.exists({ _id: id }))
      }
      default: {
        return false
      }
    }
  }
}
