export const notificationSettings = { timeout: 5000, limit: 3, close: "关闭" };

// 修改notification 发送内容
export const notificationCopy = {
  POST_CREATE: { title: "有新文章了", description: "博客发布了新文章，可以前往文章列表看看。" },
  POST_UPDATE: { title: "文章有更新", description: "你正在阅读的文章已修改，稍后刷新可查看最新内容。" },
  POST_DELETE: { title: "这篇文章已移除", description: "当前文章已删除，可以返回文章列表继续阅读。" },
};
