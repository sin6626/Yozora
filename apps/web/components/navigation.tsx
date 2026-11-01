import { Suspense, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { getNavigationData, getNavigationPanels, getOwner } from "../lib/blog-data";
import { SocialIcon } from "./iconify-icon";
import NavigationMenu, { type NavigationState } from "./navigation-menu";
import { getLocale, getT } from "../lib/i18n/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function links(value: unknown, labelKey: "name" | "title", prefix: string) {
  if (!Array.isArray(value)) throw new Error("导航数据格式错误");
  return value.map((item: unknown) => {
    if (!isRecord(item)) throw new Error("导航条目格式错误");
    const label = item[labelKey];
    const slug = item.slug;
    if (
      typeof label !== "string" || !label.trim() ||
      typeof slug !== "string" || !slug.trim() || slug === "." || slug === ".."
    ) throw new Error("导航条目格式错误");
    const note = typeof item.subtitle === "string" && item.subtitle.trim() ? item.subtitle.trim() : undefined;
    return { label, href: `${prefix}${encodeURIComponent(slug)}`, note };
  });
}

async function NavigationData({ account }: { account?: ReactNode }) {
  let state: NavigationState;
  try {
    // 悬停面板的数据和站长社交账号读不到时不影响导航本身，面板退回简单列表
    const [data, panels, owner] = await Promise.all([
      getNavigationData(await getLocale()),
      getNavigationPanels(await getLocale()).catch((error) => { unstable_rethrow(error); return null; }),
      getOwner(await getLocale()).catch((error) => { unstable_rethrow(error); return null; }),
    ]);
    state = {
      status: "ready",
      pages: links(data.pageMeta, "title", "/"),
      panels,
      socials: (owner?.socials ?? []).map((social) => ({ ...social, icon: <SocialIcon icon={social.icon} label={social.label} size={15} /> })),
      // 微信、QQ 名片（点开看二维码和号码），排在直达链接后面
      contacts: (owner?.contacts ?? []).map((card) => ({ card, icon: <SocialIcon icon={card.icon} label={card.label} size={15} /> })),
    };
  } catch (error) {
    unstable_rethrow(error);
    state = { status: "error" };
  }
  return <NavigationMenu state={state} account={account} />;
}

export default async function Navigation({ account }: { account?: ReactNode }) {
  return (
    <Suspense fallback={<p className="navigation-message" role="status">{(await getT()).nav.loading}</p>}>
      <NavigationData account={account} />
    </Suspense>
  );
}
