import type { IConfig } from './configs.interface'

function devUrl(name: string, fallback: string) {
  const value = process.env.NODE_ENV === 'development' && process.env[name]
  if (!value) return fallback
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error(`Invalid ${name}`)
  return url.origin
}

export const generateDefaultConfig: () => IConfig = () => ({
  seo: {
    title: '我的小世界呀',
    description: '哈喽~欢迎光临',
    keywords: [],
  },
  url: {
    wsUrl: devUrl('MX_DEV_API_URL', 'http://localhost:2333'),
    adminUrl: devUrl('MX_DEV_ADMIN_URL', 'http://localhost:2333/proxy/qaqdmin'),
    serverUrl: devUrl('MX_DEV_API_URL', 'http://localhost:2333'),
    webUrl: devUrl('MX_DEV_WEB_URL', 'http://localhost:2323'),
  },
  mailOptions: {
    enable: false,
    provider: 'smtp',
    from: '',
    smtp: {
      user: '',
      pass: '',
      options: {
        host: '',
        port: 465,
        secure: true,
      },
    },
    resend: {
      apiKey: '',
    },
  },
  commentOptions: {
    antiSpam: false,
    aiReview: false,
    aiReviewType: 'binary',
    aiReviewThreshold: 5,
    testAiReview: '__action__',
    disableComment: false,
    allowGuestComment: true,
    blockIps: [],
    disableNoChinese: false,
    recordIpLocation: true,
    spamKeywords: [],
    commentShouldAudit: false,
  },
  barkOptions: {
    enable: false,
    key: '',
    serverUrl: 'https://api.day.app',
    enableComment: true,
    enableThrottleGuard: false,
  },
  friendLinkOptions: {
    allowApply: true,
    allowSubPath: false,
    enableAvatarInternalization: true,
  },
  backupOptions: {
    enable: true,
    endpoint: null!,
    region: null!,
    bucket: null!,
    secretId: null!,
    secretKey: null!,
  },
  imageStorageOptions: {
    enable: false,
    endpoint: null!,
    secretId: null!,
    secretKey: null!,
    bucket: null!,
    region: 'auto',
    customDomain: '',
    prefix: '',
  },
  fileUploadOptions: {
    enableCustomNaming: false,
    filenameTemplate: '{Y}{m}{d}/{md5-16}{ext}',
    pathTemplate: '{type}',
  },
  baiduSearchOptions: { enable: false, token: null! },
  bingSearchOptions: { enable: false, token: null! },
  algoliaSearchOptions: {
    enable: false,
    apiKey: '',
    appId: '',
    indexName: '',
    maxTruncateSize: 10000,
  },
  adminExtra: {
    enableAdminProxy: true,

    background: '',
    gaodemapKey: null!,
  },
  featureList: {
    emailSubscribe: false,
  },
  thirdPartyServiceIntegration: {
    githubToken: '',
  },

  authSecurity: {
    disablePasswordLogin: false,
  },
  ai: {
    providers: [],
    summaryModel: undefined,
    writerModel: undefined,
    commentReviewModel: undefined,
    enableSummary: false,
    enableAutoGenerateSummary: false,
    summaryTargetLanguages: [],
    enableI18n: false,
    i18nLanguages: [],
  },
  oauth: {
    providers: [],
    secrets: {},
    public: {},
  },
})
