const formatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai" });

export function formatDate(value: string | Date) {
  return formatter.format(new Date(value));
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Shanghai" });

// 时:分（东八区），评论悬浮窗里每条消息旁边用
export function formatTime(value: string | Date) {
  return timeFormatter.format(new Date(value));
}

// 文章过期提示（照 Shiro 的 PostOutdate）：最后修改时间（没改过看发布时间）距 now 超过 60 天时返回整天数，否则 null
export function outdatedDays(modified: string | null | undefined, created: string, now: number) {
  const days = Math.floor((now - Date.parse(modified || created)) / 86_400_000);
  return days > 60 ? days : null;
}
