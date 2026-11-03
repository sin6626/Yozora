// 本机脚本（写草稿、迁移碎碎念、装云函数）请求 Core 时拼地址。.local/publish.json 的 api 本地是 http://127.0.0.1:2333（开发模式没有前缀），
// 线上是 https://api.sin6626.me/api/v2。不能用 new URL("/posts", api)：开头的 / 会把 /api/v2 整个丢掉。
export const coreUrl = (api, path) => `${api.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
