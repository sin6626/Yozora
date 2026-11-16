// Core 发给 GitHub/Google 的回调地址按后台“网站设置”的 API 地址（serverUrl）拼（apps/core/src/modules/auth/auth.middleware.ts），
// 不是后台自己所在的域名；没读到网站设置时退回后台的 API 地址。检查 scripts/verify-admin-oauth-callback.mjs
export const oauthCallbackUrl = (serverUrl: string | undefined, fallback: string, type: string) =>
  `${(serverUrl || fallback).replace(/\/+$/, '')}/auth/callback/${type}`
