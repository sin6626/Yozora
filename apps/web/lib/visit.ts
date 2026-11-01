import { LinkState, LinkType } from "@mx-space/api-client";
import { safeUrl } from "./safe-url";

type FriendLink = { url: string; hide: boolean; state: LinkState; type: LinkType };

// 串门（导航“更多”）：从已通过、没隐藏的朋友里随机挑一位（不含“收藏”的站，也不去失联的），只放行 http(s)
export function pickFriend<T extends FriendLink>(links: T[], random = Math.random) {
  const friends = links.filter((link) => !link.hide && link.state === LinkState.Pass && link.type === LinkType.Friend && safeUrl(link.url));
  return friends.length ? friends[Math.floor(random() * friends.length)] : undefined;
}
