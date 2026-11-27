import type { SuzuriEnvelope } from '@suzuri/editor/schema'

import { defineAsyncComponent, defineComponent, shallowRef } from 'vue'

import { ContentLayout } from '~/layouts/content'

// 阶段 0 试水：Suzuri 编辑器挂进后台（开发环境才加载，生产构建里这个分支被去掉）。
const Bridge = import.meta.env.DEV
  ? defineAsyncComponent(() =>
      import('~/components/editor/suzuri/SuzuriEditorBridge').then(
        (m) => m.SuzuriEditorBridge,
      ),
    )
  : null

export default defineComponent({
  setup() {
    const envelope = shallowRef<SuzuriEnvelope | null>(null)
    return () => (
      <ContentLayout>
        {Bridge ? (
          <div class="flex flex-col gap-4 p-4">
            <div class="min-h-[420px] rounded border border-neutral-200 dark:border-neutral-800">
              <Bridge
                placeholder="输入点什么…"
                onChange={(value: SuzuriEnvelope) => (envelope.value = value)}
              />
            </div>
            <pre
              data-testid="suzuri-envelope"
              class="max-h-80 overflow-auto rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-900"
            >
              {envelope.value ? JSON.stringify(envelope.value, null, 2) : '（还没有修改）'}
            </pre>
          </div>
        ) : (
          <p class="p-4">仅开发环境可用。</p>
        )}
      </ContentLayout>
    )
  },
})
