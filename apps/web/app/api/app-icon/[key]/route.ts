import { appIconSvg } from "@/components/iconify-icon";
import { appIcons } from "@/lib/app-icons";

// 常见 App 的清晰图标（对照表和用法见 lib/app-icons.ts）。地址带版本号，浏览器缓存一年。
export async function GET(_request: Request, ctx: RouteContext<"/api/app-icon/[key]">) {
  const { key } = await ctx.params;
  const entry = Object.hasOwn(appIcons, key) ? appIcons[key] : undefined;
  const svg = entry && appIconSvg(entry.icon, entry.color);
  if (!svg) return new Response("Not Found", { status: 404 });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
}
