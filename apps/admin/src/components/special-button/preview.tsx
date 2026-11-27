import { debounce } from 'es-toolkit/compat'
import { Search as MagnifyingGlass } from 'lucide-vue-next'
import {
  defineComponent,
  onBeforeUnmount,
  onMounted,
  watch,
} from 'vue'
import { toast } from 'vue-sonner'
import type { PropType } from 'vue'

import { markdownApi, optionsApi } from '~/api'
import { WEB_URL } from '~/constants/env'
import { isRichFormat } from '~/shared/types/base'

import { HeaderActionButton } from '../button/header-action-button'
import { createPreviewRequest } from './preview-request'

export type PreviewButtonExposed = {
  getWindow: () => Window | null
}

export const HeaderPreviewButton = defineComponent({
  props: {
    data: {
      type: Object as PropType<any>,
      required: true,
    },
  },
  expose: ['getWindow'],
  setup(props, { expose }) {
    const PREVIEW_HASH = Math.random().toString(36).substring(2)

    let webUrl = ''

    let isInPreview = false
    let previewWindowOrigin = ''
    let previewWindow: Window | null = null
    let previewReady = false

    expose({
      getWindow: () => previewWindow,
    })

    const handlePreview = async () => {
      if (!import.meta.env.DEV && !webUrl) {
        const res = await optionsApi.getUrl()
        webUrl = res.webUrl
      }

      let url: URL
      if (import.meta.env.DEV) {
        url = new URL('/preview', WEB_URL)
      } else {
        url = new URL('/preview', webUrl)
      }

      url.searchParams.set('origin', location.origin)
      url.searchParams.set('key', PREVIEW_HASH)

      const finalUrl = url.toString()

      const forkWindow = window.open(finalUrl)
      if (!forkWindow) {
        toast.error('打开预览失败')
        return
      }

      previewRequest.invalidate()
      previewReady = false
      isInPreview = true
      previewWindowOrigin = url.origin
      previewWindow = forkWindow
    }

    const previewRequest = createPreviewRequest(
      async (serialized: string) => {
        const data: typeof props.data = JSON.parse(serialized)
        const { text } = await markdownApi.preview(
          isRichFormat(data.contentFormat)
            ? {
                contentFormat: data.contentFormat,
                content: data.content,
                text: data.text,
              }
            : { contentFormat: 'markdown', text: data.text ?? '' },
        )
        return JSON.stringify({
          type: 'preview',
          key: PREVIEW_HASH,
          data: { ...data, text, id: `preview-${data.id ?? 'new'}` },
        })
      },
      (message) => previewWindow?.postMessage(message, previewWindowOrigin),
      () => toast.error('预览转换失败，请修正内容后重试'),
    )

    const sendPreview = () => {
      if (!isInPreview || !previewReady || !previewWindow) return
      void previewRequest.run(JSON.stringify(props.data))
    }
    const updatePreview = debounce(sendPreview, 100)

    onMounted(() => {
      const handler = (event: MessageEvent<unknown>) => {
        if (!isInPreview || event.origin !== previewWindowOrigin) return
        if (event.source !== previewWindow || event.data !== 'ok') return
        if (previewReady) return
        previewReady = true
        sendPreview()
      }
      window.addEventListener('message', handler)
      onBeforeUnmount(() => window.removeEventListener('message', handler))
    })

    watch(
      () => props.data,
      () => {
        previewRequest.invalidate()
        updatePreview()
      },
      { deep: true, flush: 'sync' },
    )
    onBeforeUnmount(() => {
      previewRequest.invalidate()
      updatePreview.cancel()
    })

    return () => (
      <HeaderActionButton name="预览" icon={<MagnifyingGlass />} onClick={handlePreview} />
    )
  },
})
