import type { ContentFormat } from '~/shared/types/base'

import { useStorage } from '@vueuse/core'

const STORAGE_KEY = 'preferred-content-format'

export function usePreferredContentFormat() {
  const preferred = useStorage<ContentFormat>(STORAGE_KEY, 'markdown')
  // 新写的富文本一律用 Plate；以前选过 Lexical（Haklex）的偏好换成 Plate，旧文档仍按自己的格式打开
  if (preferred.value === 'lexical') preferred.value = 'plate'

  const setPreferred = (format: ContentFormat) => {
    preferred.value = format
  }

  return {
    preferredContentFormat: preferred,
    setPreferredContentFormat: setPreferred,
  }
}
