"use client";

import { NavigationMenu } from "@base-ui/react/navigation-menu";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import type { Messages } from "../lib/i18n/messages";
import Link, { useLocale, useLocalePathname, useT } from "./locale-provider";
import { htmlLang } from "../lib/i18n/config";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useIsland } from "../lib/island-store";
import type { NavigationEntry, getNavigationPanels } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import type { SocialCard } from "../lib/social";
import ContactCard from "./contact-card";
import SocialTooltip, { SocialTooltipGroup } from "./social-tooltip";
import MobileMenu from "./mobile-menu";
import RollText from "./roll-text";
import "./navigation-menu.css";

// note：后台页面的副标题（首页面板里页面名下面那句）
type NavigationLink = { label: string; href: string; note?: string };
type Panels = Awaited<ReturnType<typeof getNavigationPanels>>;
export type NavigationState =
  | { status: "loading" | "error" }
  | {
    status: "ready";
    pages: NavigationLink[];
    panels: Panels | null;
    socials: { label: string; href: string; icon: ReactNode; color: string; dark: boolean }[];
    // 微信、QQ 这类没有网页主页的“名片”，点开看二维码和号码
    contacts?: { card: SocialCard; icon: ReactNode }[];
  };

// 一级导航的顺序：首页、文章、手记、时间线、碎碎念、更多（作品、友链、一言、思考），开发环境末尾再加“调试”。
// 首页、文章、手记、时间线本身是链接（点击跳转），悬停或聚焦时展开各自的面板；碎碎念只是链接；更多只展开。
// 文案在 lib/i18n/messages 的 nav 里（按当前语言取）
type NavCopy = Messages["nav"];
// “更多”：和时间线面板的分类一样一栏上下排（小星 名字 …… 一句说明）。
// 跃迁放在底栏（和其他面板的“查看全部 →”同一个位置）：萌备的“异次元之旅”travel.moe，随机跳到一位萌备成员的博客（不是我们的友链），在新标签页打开
const moreLinksOf = (t: NavCopy) => [
  { ...t.moreLinks.projects, href: "/projects" },
  { ...t.moreLinks.friends, href: "/friends" },
  { ...t.moreLinks.says, href: "/says" },
  { ...t.moreLinks.thinking, href: "/thinking" },
];
const warpHref = "https://travel.moe/go.html";

const isCurrent = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
// 面板里的日期只显示“月·日”
const monthDay = (created: string) => formatDate(created).slice(5).replace("/", "·");

// 一级项的内容：文字 + 脚下一颗暗星；当前页那一项再叠一颗亮星（同一个 layoutId，换页时亮星沿着连线移到新的一项）。
function Star({ active }: { active: boolean }) {
  return (
    <>
      <span className="navigation-Dot" aria-hidden="true" />
      {active && (
        <motion.span
          layoutId="navigation-star"
          className="navigation-Star"
          aria-hidden="true"
          transition={{ type: "spring", stiffness: 260, damping: 26, mass: 1 }}
        />
      )}
    </>
  );
}

// 面板里的链接：点了就收起面板，交给 Next 的 Link 跳转
// external：去别人的站（跃迁），在新标签页打开、不预取
function PanelLink({ href, className, children, current, external, label }: { href: string; className: string; children: ReactNode; current?: boolean; external?: boolean; label?: string }) {
  return (
    <NavigationMenu.Link className={className} active={current} closeOnClick aria-label={label} render={external ? <Link href={href} target="_blank" rel="noopener noreferrer" prefetch={false} /> : <Link href={href} />}>
      {children}
    </NavigationMenu.Link>
  );
}

// 一条条“月·日 标题 [类型]”的近期列表
function EntryList({ entries, pathname, showKind }: { entries: NavigationEntry[]; pathname: string; showKind?: boolean }) {
  const t = useT().nav;
  if (!entries.length) return <p className="nav-panel-empty">{t.empty}</p>;
  return (
    <ul className="nav-entries">
      {entries.map((entry) => (
        <li key={entry.id}>
          <PanelLink href={entry.href} className="nav-entry" current={pathname === entry.href}>
            <time dateTime={entry.created}>{monthDay(entry.created)}</time>
            <span className="nav-entry-title">{entry.title}</span>
            {showKind && <span className="nav-entry-kind">{entry.kind === "post" ? t.posts : t.notes}</span>}
          </PanelLink>
        </li>
      ))}
    </ul>
  );
}

