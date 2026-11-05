// 检查脚本里替换 apps/web/lib/i18n/server（它依赖 Next 的 next/root-params，脚本里跑不了）：固定中文文案、地址不加前缀。
import { loadI18n } from './i18n-source.mjs'

export function i18nServer() {
  const { zh } = loadI18n()
  return { getT: async () => zh, getLocale: async () => 'zh', localize: async (href) => href }
}
