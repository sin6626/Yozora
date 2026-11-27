import { getModelForClass } from '@typegoose/typegoose'
import mongoose from 'mongoose'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { dbHelper } from '../../../helper/db-mock.helper'
import {
  FileReferenceModel,
  FileReferenceStatus,
  FileReferenceType,
} from '~/modules/file/file-reference.model'
import { FileReferenceService } from '~/modules/file/file-reference.service'
import { S3Uploader } from '~/utils/s3.util'

describe('FileReferenceService', () => {
  let service: FileReferenceService
  let ownsDatabase = false
  const model = getModelForClass(FileReferenceModel)
  const url = 'https://img.example/test.jpg'
  const doc = { text: `![image](${url})` }
  const { Post, Draft } = FileReferenceType

  beforeAll(async () => {
    if (!mongoose.connection.readyState) {
      await dbHelper.connect()
      ownsDatabase = true
    }
    service = new FileReferenceService(
      model as any,
      {
        get: async () => ({
          enable: true,
          endpoint: 'https://unused.example',
          bucket: 'test',
          secretKey: 'test',
          secretId: 'test',
        }),
      } as any,
    )
  })
  beforeEach(async () => {
    vi.spyOn(S3Uploader.prototype, 'deleteObject').mockResolvedValue(undefined)
    await model.deleteMany({})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  afterAll(async () => {
    if (ownsDatabase) await dbHelper.close()
  })

  it('creates a pending reference for a new file', async () => {
    const file = await service.createPendingReference(url, 'test.jpg')
    expect(file.fileUrl).toBe(url)
    expect(file.status).toBe(FileReferenceStatus.Pending)
  })

  it('returns the existing reference on repeat registration', async () => {
    const file = await service.createPendingReference(url, 'test.jpg')
    expect((await service.createPendingReference(url, 'test.jpg')).id).toBe(
      file.id,
    )
    expect(await model.countDocuments()).toBe(1)
  })

  it('activates references for images in Markdown', async () => {
    const file = await service.createPendingReference(url, 'test.jpg')
    await service.activateReferences(doc, 'post', Post)
    expect(
      (await service.getReferencesForDocument('post', Post)).map((f) => f.id),
    ).toEqual([file.id])
    expect((await model.findById(file.id))?.status).toBe(
      FileReferenceStatus.Active,
    )
  })

  it('only activates images with an upload record', async () => {
    const file = await service.createPendingReference(url, 'test.jpg')
    await service.activateReferences(
      { text: doc.text + ' ![](https://other.example/x)' },
      'post',
      Post,
    )
    expect(await model.countDocuments()).toBe(1)
    expect(
      (await service.getReferencesForDocument('post', Post)).map((f) => f.id),
    ).toEqual([file.id])
  })

  it('releases old references and activates new ones', async () => {
    const old = await service.createPendingReference(url, 'test.jpg')
    await service.activateReferences(doc, 'post', Post)
    const next = await service.createPendingReference(url + '2', 'next.jpg')
    await service.updateReferencesForDocument(
      { text: `![](${next.fileUrl})` },
      'post',
      Post,
    )
    expect((await model.findById(old.id))?.status).toBe(
      FileReferenceStatus.Pending,
    )
    expect(
      (await service.getReferencesForDocument('post', Post)).map((f) => f.id),
    ).toEqual([next.id])
  })

  it('marks a file pending when its last owner releases it', async () => {
    await service.createPendingReference(url, 'test.jpg')
    await service.activateReferences(doc, 'draft', Draft)
    await service.removeReferencesForDocument('draft', Draft)
    expect(await service.getOrphanFilesCount()).toBe(1)
    expect(await service.getReferencesForDocument('draft', Draft)).toHaveLength(
      0,
    )
  })

  it('allows a published post to acquire a file released by a draft', async () => {
    const file = await service.createPendingReference(url, 'test.jpg')
    await service.activateReferences(doc, 'draft', Draft)
    await service.removeReferencesForDocument('draft', Draft)
    expect((await model.findById(file.id))?.status).toBe(
      FileReferenceStatus.Pending,
    )
    await service.activateReferences(doc, 'post', Post)
    expect(
      (await service.getReferencesForDocument('post', Post)).map((f) => f.id),
    ).toEqual([file.id])
  })

  it('recovers a missing owner from a saved translation and a restorable history entry', async () => {
    const file = await service.createPendingReference(url, 'test.jpg', 'test')
    const db = mongoose.connection
    const draft = await db.collection('drafts').insertOne({
      text: 'current',
      history: [{ version: 1, isFullSnapshot: true, text: doc.text }],
    })
    const translation = await db.collection('ai_translations').insertOne(doc)
    expect(
      (await service.batchDeleteOrphans({ ids: [file.id] })).deletedCount,
    ).toBe(0)
    expect(
      await service.getReferencesForDocument(String(draft.insertedId), Draft),
    ).toHaveLength(1)
    expect(
      await service.getReferencesForDocument(
        String(translation.insertedId),
        FileReferenceType.Translation,
      ),
    ).toHaveLength(1)
    await db.collection('drafts').deleteOne({ _id: draft.insertedId })
    await db
      .collection('ai_translations')
      .deleteOne({ _id: translation.insertedId })
  })

  it('checks the current owner after the cleanup list was read', async () => {
    await service.createPendingReference(url, 'test.jpg', 'test')
    const deleteObject = vi.fn()
    const storage = vi
      .spyOn(service as any, 'buildS3Uploader')
      .mockImplementationOnce(async () => {
        await service.activateReferences(doc, 'late', Post)
        return { deleteObject }
      })
    try {
      expect((await service.cleanupOrphanFiles(-1)).deletedCount).toBe(0)
      expect(deleteObject).not.toHaveBeenCalled()
    } finally {
      storage.mockRestore()
    }
  })

  it('preserves an article image after deleting a draft that shares it', async () => {
    // The article was registered by an older server, before per-owner tracking.
    await model.create({
      fileUrl: url,
      fileName: 'test.jpg',
      s3ObjectKey: 'test',
      status: FileReferenceStatus.Active,
      refId: 'post',
      refType: Post,
    })
    await service.updateReferencesForDocument(doc, 'draft', Draft)
    await service.removeReferencesForDocument('draft', Draft)
    expect((await service.cleanupOrphanFiles(-1)).deletedCount).toBe(0)
    expect(S3Uploader.prototype.deleteObject).not.toHaveBeenCalled()
    expect(await service.getReferencesForDocument('post', Post)).toHaveLength(1)
    await service.removeReferencesForDocument('post', Post)
    expect((await service.cleanupOrphanFiles(-1)).deletedCount).toBe(1)
    expect(S3Uploader.prototype.deleteObject).toHaveBeenCalledOnce()
  })
})