// 底栏整行是一个链接（和上面的行一样，鼠标停在右边的说明上也算），说明保持淡色；左边的文字悬停时逐字翻滚（和页脚链接一样）
function PanelFooter({ href, label, aside, external }: { href: string; label: string; aside?: string; external?: boolean }) {
  const Arrow = external ? ArrowUpRight : ArrowRight;
  return (
    <div className="nav-panel-footer">
      <PanelLink href={href} className="nav-panel-more" external={external} label={aside ? `${label} ${aside}` : label}>
        <span className="nav-panel-more-label"><RollText>{label}</RollText><Arrow size={14} aria-hidden="true" /></span>
        {aside && <span className="nav-panel-more-aside">{aside}</span>}
      </PanelLink>
    </div>
  );
}

// 首页面板（海报大字，2026-10-31 定）：左边一个旧式数字的大字“第几夜”（建站天数），篇数和字数在下面上下排开、撑满左栏；
// 右边后台页面（页面名 + 后台填的副标题 + 箭头；5 个起分两栏、13 个起分三栏，面板跟着变宽），社交账号在页面下面、多了换行。
// 原来“此间三个数字 + 页面网格”和 Innei 太像。
type Ready = Extract<NavigationState, { status: "ready" }>;
type HomePanelProps = { pages: NavigationLink[]; socials: Ready["socials"]; contacts?: Ready["contacts"]; stats?: Panels["stats"]; pathname: string };

// 字数：“1.2 万字”“12.3K words”。缩写交给 Intl；汉字的缩写（万）并进单位，字母的（K）跟着数字
function compactCount(value: number, unit: string, locale: string): [string, string] {
  const parts = new Intl.NumberFormat(htmlLang(locale), { notation: "compact", maximumFractionDigits: 1 }).formatToParts(value);
  const suffix = parts.filter((part) => part.type === "compact").map((part) => part.value).join("");
  const digits = parts.filter((part) => part.type !== "compact" && part.type !== "literal").map((part) => part.value).join("");
  return /^[A-Za-z]*$/.test(suffix) ? [digits + suffix, unit] : [digits, suffix + unit];
}

function HomePanel({ pages, socials, contacts = [], stats, pathname }: HomePanelProps) {
  const t = useT().nav;
  const locale = useLocale();
  const number = new Intl.NumberFormat(htmlLang(locale));
  const compact = (value: number, unit: string) => compactCount(value, unit, locale);
  // 名片卡片和社交图标的悬停提示挂进导航弹层（.navigation-Popup，不裁切内容）：鼠标移到卡片上仍算在面板里，面板不会收起。
  // 调试页把面板直接摆在页面上、没有弹层，就挂在面板自己身上。
  const panel = useRef<HTMLDivElement>(null);
  const [cardHost, setCardHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setCardHost(panel.current?.closest<HTMLElement>(".navigation-Popup") ?? panel.current);
  }, []);
  return (
    <div className="nav-panel is-home" ref={panel}>
      {stats?.days && (
        <section className="nav-panel-side nav-night">
          <p className="nav-night-count" aria-label={t.nightLabel(stats.days)}>
            <b aria-hidden="true">{stats.days}</b>
            <span aria-hidden="true">{t.night}</span>
          </p>
          {[[number.format(stats.writings), t.piecesUnit], compact(stats.words, t.wordsUnit)].map(([value, unit]) => (
            <p key={unit} className="nav-night-stat"><b>{value}</b> <span>{unit}</span></p>
          ))}
        </section>
      )}
      <section className="nav-panel-main nav-home-main">
        {pages.length ? (
          <ul className="nav-home-pages">
            {pages.map((page) => (
              <li key={page.href}>
                <PanelLink href={page.href} className="nav-home-page" current={pathname === page.href}>
                  <span className="nav-home-page-text">
                    <span className="nav-home-page-title">{page.label}</span>
                    {page.note && <span className="nav-home-page-note">{page.note}</span>}
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </PanelLink>
              </li>
            ))}
          </ul>
        ) : <p className="nav-panel-empty">{t.noPages}</p>}
        {(socials.length > 0 || contacts.length > 0) && (
          <SocialTooltipGroup>
            <ul className="nav-socials">
              {socials.map((social) => (
                <li key={social.href} data-dark={social.dark ? "" : undefined} style={{ "--brand": social.color } as CSSProperties}>
                  <SocialTooltip label={social.label} container={cardHost}>
                    <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label}>{social.icon}</a>
                  </SocialTooltip>
                </li>
              ))}
              {socials.length > 0 && contacts.length > 0 && <li className="nav-socials-divider" aria-hidden="true" />}
              {contacts.map(({ card, icon }) => (
                <li key={card.key} style={{ "--brand": card.color } as CSSProperties}>
                  <ContactCard card={card} icon={icon} container={cardHost} side="bottom" tooltip />
                </li>
              ))}
            </ul>
          </SocialTooltipGroup>
        )}
      </section>
    </div>
  );
}

