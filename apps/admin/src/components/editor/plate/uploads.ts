import type {
  SuzuriLivePhotoUploadHandler,
  SuzuriUploadHandler,
} from '@suzuri/editor/react'

import { isSafeLivePhotoUrl } from '@suzuri/editor/schema'
import { readonly, ref } from 'vue'

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

/**
 * Plate（Suzuri）编辑器的上传处理：图片、实况图封面传图床，短片传 Core 附件，正文里只存持久地址。
 * 写作页和译文编辑都要传给 PlateEditor：不传的话 Suzuri 默认把图片读成 data:、短片存成 blob:，关掉页面就没了。
 * pending 是还没传完的个数。
 */
export function usePlateUploads() {
  const pending = ref(0)
  const track = async <T>(job: Promise<T>) => {
    pending.value++
    try {
      return await job
    } finally {
      pending.value--
    }
  }

  const uploadImage: SuzuriUploadHandler = (file) =>
    track(
      (async () => {
        const [{ url }, size] = await Promise.all([
          filesApi.upload(file, 'image'),
          naturalSize(file),
        ])
        return { url: persistentUrl(url, 'image'), ...size }
      })(),
    )

  const uploadLivePhoto: SuzuriLivePhotoUploadHandler = ({
    file,
    kind,
    signal,
  }) =>
    track(
      (async () => {
        const abort = signal ?? new AbortController().signal
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
      })(),
    )

  return { pending: readonly(pending), uploadImage, uploadLivePhoto }
}
