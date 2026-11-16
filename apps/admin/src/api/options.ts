import type { FormDSL } from '~/components/config-form/types'

import { request } from '~/utils/request'

export interface SystemOptions {
  [key: string]: any
}

interface UrlOptions {
  webUrl: string
  adminUrl: string
  serverUrl: string
  wsUrl: string
}

export interface EmailTemplateResponse {
  template: string
  props: any
}

export const optionsApi = {
  // 获取所有配置
  getAll: () => request.get<SystemOptions>('/options'),

  // 获取指定配置（后端直接返回配置对象）
  get: <T = any>(key: string) => request.get<T>(`/options/${key}`),

  // 获取 URL 配置。Core 把这个对象包在 { data: … } 里，request 只解包数组，这里自己拆（检查 scripts/verify-admin-oauth-callback.mjs）
  getUrl: async () => {
    const res = await request.get<UrlOptions | { data: UrlOptions }>('/options/url')
    return 'data' in res ? res.data : res
  },

  // 更新指定配置
  patch: (key: string, data: any) =>
    request.patch<void>(`/options/${key}`, { data }),

  // 获取表单 DSL Schema
  getFormSchema: () => request.get<FormDSL>('/config/form-schema'),

  // 获取邮件模板
  getEmailTemplate: (params: { type: string }) =>
    request.get<EmailTemplateResponse>('/options/email/template', {
      params,
      bypassTransform: true,
    }),

  // 更新邮件模板
  updateEmailTemplate: (params: { type: string }, data: { source: string }) =>
    request.put<void>('/options/email/template', { params, data }),

  // 删除邮件模板
  deleteEmailTemplate: (params: { type: string }) =>
    request.delete<void>('/options/email/template', { params }),
}
