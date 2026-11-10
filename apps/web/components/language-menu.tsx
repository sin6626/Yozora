"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, Languages } from "lucide-react";
import { useRef } from "react";
import { useIsland } from "../lib/island-store";
import { htmlLang, languageName, localeCookie, localizeHref, splitLocale, type Locale } from "../lib/i18n/config";
import { zh } from "../lib/i18n/messages";
import { msg } from "../lib/i18n/msg";
import { useLocale, useLocales, useSwitchedTemplates, useT } from "./locale-provider";
import { realHref } from "../lib/address-typing";
import "./language-menu.css";

// 切换语言：记进 Cookie（proxy.ts 以后对不带前缀的地址都按它走，不再看浏览器语言），
// 再整页打开同一页面的新语言地址（换语言就是换根布局，整页加载最稳）。旧的文章 ?lang= 参数不再需要，顺手去掉。
function switchTo(locale: Locale, locales: readonly Locale[]) {
  document.cookie = `${localeCookie}=${locale}; path=/; max-age=31536000; samesite=lax`;
  const url = new URL(realHref());
  url.searchParams.delete("lang");
  url.pathname = localizeHref(splitLocale(url.pathname, locales).path, locale);
  location.assign(url);
}

// 页头那份先播报、再换页面（2026-11-04 用户要求，原来是新页面打开后才播报，显得傻）：菜单收完以后，
// 夜航岛用新语言说一句“已切换到 …”，过这么久再整页换过去，换过去的新页面不再播报
const announceMs = 1100;

// 页头（和手机菜单底部）的语言切换：“文A”图标按钮，点开是和账号菜单同样式的小浮层，
// 后台开着的每种语言各写自己的名字和简写，当前语言打勾；只开着中文时不显示。host：页头那份，先播报再换；手机菜单里那份直接换（全屏菜单盖着页头，播报看不见）。
export default function LanguageMenu({ host = false, side = "bottom" }: { host?: boolean; side?: "bottom" | "top" }) {
  const locale = useLocale();
  const locales = useLocales();
  const switched = useSwitchedTemplates();
  const t = useT().locale;
  const setNavOpen = useIsland((state) => state.setNavOpen);
  const push = useIsland((state) => state.push);
  const pending = useRef<Locale | null>(null);

  const choose = (next: Locale) => {
    if (next === locale) return;
    if (!host) switchTo(next, locales);
    else pending.current = next;
  };
  // 等菜单收完再让岛变形播报：菜单还开着时岛一变形，菜单就失去依附的按钮
  const announce = (open: boolean) => {
    const next = pending.current;
    if (open || !next) return;
    pending.current = null;
    push({ icon: "info", title: msg<[name: string]>(switched[next] ?? zh.locale.switched.template)(languageName(next)), duration: 1800 });
    setTimeout(() => switchTo(next, locales), announceMs);
  };

  if (locales.length < 2) return null;
  return (
    // 菜单开着时页头夜航岛保持展开，否则鼠标移进菜单时岛会收起、菜单失去依附
    <Menu.Root onOpenChange={(open) => { if (host) setNavOpen(open); }} onOpenChangeComplete={announce}>
      <Menu.Trigger className="icon-button language-trigger" aria-label={`${t.menuLabel}（${languageName(locale)}）`} title={languageName(locale)}>
        <Languages size={18} strokeWidth={1.75} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="language-positioner" side={side} align="end" sideOffset={10} collisionPadding={12}>
          <Menu.Popup className="language-menu">
            <Menu.RadioGroup value={locale} onValueChange={(value) => choose(value as Locale)}>
              <Menu.GroupLabel className="language-label">{t.groupLabel}</Menu.GroupLabel>
              {locales.map((item) => (
                <Menu.RadioItem key={item} value={item} className="language-item" lang={htmlLang(item)} closeOnClick>
                  <span className="language-name">{languageName(item)}</span>
                  <span className="language-code">{item.toUpperCase()}</span>
                  <Menu.RadioItemIndicator className="language-check" keepMounted>
                    <Check size={15} strokeWidth={2} aria-hidden="true" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <p className="language-hint">{t.hint}</p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
