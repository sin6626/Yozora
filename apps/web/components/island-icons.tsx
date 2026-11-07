import type { IslandActivityIcon } from "../lib/island-store";
import IconifyIcon from "./iconify-icon";

// 夜航岛播报用的图标：mingcute 的实心图标（比 Lucide 线条图标在小方块里更饱满），在服务端渲染好，由根布局传给页头。
// 每种播报的颜色在 site-header.css 的 .island-activity[data-tone] 里，色值是 globals.css 的 --island-tone-*。
export const islandIcons: Record<IslandActivityIcon, React.ReactNode> = {
  post: <IconifyIcon icon="mingcute:file-new-fill" />,
  note: <IconifyIcon icon="mingcute:quill-pen-fill" />,
  thinking: <IconifyIcon icon="mingcute:bulb-fill" />,
  say: <IconifyIcon icon="mingcute:quote-left-fill" />,
  update: <IconifyIcon icon="mingcute:edit-2-fill" />,
  remove: <IconifyIcon icon="mingcute:delete-2-fill" />,
  link: <IconifyIcon icon="mingcute:link-2-fill" />,
  comment: <IconifyIcon icon="mingcute:chat-3-fill" />,
  info: <IconifyIcon icon="mingcute:information-fill" />,
};
