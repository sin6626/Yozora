// 常见 App 的清晰图标。Companion 传到图床的 App 图标只有 32×32（它读 macOS 图标时用的默认尺寸），放大就糊；
// 这里认得的 App 改用离线图标集里的矢量标志，由 /api/app-icon/<key>（app/api/app-icon/[key]/route.ts）在服务端
// 画成带圆角白底的 SVG App 图标。names 是 Companion 报上来的 App 名（macOS 的本地化名字，中英文都列上），不区分大小写。
// 认不得的 App 仍用 Companion 的小图标。卡片里放歌的播放器（Companion 报的进程名，如 NetEaseMusic）也查这张表。新加 App：在这里加一行，图标名要在 components/iconify-icon.tsx 装了的图标集里。
export const appIcons: Record<string, { icon: string; names: string[]; color?: string }> = {
  chrome: { icon: "logos:chrome", names: ["Google Chrome", "Chrome", "Google Chrome Canary"] },
  edge: { icon: "logos:microsoft-edge", names: ["Microsoft Edge"] },
  safari: { icon: "logos:safari", names: ["Safari", "Safari Technology Preview", "Safari 浏览器"] },
  firefox: { icon: "logos:firefox", names: ["Firefox"] },
  arc: { icon: "logos:arc", names: ["Arc"] },
  vscode: { icon: "logos:visual-studio-code", names: ["Code", "Visual Studio Code", "Code - Insiders"] },
  cursor: { icon: "logos:cursor", names: ["Cursor"] },
  webstorm: { icon: "logos:webstorm", names: ["WebStorm"] },
  idea: { icon: "logos:intellij-idea", names: ["IntelliJ IDEA"] },
  xcode: { icon: "logos:xcode", names: ["Xcode"] },
  claude: { icon: "logos:claude-icon", names: ["Claude"] },
  chatgpt: { icon: "logos:openai-icon", names: ["ChatGPT"] },
  figma: { icon: "logos:figma", names: ["Figma"] },
  notion: { icon: "logos:notion-icon", names: ["Notion"] },
  obsidian: { icon: "logos:obsidian-icon", names: ["Obsidian"] },
  slack: { icon: "logos:slack-icon", names: ["Slack"] },
  discord: { icon: "logos:discord-icon", names: ["Discord"] },
  telegram: { icon: "logos:telegram", names: ["Telegram"] },
  wechat: { icon: "simple-icons:wechat", names: ["WeChat", "微信"], color: "#07C160" },
  qq: { icon: "simple-icons:qq", names: ["QQ"], color: "#1EBAFC" },
  spotify: { icon: "logos:spotify-icon", names: ["Spotify"] },
  netease: { icon: "simple-icons:neteasecloudmusic", names: ["NetEaseMusic", "网易云音乐", "NetEase Cloud Music"], color: "#E60026" },
  applemusic: { icon: "simple-icons:applemusic", names: ["Music", "音乐", "Apple Music"], color: "#FA243C" },
  tidal: { icon: "logos:tidal", names: ["TIDAL"] },
  foobar: { icon: "simple-icons:foobar2000", names: ["foobar2000"] },
  terminal: { icon: "logos:terminal", names: ["Terminal", "终端"] },
  iterm: { icon: "simple-icons:iterm2", names: ["iTerm2", "iTerm"] },
  ghostty: { icon: "simple-icons:ghostty", names: ["Ghostty"] },
  warp: { icon: "simple-icons:warp", names: ["Warp"] },
  raycast: { icon: "simple-icons:raycast", names: ["Raycast"], color: "#FF6363" },
  github: { icon: "logos:github-icon", names: ["GitHub Desktop"] },
  docker: { icon: "logos:docker-icon", names: ["Docker", "Docker Desktop"] },
  postman: { icon: "logos:postman-icon", names: ["Postman"] },
  linear: { icon: "logos:linear-icon", names: ["Linear"] },
  zoom: { icon: "logos:zoom-icon", names: ["zoom.us", "Zoom"] },
  steam: { icon: "logos:steam", names: ["Steam"] },
  bilibili: { icon: "simple-icons:bilibili", names: ["哔哩哔哩", "bilibili"], color: "#00A1D6" },
};

const byName = new Map(Object.entries(appIcons).flatMap(([key, { names }]) => names.map((name) => [name.toLowerCase(), key] as const)));

// 改了白底样式时把版本号加一，浏览器缓存一年
const version = 1;

export function appIconSrc(name: string) {
  const key = byName.get(name.trim().toLowerCase());
  return key ? `/api/app-icon/${key}?v=${version}` : undefined;
}
