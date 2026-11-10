import "server-only";
import logos from "@iconify-json/logos/icons.json";
import mingcute from "@iconify-json/mingcute/icons.json";
import simpleIcons from "@iconify-json/simple-icons/icons.json";
import skillIcons from "@iconify-json/skill-icons/icons.json";
import { getIconData, iconToSVG } from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";

// Iconify 图标：在服务端从离线图标集里取出来渲染成 SVG，不在浏览器里联网拉取，也不把整套图标打进前端代码。
// 目前装了三套：simple-icons（单色品牌标志，如 GitHub、哔哩哔哩）、mingcute（Shiro 用的那套圆润线条图标）、
// skill-icons（带品牌色的技术栈方块图标，首页技术栈用）、logos（彩色品牌标志，登录用的 Google）。
// 通用图标仍然用 lucide-react；Lucide 没有的（品牌、需要更精致的）才用这里。
const sets: Record<string, IconifyJSON> = { logos, mingcute, "simple-icons": simpleIcons, "skill-icons": skillIcons };

type IconName = `${"logos" | "mingcute" | "simple-icons" | "skill-icons"}:${string}`;

// 后台配置里手写的图标名（如首页技术栈）要先用它确认已装的图标集里有这个图标。
export function isIconName(icon: string): icon is IconName {
  const [prefix, name] = icon.split(":");
  return Boolean(sets[prefix] && name && getIconData(sets[prefix], name));
}

export default function IconifyIcon({ icon, size = 18, className }: { icon: IconName; size?: number; className?: string }) {
  const [prefix, name] = icon.split(":");
  const data = getIconData(sets[prefix], name);
  if (!data) return null;
  const { attributes, body } = iconToSVG(data, { height: size });
  // 渐变等 id 加上图标名前缀：同一页里不同图标（比如技术栈同一个图标的 -dark/-light 两份）的 id 不会撞，
  // 否则 url(#a) 会指向被 display: none 藏起来那份里的渐变，画出来是空的
  const scope = icon.replace(/[^a-z0-9]+/gi, "-");
  const scoped = body.replace(/\bid="([^"]+)"/g, `id="${scope}-$1"`).replace(/(url\(#|href="#)([^)"]+)/g, `$1${scope}-$2`);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={attributes.viewBox}
      width={attributes.width}
      height={attributes.height}
      className={className}
      data-icon={icon}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: scoped }}
    />
  );
}

// 社交账号的品牌标志（平台与图标对照在 lib/social.ts）；图标集里没有时用名字首字。首屏、导航面板和调试页共用。
export function SocialIcon({ icon, label, size = 18 }: { icon: string; label: string; size?: number }) {
  return isIconName(icon) ? <IconifyIcon icon={icon} size={size} /> : <>{label.slice(0, 1)}</>;
}

// App 图标（lib/app-icons.ts，/api/app-icon/<key> 用）：标志放在 macOS 风格的圆角白底上，做成一个完整的 SVG 文件。
// 白底让黑色标志（GitHub、Cursor）在深色卡片上也看得见；单色标志（simple-icons）用 color 上品牌色。
export function appIconSvg(icon: string, color?: string) {
  const [prefix, name] = icon.split(":");
  const data = sets[prefix] && getIconData(sets[prefix], name);
  if (!data) return null;
  const { attributes, body } = iconToSVG(data);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    '<defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8eaf0"/></linearGradient></defs>',
    '<rect width="100" height="100" rx="23" fill="url(#tile)"/>',
    '<rect x="0.5" y="0.5" width="99" height="99" rx="22.5" fill="none" stroke="#000" stroke-opacity="0.08"/>',
    `<svg x="20" y="20" width="60" height="60" viewBox="${attributes.viewBox}"${color ? ` color="${color}"` : ""}>${body}</svg>`,
    "</svg>",
  ].join("");
}
