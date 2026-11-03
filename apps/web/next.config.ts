import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 部署用：next build 额外产出 .next/standalone（自带运行所需的 node_modules），服务器上直接 node server.js，见 docs/deploy-beta.md
  output: "standalone",
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // 开发期默认会把服务端函数的参数打到终端日志，加密手记的密码也会被打出来，关掉。
  logging: { serverFunctions: false },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
