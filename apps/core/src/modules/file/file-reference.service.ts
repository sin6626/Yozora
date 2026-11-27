import { unlink } from 'node:fs/promises'
import path from 'node:path'

import { Injectable, Logger } from '@nestjs/common'

import {
  AI_TRANSLATION_COLLECTION_NAME,
  DRAFT_COLLECTION_NAME,
  MURMUR_COLLECTION_NAME,
  NOTE_COLLECTION_NAME,
  OWNER_PROFILE_COLLECTION_NAME,
  PAGE_COLLECTION_NAME,
  POST_COLLECTION_NAME,
  SNIPPET_COLLECTION_NAME,
} from '~/constants/db.constant'
import {
  DraftHistoryService,
  UnrestorableDraftVersion,
} from '~/modules/draft/draft-history.service'
import type { DraftHistoryModel } from '~/modules/draft/draft.model'
import { socialImageUrls } from '~/modules/owner/owner-images.util'
import { snippetImageUrls } from '~/modules/snippet/snippet-images.util'
import { STATIC_FILE_DIR } from '~/constants/path.constant'
import { ConfigsService } from '~/modules/configs/configs.service'
import type { ContentFormat } from '~/shared/types/content-format.type'
import { InjectModel } from '~/transformers/model.transformer'
import { extractImagesFromContent } from '~/utils/content.util'
import { S3Uploader } from '~/utils/s3.util'

import {
  FileReferenceModel,
  FileReferenceStatus,
  FileReferenceType,
} from './file-reference.model'

interface ContentLike {
  text: string
  contentFormat?: ContentFormat | string
  content?: string
  history?: DraftHistoryModel[]
}

const orphanFilter = {
  status: FileReferenceStatus.Pending,
  'owners.0': { $exists: false },
  refId: null,
}

// Convert the pre-owner-set record in the same atomic write that changes ownership.
const storedOwners = {
  $ifNull: [
    '$owners',
    {
      $cond: [
        {
          $and: [
            { $eq: ['$status', FileReferenceStatus.Active] },
            { $ne: ['$refId', null] },
          ],
        },
        [{ $concat: ['$refType', ':', '$refId'] }],
        [],
      ],
    },
  ],
}

function ownerFilter(refId: string, refType: FileReferenceType) {
  return { $or: [{ owners: `${refType}:${refId}` }, { refId, refType }] }
}

function documentMedia(doc: ContentLike): string[] {
  const urls = new Set(extractImagesFromContent(doc))
  if (doc.history?.length) {
    const historyService = new DraftHistoryService()
    for (const entry of doc.history) {
      try {
        const resolved = historyService.resolveHistoryEntry(entry, doc.history)
        for (const url of extractImagesFromContent({
          contentFormat: entry.contentFormat,
          text: resolved.text ?? '',
          content: resolved.content,
        }))
          urls.add(url)
      } catch (error) {
        // Pre-existing broken references cannot be restored. All recoverable versions still count.
        if (!(error instanceof UnrestorableDraftVersion)) throw error
      }
    }
  }
  return [...urls]
}

@Injectable()
export class FileReferenceService {
  private readonly logger = new Logger(FileReferenceService.name)

  constructor(
    @InjectModel(FileReferenceModel)
    private readonly fileReferenceModel: MongooseModel<FileReferenceModel>,
    private readonly configsService: ConfigsService,
  ) {}

  get model() {
    return this.fileReferenceModel
  }

  async createPendingReference(
    fileUrl: string,
    fileName: string,
    s3ObjectKey?: string,
  ) {
    const existing = await this.fileReferenceModel.findOne({ fileUrl })
    if (existing) {
      return existing
    }

    return this.fileReferenceModel.create({
      fileUrl,
      fileName,
      status: FileReferenceStatus.Pending,
      ...(s3ObjectKey && { s3ObjectKey }),
    })
  }

  async activateReferences(
    doc: ContentLike,
    refId: string,
    refType: FileReferenceType,
  ) {
    await this.addOwner(documentMedia(doc), refId, refType)
  }

  private async addOwner(
    urls: string[],
    refId: string,
    refType: FileReferenceType,
  ) {
    if (!urls.length) return
    await this.fileReferenceModel.updateMany(
      { fileUrl: { $in: urls } },
      [
        {
          $set: {
            owners: { $setUnion: [storedOwners, [`${refType}:${refId}`]] },
            status: FileReferenceStatus.Active,
          },
        },
        { $unset: ['refId', 'refType'] },
      ],
      { updatePipeline: true },
    )
  }

  async updateReferencesForDocument(
    doc: ContentLike,
    refId: string,
    refType: FileReferenceType,
  ) {
    const urls = documentMedia(doc)
    await this.addOwner(urls, refId, refType)
    await this.releaseOwner(refId, refType, urls)
  }

  async removeReferencesForDocument(refId: string, refType: FileReferenceType) {
    await this.releaseOwner(refId, refType, [])
  }

  private async releaseOwner(
    refId: string,
    refType: FileReferenceType,
    keep: string[],
  ) {
    await this.fileReferenceModel.updateMany(
      {
        ...ownerFilter(refId, refType),
        fileUrl: { $nin: keep },
      },
      [
        {
          $set: {
            owners: { $setDifference: [storedOwners, [`${refType}:${refId}`]] },
          },
        },
        {
          $set: {
            status: {
              $cond: [
                { $size: '$owners' },
                FileReferenceStatus.Active,
                FileReferenceStatus.Pending,
              ],
            },
          },
        },
        { $unset: ['refId', 'refType'] },
      ],
      { updatePipeline: true },
    )
  }