// 调试页用：不放进弹层，直接把首页面板摆在页面上（面板里的链接要在 NavigationMenu 的 Root 和一个 List/Content 里）
export function HomePanelPreview(props: Omit<HomePanelProps, "pathname">) {
  return (
    <NavigationMenu.Root>
      <NavigationMenu.List render={<div />}><HomePanel {...props} pathname="" /></NavigationMenu.List>
    </NavigationMenu.Root>
  );
}

// 分组面板（文章按分类、手记按话题）：左边各组和篇数，鼠标停在哪一组，右边就列出它最近的 5 篇；底部“查看全部”。
// showKind：右边列表每条后面标出“文章 / 手记”（时间线的“全部”是混排的）
type Group = { name: string; href: string; count: number; icon?: string; recent: NavigationEntry[]; showKind?: boolean };

function GroupPanel({ className, label, groups, fallback, pathname, footer }: {
  className: string;
  label: string;
  groups: Group[];
  fallback: NavigationEntry[];
  pathname: string;
  footer: ReactNode;
}) {
  const t = useT().nav;
  const [active, setActive] = useState(() => Math.max(0, groups.findIndex((group) => group.recent.length)));
  const group = groups[active];
  return (
    <div className={`nav-panel ${className}`}>
      <div className="nav-panel-body">
        {groups.length > 0 && (
          <section className="nav-panel-side">
            <p className="nav-panel-label">{label}</p>
            <ul className="nav-categories">
              {groups.map((item, index) => (
                <li key={item.href} data-highlighted={index === active ? "" : undefined} onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)}>
                  <PanelLink href={item.href} className="nav-category" current={pathname === item.href}>
                    <span className="nav-category-name">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 话题图标来自后台任意地址 */}
                      {item.icon !== undefined && (item.icon ? <img className="nav-topic-icon" src={item.icon} alt="" width={18} height={18} /> : <span className="nav-topic-icon" aria-hidden="true" />)}
                      {item.name}
                    </span>
                    <span className="nav-category-count">{item.count}</span>
                  </PanelLink>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="nav-panel-main">
          <p className="nav-panel-label">{group ? t.recentOf(group.name) : t.recent}</p>
          <EntryList entries={group?.recent ?? fallback} pathname={pathname} showKind={group?.showKind} />
        </section>
      </div>
      {footer}
    </div>
  );
}

// account：手机菜单底部的读者登录入口（header-account.tsx）
export default function BlogNavigation({ state, account }: { state: NavigationState; account?: ReactNode }) {
  // 去掉语言前缀后的路径，判断当前页用（/en/posts 也算“文章”）
  const pathname = useLocalePathname();
  const t = useT().nav;
  const moreLinks = moreLinksOf(t);
  // 当前展开的面板。点击一级链接跳转时弹层是“点击打开”的，不会因鼠标离开而关闭，
  // 所以路由变化时主动收起（渲染期间比较上一次路径，不用 effect）。
  const [openItem, setOpenItem] = useState<unknown>(null);
  const [lastPathname, setLastPathname] = useState(pathname);
  const lastPointerType = useRef("");
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpenItem(null);
  }
  // 面板开着时告诉页头夜航岛别收起（否则面板会失去依附）
  const setNavOpen = useIsland((store) => store.setNavOpen);
  useEffect(() => setNavOpen(openItem !== null), [openItem, setNavOpen]);
  const router = useRouter();
  const ready = state.status === "ready" ? state : null;
  const panels = ready?.panels ?? null;
  const pages = ready?.pages ?? [];
  const devLinks = process.env.NODE_ENV !== "production" ? [{ label: t.debug, href: "/debug" }] : [];

  // 本身是链接、悬停展开面板的一级项。nativeButton={false}：触发器渲染成链接，回车/点击交给链接跳转，Base UI 负责展开面板。
  // 触屏没有悬停：面板未展开时第一次点按只展开、不跳转；展开后再点才跳转。
  const linkItem = (label: string, href: string, current: boolean, panel: ReactNode | null) => panel ? (
    <NavigationMenu.Item key={href} value={label}>
      <NavigationMenu.Trigger
        className="navigation-Trigger"
        nativeButton={false}
        render={<Link href={href} />}
        data-current={current ? "" : undefined}
        aria-current={pathname === href ? "page" : undefined}
        onPointerDown={(event) => { lastPointerType.current = event.pointerType; }}
        onClick={(event) => {
          if (lastPointerType.current === "touch" && openItem !== label) event.preventDefault();
        }}
      >
        {label}<Star active={current} />
        <NavigationMenu.Icon className="navigation-Icon" aria-hidden="true"><ChevronDown size={14} /></NavigationMenu.Icon>
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="navigation-Content">{panel}</NavigationMenu.Content>
    </NavigationMenu.Item>
  ) : (
    <NavigationMenu.Item key={href}>
      <NavigationMenu.Link className="navigation-Trigger" active={current} render={<Link href={href} />}>
        {label}<Star active={current} />
      </NavigationMenu.Link>
    </NavigationMenu.Item>
  );

  const moreCurrent = moreLinks.some(({ href }) => isCurrent(pathname, href));

  return (
    <div className="navigation-Area">
    {/* 手机菜单和桌面导航同样分级：首页 → 后台页面，文章 → 分类，手记 → 话题，时间线 → 文章 / 手记，更多 → 作品等（面板数据读不到时二级为空） */}
    <MobileMenu
      sections={[
        { label: t.home, href: "/", children: pages },
        { label: t.posts, href: "/posts", children: (panels?.categories ?? []).map(({ name, href }) => ({ label: name, href })) },
        { label: t.notes, href: "/notes", children: (panels?.topics ?? []).map(({ name, href, icon }) => ({ label: name, href, icon: icon ?? null })) },
        { label: t.timeline, href: "/timeline", children: [{ label: t.posts, href: "/timeline/posts" }, { label: t.notes, href: "/timeline/notes" }] },
        { label: t.murmurs, href: "/murmurs", children: [] },
        { label: t.more, children: [...moreLinks.map(({ label, href }) => ({ label, href })), { label: t.moreLinks.warp.label, href: warpHref, external: true }, ...devLinks] },
      ]}
      account={account}
    />
    <NavigationMenu.Root
      className="navigation-Root"
      aria-label={t.label}
      // 鼠标离开后多久收起面板：原来 500ms 用着粘手，150ms 足够鼠标从导航滑进面板（中间有透明的悬停桥）
      closeDelay={150}
      value={openItem}
      onValueChange={setOpenItem}
    >
      <MotionConfig reducedMotion="user">
      <LayoutGroup id="navigation">
      <NavigationMenu.List className="navigation-List">
        {linkItem(t.home, "/", pathname === "/", ready && <HomePanel pages={ready.pages} socials={ready.socials} contacts={ready.contacts} stats={ready.panels?.stats} pathname={pathname} />)}
        {linkItem(t.posts, "/posts", isCurrent(pathname, "/posts") || pathname.startsWith("/categories/"), panels && (
          <GroupPanel className="is-posts" label={t.categories} groups={panels.categories} fallback={[]} pathname={pathname}
            footer={<PanelFooter href="/posts" label={t.allPosts} aside={t.postCount(panels.postCount)} />} />
        ))}
        {linkItem(t.notes, "/notes", isCurrent(pathname, "/notes"), panels && (
          <GroupPanel className="is-notes" label={t.topics} groups={panels.topics.map((topic) => ({ ...topic, icon: topic.icon ?? "" }))} fallback={panels.recentNotes} pathname={pathname}
            footer={<PanelFooter href="/notes" label={t.allNotes} aside={t.noteCount(panels.noteCount)} />} />
        ))}
        {/* 时间线面板：全部 / 文章 / 手记三组，点组名进时间线对应的子页，鼠标停在哪组右边就列出它最近的 5 篇 */}
        {linkItem(t.timeline, "/timeline", isCurrent(pathname, "/timeline"), panels && (
          <GroupPanel
            className="is-timeline"
            label={t.categories}
            groups={[
              { name: t.all, href: "/timeline", count: panels.postCount + panels.noteCount, recent: panels.recent, showKind: true },
              { name: t.posts, href: "/timeline/posts", count: panels.postCount, recent: panels.recentPosts },
              { name: t.notes, href: "/timeline/notes", count: panels.noteCount, recent: panels.recentNotes },
            ]}
            fallback={panels.recent}
            pathname={pathname}
            footer={<PanelFooter href="/timeline" label={t.viewTimeline} />}
          />
        ))}
        {linkItem(t.murmurs, "/murmurs", isCurrent(pathname, "/murmurs"), null)}
        {/* “更多”没有自己的页面，触发器是普通按钮，点击或悬停只展开面板 */}
        <NavigationMenu.Item value="more">
          <NavigationMenu.Trigger className="navigation-Trigger" data-current={moreCurrent ? "" : undefined}>
            {t.more}<Star active={moreCurrent} />
            <NavigationMenu.Icon className="navigation-Icon" aria-hidden="true"><ChevronDown size={14} /></NavigationMenu.Icon>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="navigation-Content">
            <div className="nav-panel is-more">
              <section className="nav-more">
                <p className="nav-panel-label">{t.moreLabel}</p>
                <ul className="nav-categories">
                  {moreLinks.map((link) => (
                    <li key={link.href}>
                      <PanelLink href={link.href} className="nav-category" current={isCurrent(pathname, link.href)}>
                        <span className="nav-category-name">{link.label}</span>
                        <span className="nav-more-note">{link.note}</span>
                      </PanelLink>
                    </li>
                  ))}
                </ul>
              </section>
              <PanelFooter href={warpHref} label={t.moreLinks.warp.label} aside={t.moreLinks.warp.note} external />
              {state.status === "loading" && <p className="navigation-message" role="status">{t.loading}</p>}
              {state.status === "error" && (
                <p className="navigation-message" role="status">
                  {t.failed}<button className="navigation-retry" type="button" onClick={() => router.refresh()}>{t.retry}</button>
                </p>
              )}
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        {devLinks.map((link) => linkItem(link.label, link.href, pathname === link.href, null))}
      </NavigationMenu.List>
      </LayoutGroup>
      </MotionConfig>
      <NavigationMenu.Portal>
        <NavigationMenu.Positioner className="navigation-Positioner" side="bottom" align="center" sideOffset={12} collisionPadding={12}>
          <NavigationMenu.Popup className="navigation-Popup">
            <NavigationMenu.Viewport className="navigation-Viewport" />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
    </div>
  );
}
