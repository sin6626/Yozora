// 实况图封面与短片的准备（与编辑器框架无关）：封面转成 JPEG（HEIC 经 Core 转换），短片转成兼容的 MP4 并限制大小。
// Haklex 写作页（rich/live-photo.ts）和 Plate 写作页（plate/PlateEditor.tsx）共用。
import { readImage, readVideo } from '@yozora/live-photo/browser'

import { normalizeLiveMedia } from '~/api/live-photo-media'

export async function prepareCover(file: File, signal?: AbortSignal) {
  const image = await readImage(file, signal, normalizeLiveMedia)
  if (image.blob.size > 20 * 1024 * 1024)
    throw Error('The prepared cover exceeds 20 MB.')
  const jpeg = new File(
    [image.blob],
    file.name.replace(/\.[^.]+$/, '') + '.jpg',
    { type: 'image/jpeg' },
  )
  return { file: jpeg, width: image.width, height: image.height }
}

export const clipLimit = 6 * 1024 * 1024
export async function prepareClip(file: File, signal: AbortSignal) {
  const clip = await readVideo(file, signal, normalizeLiveMedia)
  if (clip.blob.size > clipLimit)
    throw Error('The prepared MP4 exceeds 6 MB. Try a shorter clip.')
  return new File([clip.blob], file.name.replace(/\.[^.]+$/, '') + '.mp4', {
    type: 'video/mp4',
  })
}
