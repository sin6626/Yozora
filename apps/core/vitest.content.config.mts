import { resolve } from 'node:path'

import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'test/editor/content-contract.spec.ts',
      'test/editor/live-photo.spec.ts',
      'test/editor/live-photo-formats.spec.ts',
      'test/editor/lexical-projection.spec.ts',
      'test/editor/legacy-quote.spec.ts',
      'test/src/processors/helper/helper.lexical.service.spec.ts',
      'test/src/modules/draft/draft.service.spec.ts',
      'test/src/modules/ai/translation-consistency.service.spec.ts',
      'test/src/modules/ai/ai-translation.service.spec.ts',
      'test/src/processors/helper/helper.translation.service.spec.ts',
    ],
    globals: true,
    environment: 'node',
    env: { NODE_ENV: 'development', TEST: '1' },
    setupFiles: ['./test/setup-global.ts'],
  },
  resolve: { alias: { '~': resolve(import.meta.dirname, 'src') } },
  esbuild: false,
  plugins: [swc.vite()],
})
