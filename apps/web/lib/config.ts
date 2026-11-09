import "server-only";

function readUrl(name: string, value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} 必须是无凭据、查询参数和片段的 HTTP(S) 地址。`);
  }
  return url.href.replace(/\/$/, "");
}

// Core 的公网地址：交给浏览器（评论表单、Socket、页面统计等），也是服务端连不上内网时的兜底
export function getApiUrl() {
  const value = process.env.MIX_SPACE_API_URL;
  if (!value) throw new Error("请配置 MIX_SPACE_API_URL，或使用根目录 pnpm dev 启动。");
  return readUrl("MIX_SPACE_API_URL", value);
}

// 只给服务端用：同一台机器上 Core 的 Docker 内网地址（线上 http://mx-server:2333/api/v2），没配时为 null。
// 不要交给浏览器；服务端请求怎么在内网和公网之间切换见 lib/api.ts
export function getInternalApiUrl() {
  const value = process.env.MIX_SPACE_INTERNAL_API_URL;
  return value ? readUrl("MIX_SPACE_INTERNAL_API_URL", value) : null;
}