  async cleanupOrphanFiles(maxAgeMinutes = 60) {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
    const files = await this.fileReferenceModel.find({
      ...orphanFilter,
      created: { $lt: cutoffTime },
    })
    return {
      deletedCount: await this.deleteOrphans(files),
      totalOrphan: files.length,
    }
  }

  async getFileReferences(fileUrl: string) {
    return this.fileReferenceModel.find({ fileUrl })
  }

  async getReferencesForDocument(refId: string, refType: FileReferenceType) {
    return this.fileReferenceModel.find({
      ...ownerFilter(refId, refType),
      status: FileReferenceStatus.Active,
    })
  }

  async getOrphanFilesCount() {
    return this.fileReferenceModel.countDocuments(orphanFilter)
  }

  async batchDeleteOrphans(options: { ids?: string[]; all?: boolean }) {
    if (!options.all && !options.ids?.length) return { deletedCount: 0 }
    const files = await this.fileReferenceModel.find({
      ...orphanFilter,
      ...(!options.all && { _id: { $in: options.ids } }),
    })
    return { deletedCount: await this.deleteOrphans(files) }
  }

  // Older servers could overwrite an owner, and offline imports bypass reference writes.
  // Scan stored bodies once per candidate batch, including recoverable draft versions.
  private async recoverLiveOwners(candidates: Set<string>) {
    const db = this.fileReferenceModel.db
    const sources = [
      [POST_COLLECTION_NAME, FileReferenceType.Post],
      [NOTE_COLLECTION_NAME, FileReferenceType.Note],
      [PAGE_COLLECTION_NAME, FileReferenceType.Page],
      [DRAFT_COLLECTION_NAME, FileReferenceType.Draft],
      [AI_TRANSLATION_COLLECTION_NAME, FileReferenceType.Translation],
      [MURMUR_COLLECTION_NAME, FileReferenceType.Murmur],
      [OWNER_PROFILE_COLLECTION_NAME, FileReferenceType.Owner],
      [SNIPPET_COLLECTION_NAME, FileReferenceType.Snippet],
    ] as const
    for (const [collection, type] of sources) {
      const projection = {
        text: 1,
        content: 1,
        contentFormat: 1,
        history: 1,
        socialIds: 1,
        readerId: 1,
        raw: 1,
      }
      for await (const doc of db
        .collection(collection)
        .find({}, { projection })) {
        let urls: string[]
        if (type === FileReferenceType.Owner)
          urls = socialImageUrls(doc.socialIds)
        else if (type === FileReferenceType.Snippet)
          urls = snippetImageUrls(doc.raw)
        else
          urls = documentMedia({
            ...doc,
            text:
              (type === FileReferenceType.Murmur ? doc.content : doc.text) ??
              '',
          })
        const id = String(
          type === FileReferenceType.Owner ? doc.readerId : doc._id,
        )
        await this.addOwner(
          urls.filter((url) => candidates.has(url)),
          id,
          type,
        )
      }
    }
  }

  private async deleteOrphans(files: FileReferenceModel[]) {
    const candidates = files.filter(
      (file) => file.s3ObjectKey || file.fileUrl.includes('/objects/image/'),
    )
    if (!candidates.length) return 0
    await this.recoverLiveOwners(
      new Set(candidates.map((file) => file.fileUrl)),
    )
    const s3Uploader = await this.buildS3Uploader()
    let deletedCount = 0
    for (const file of candidates) {
      try {
        if (
          !(await this.fileReferenceModel.exists({
            _id: file.id,
            ...orphanFilter,
          }))
        )
          continue
        if (
          await this.fileReferenceModel.exists({
            fileUrl: file.fileUrl,
            $or: [
              { status: FileReferenceStatus.Active },
              { 'owners.0': { $exists: true } },
            ],
          })
        )
          continue
        if (file.s3ObjectKey) {
          if (!s3Uploader) continue
          await s3Uploader.deleteObject(file.s3ObjectKey)
        } else {
          await unlink(path.join(STATIC_FILE_DIR, 'image', file.fileName))
        }
        await this.fileReferenceModel.deleteMany({
          fileUrl: file.fileUrl,
          ...orphanFilter,
        })
        deletedCount++
      } catch {
        this.logger.warn(`Failed to delete orphan file: ${file.fileName}`)
      }
    }
    return deletedCount
  }

  private async buildS3Uploader(): Promise<S3Uploader | null> {
    const config = await this.configsService.get('imageStorageOptions')
    if (
      !config.enable ||
      !config.endpoint ||
      !config.secretId ||
      !config.secretKey ||
      !config.bucket
    ) {
      return null
    }
    const uploader = new S3Uploader({
      endpoint: config.endpoint,
      accessKey: config.secretId,
      secretKey: config.secretKey,
      bucket: config.bucket,
      region: config.region || 'auto',
    })
    if (config.customDomain) {
      uploader.setCustomDomain(config.customDomain)
    }
    return uploader
  }
}
