"use client";

import { Popover } from "@base-ui/react/popover";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useIsland } from "../lib/island-store";
import { useT } from "./locale-provider";
import { setTheme, useTheme, withThemeTransition, type Theme } from "./theme-switcher";
import "./sky-menu.css";

// 三套配色：夜紫是默认（<html> 不带 data-palette），银河、墨黑在 globals.css 的 :root[data-palette] 上覆盖颜色变量
export const palettes = ["night", "galaxy", "ink"] as const;
export type Palette = (typeof palettes)[number];

const listeners = new Set<() => void>();

function readPalette(): Palette {
  const value = document.documentElement.dataset.palette;
  return value === "galaxy" || value === "ink" ? value : "night";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function usePalette() {
  return useSyncExternalStore(subscribe, readPalette, () => "night" as const);
}

// 换配色和换深浅一样整页 0.6 秒渐变，背景星空（starfield.tsx）盯着 data-palette 跟着换。
// ponytail: 还是对比阶段的 sessionStorage（layout.tsx 的 themeScript 读它），放进页头时改成 localStorage 并由服务端先输出
export function setPalette(next: Palette) {
  if (next === readPalette()) return;
  try {
    sessionStorage.setItem("palette", next);
  } catch {}
  withThemeTransition(() => {
    if (next === "night") delete document.documentElement.dataset.palette;
    else document.documentElement.dataset.palette = next;
    listeners.forEach((listener) => listener());
  });
}

// “今晚的天空”面板：上面挑配色，下面挑浅色 / 深色。
// tiles：三块小天空预览（天色、银河、几颗星、一枚各自月光色的月亮）；list：文字列表（色点 + 名字 + 一句说明），给 /debug 对照用
export function SkyPanel({ variant = "tiles" }: { variant?: "tiles" | "list" }) {
  const palette = usePalette();
  const theme = useTheme();
  const t = useT().theme;
  return (
    <div className="sky-panel" data-variant={variant}>
      <p className="sky-label">{t.sky}</p>
      <RadioGroup className="sky-options" value={palette} onValueChange={(value) => setPalette(value as Palette)} aria-label={t.sky}>
        {palettes.map((item) => (
          <Radio.Root key={item} value={item} className="sky-option" data-sky={item}>
            <span className="sky-preview" aria-hidden="true" />
            <span className="sky-name">{t.palettes[item].name}</span>
            {variant === "list" && <span className="sky-note">{t.palettes[item].note}</span>}
            {variant === "list" && (
              <Radio.Indicator className="sky-check" keepMounted>
                <Check size={15} strokeWidth={2} aria-hidden="true" />
              </Radio.Indicator>
            )}
          </Radio.Root>
        ))}
      </RadioGroup>
      <RadioGroup className="sky-brightness" value={theme} onValueChange={(value) => setTheme(value as Theme)} aria-label={t.brightness}>
        <Radio.Root value="light" className="sky-brightness-option">
          <Sun size={15} strokeWidth={1.75} aria-hidden="true" />
          {t.light}
        </Radio.Root>
        <Radio.Root value="dark" className="sky-brightness-option">
          <Moon size={15} strokeWidth={1.75} aria-hidden="true" />
          {t.dark}
        </Radio.Root>
      </RadioGroup>
    </div>
  );
}

// 页头的入口：还是一个月亮（浅色时是太阳）图标按钮，点开是上面的面板。host：页头那份，浮层开着时夜航岛保持展开
export default function SkyMenu({ variant = "tiles", host = false, side = "bottom" }: { variant?: "tiles" | "list"; host?: boolean; side?: "bottom" | "top" }) {
  const palette = usePalette();
  const theme = useTheme();
  const t = useT().theme;
  const setNavOpen = useIsland((state) => state.setNavOpen);
  return (
    <Popover.Root onOpenChange={(open) => { if (host) setNavOpen(open); }}>
      <Popover.Trigger className="icon-button sky-trigger" aria-label={t.skyButton(t.palettes[palette].name, theme === "dark" ? t.dark : t.light)}>
        {theme === "dark" ? <Moon size={18} strokeWidth={1.75} aria-hidden="true" /> : <Sun size={18} strokeWidth={1.75} aria-hidden="true" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="sky-positioner" side={side} align="end" sideOffset={10} collisionPadding={12}>
          <Popover.Popup className="sky-popup" data-variant={variant}>
            <SkyPanel variant={variant} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
