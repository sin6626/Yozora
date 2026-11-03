"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu, Search } from "lucide-react";
import Link, { useLocalePathname, useT } from "./locale-provider";
import { useState, type CSSProperties, type ReactNode } from "react";
import { OnlineCount } from "./notifications";
import LanguageMenu from "./language-menu";
import SkyMenu from "./sky-menu";
import ThemeToggle from "./theme-switcher";
import { openSearch } from "./command-search";
import "./mobile-menu.css";

// 二级链接：icon 是话题的后台图片（null 表示话题没设图片，留空位；其他链接不传）
// external：去别人的站（跃迁），在新标签页打开、不预取
type MenuChild = { label: string; href: string; icon?: string | null; external?: boolean };
export type MenuSection = { label: string; href?: string; children: MenuChild[] };

const pathOf = (href: string) => href.split("?")[0];

// 手机上的导航：顶部只留站名和菜单按钮，点开后整屏变成夜空。和桌面导航一样分级：
// 一级（首页、文章、手记、时间线、碎碎念、更多）各带一颗星，用一条星座线串起来，当前所在的那颗亮起；二级链接列在一级下面。
// 打开时星座线从上往下画出，各组依次浮上，最后底部工具淡入（mobile-menu.css）。开灯/熄灯、语言、登录、搜索在底部。
export default function MobileMenu({ sections, account }: { sections: MenuSection[]; account?: ReactNode }) {
  const pathname = useLocalePathname();
  const t = useT().mobileMenu;
  const nav = useT().nav;
  const search = useT().search;
  const [open, setOpen] = useState(false);
  // 跳转后收起菜单（渲染期比较上一次路径，不用 effect）。
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }
  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const current = (href: string) => (pathname === pathOf(href) ? "page" : undefined);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="mobile-menu-trigger" aria-label={t.open}>
        <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Popup className="mobile-menu" aria-label={t.label}>
          <div className="mobile-menu-top">
            <Dialog.Title className="mobile-menu-title">{t.title}</Dialog.Title>
            <Dialog.Close className="btn btn-ghost">{t.close}</Dialog.Close>
          </div>
          <nav className="mobile-menu-nav" aria-label={nav.label}>
            <span className="mobile-menu-line" aria-hidden="true" />
            <ul className="mobile-menu-sections">
              {sections.map((section, index) => {
                const here = (section.href !== undefined && isCurrent(section.href)) || section.children.some((child) => pathname === pathOf(child.href));
                return (
                  <li key={section.label} className="mobile-menu-section" data-current={here ? "" : undefined} style={{ "--i": index } as CSSProperties}>
                    <span className="mobile-menu-star" aria-hidden="true" />
                    {section.href !== undefined
                      ? <Link className="mobile-menu-heading" href={section.href} aria-current={current(section.href)} onClick={() => setOpen(false)}>{section.label}</Link>
                      : <span className="mobile-menu-heading">{section.label}</span>}
                    {section.children.length > 0 && (
                      <ul className="mobile-menu-children" aria-label={section.label}>
                        {section.children.map((child) => (
                          <li key={child.href}>
                            <Link href={child.href} aria-current={current(child.href)} onClick={() => setOpen(false)} {...(child.external ? { target: "_blank", rel: "noopener noreferrer", prefetch: false } : {})}>
                              {child.icon !== undefined && (child.icon
                                // eslint-disable-next-line @next/next/no-img-element -- 后台话题图片，任意地址的小图标
                                ? <img className="mobile-menu-icon" src={child.icon} alt="" width={18} height={18} />
                                : <span className="mobile-menu-icon" aria-hidden="true" />)}
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mobile-menu-bottom">
            {/* 手机上页头没有工具区，搜索从这里打开：先收起菜单，再弹出同一个搜索弹窗 */}
            <button type="button" className="icon-button" onClick={() => { setOpen(false); openSearch(); }} aria-label={search.open}>
              <Search size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
            {account}
            <LanguageMenu side="top" />
            <SkyMenu side="top" />
            <ThemeToggle />
            <OnlineCount />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
