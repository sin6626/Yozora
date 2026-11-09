import type { NormalizeMedia } from '@yozora/live-photo/browser'

import { $api, handleResponseError } from '~/utils/request'

// 204: already a compatible MP4; 200: a validated JPEG/MP4 replacement. Nothing is stored here.
export const normalizeLiveMedia: NormalizeMedia = async (
  file,
  kind,
  signal,
) => {
  const path = '/files/live-photo/normalize/' + kind
  const body = new FormData()
  body.append('file', file)
  const response = await $api.raw(path, {
    method: 'POST',
    body,
    signal,
    retry: 0,
    timeout: 125_000,
    responseType: 'blob',
    onResponse({ response, options }) {
      if (import.meta.env.DEV)
        console.debug('[live photo]', {
          method: 'POST',
          url: path,
          statusCode: response.status,
          headers: {
            'content-type':
              new Headers(options.headers).get('content-type') ??
              'multipart/form-data',
          },
          params: { kind, name: file.name, size: file.size, type: file.type },
          response: {
            type: response.headers.get('content-type'),
            bytes: response._data?.size,
          },
        })
    },
    async onResponseError({ response }) {
      if (response._data instanceof Blob) {
        try {
          response._data = JSON.parse(
            await response._data.slice(0, 4096).text(),
          )
        } catch {
          response._data = {}
        }
      }
      handleResponseError({ response })
    },
  })
  const type = kind === 'image' ? 'image/jpeg' : 'video/mp4',
    ext = kind === 'image' ? 'jpg' : 'mp4'
  if (response.status === 204 && kind === 'video')
    return { file, action: 'original' }
  const bytes = response._data
  if (
    response.status !== 200 ||
    !(bytes instanceof Blob) ||
    bytes.type.split(';')[0] !== type ||
    !bytes.size
  )
    throw Error('The converter did not return valid media.')
  return {
    file: new File([bytes], file.name.replace(/\.[^.]+$/, '') + '.' + ext, {
      type,
    }),
    action: 'converted',
  }
}
