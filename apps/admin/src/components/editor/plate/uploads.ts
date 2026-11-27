import type {
  SuzuriLivePhotoUploadHandler,
  SuzuriUploadHandler,
} from '@suzuri/editor/react'

import { isSafeLivePhotoUrl } from '@suzuri/editor/schema'
import { getCurrentInstance, onBeforeUnmount, readonly, ref } from 'vue'

import { filesApi } from '~/api/files'

import { prepareClip, prepareCover } from '../live-photo-media'

async function naturalSize(file: Blob) {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { naturalWidth: bitmap.width, naturalHeight: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return {}
  }
}

// 只把 Core 返回的持久地址写进正文；本地 blob:/data: 预览地址一律拒绝（关掉页面就失效）。
export function persistentUrl(url: string, kind: 'image' | 'video') {
  if (!/^https?:\/\//i.test(url) || !isSafeLivePhotoUrl(url, kind)) {
    throw new Error('上传返回的地址无效')
  }
  return url
}

// 全后台还没传完的个数，写作页发布前看它（上传完成前正文里还没有那张图，这时发布会丢图）。
// ponytail: 全局一个计数，同时开两个编辑器时互相挡发布；真要并排编辑再按编辑器分开。
const allPending = ref(0)

export function pendingUploadsError() {
  return allPending.value > 0
    ? `还有 ${allPending.value} 个图片或实况图在上传，传完再发布（现在发布会缺这些图）。`
    : null
}

/**
 * Plate（Suzuri）编辑器的上传处理：图片、实况图封面传图床，短片传 Core 附件，正文里只存持久地址。
 * 写作页和译文编辑都要传给 PlateEditor：不传的话 Suzuri 默认把图片读成 data:、短片存成 blob:，关掉页面就没了。
 * pending 是这个编辑器还没传完的个数；cancel() 取消进行中的上传（换文档时调用，组件卸载时自动调用），取消的不会插进正文。
 */
export function usePlateUploads() {
  const pending = ref(0)
  let controller = new AbortController()
  const track = async <T>(job: (signal: AbortSignal) => Promise<T>) => {
    const signal = controller.signal
    pending.value++
    allPending.value++
    try {
      const result = await job(signal)
      signal.throwIfAborted()
      return result
    } finally {
      pending.value--
      allPending.value--
    }
  }
  const cancel = () => {
    controller.abort()
    controller = new AbortController()
  }
  if (getCurrentInstance()) onBeforeUnmount(cancel)

  const uploadImage: SuzuriUploadHandler = (file) =>
    track(async (signal) => {
      const [{ url }, size] = await Promise.all([
        filesApi.upload(file, 'image', signal),
        naturalSize(file),
      ])
      return { url: persistentUrl(url, 'image'), ...size }
    })

  const uploadLivePhoto: SuzuriLivePhotoUploadHandler = ({
    file,
    kind,
    signal,
  }) =>
    track(async (own) => {
      // 编辑器自己的取消（关掉对话框、换了文件）和换文档/卸载都会停下转换与上传
      const abort = signal ? AbortSignal.any([signal, own]) : own
      if (kind === 'cover') {
        const cover = await prepareCover(file, abort)
        const { url } = await filesApi.upload(cover.file, 'image', abort)
        return {
          url: persistentUrl(url, 'image'),
          naturalWidth: cover.width,
          naturalHeight: cover.height,
        }
      }
      const clip = await prepareClip(file, abort)
      const { url } = await filesApi.upload(clip, 'file', abort)
      return { url: persistentUrl(url, 'video') }
    })

  return { pending: readonly(pending), uploadImage, uploadLivePhoto, cancel }
}
