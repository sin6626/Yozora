import { connection } from "next/server";
import { getLinks } from "@/lib/blog-data";
import { pickFriend } from "@/lib/visit";

// 串门：每次随机跳到一位朋友的站（导航“更多”里的链接在新标签页打开）。读不到友链或一位都没有时回到友链页。
export async function GET(request: Request) {
  await connection();
  const friend = pickFriend(await getLinks().catch(() => []));
  return Response.redirect(friend ? friend.url : new URL("friends", request.url), 307);
}
