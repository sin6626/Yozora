"use client";

import { Popover } from "@base-ui/react/popover";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Telescope } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useIsland } from "../lib/island-store";
import { useT } from "./locale-provider";
import { withThemeTransition } from "./theme-switcher";
import "./sky-menu.css";

// 三套配色：夜紫是默认（<html> 不带 data-palette），银河、墨黑在 globals.css 的 :root[data-palette] 上覆盖颜色变量
export const palettes = ["night", "galaxy", "ink"] as const;
export type Palette = (typeof palettes)[number];

const storageKey = "palette";
const listeners = new Set<() => void>();

function readPalette(): Palette {
  const value = document.documentElement.dataset.palette;
  return value === "galaxy" || value === "ink" ? value : "night";
}

function apply(next: Palette) {
  if (next === "night") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = next;
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  // 其他标签页换了配色，这里同步
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    apply(event.newValue === "galaxy" || event.newValue === "ink" ? event.newValue : "night");
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePalette() {
  return useSyncExternalStore(subscribe, readPalette, () => "night" as const);
}

// 换配色和换深浅一样整页 0.6 秒渐变，背景星空（starfield.tsx）盯着 data-palette 跟着换。
// 记在 localStorage（夜紫是默认，不存），下次打开时 layout.tsx 的 themeScript 在绘制前套上
export function setPalette(next: Palette) {
  if (next === readPalette()) return;
  try {
    if (next === "night") localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, next);
  } catch {}
  withThemeTransition(() => apply(next));
}

// “今晚的天空”面板：三块小天空预览（天色、银河或星云、几颗星、一枚各自月光色的月亮），点哪块换成哪套配色。
// 浅色 / 深色仍由旁边的月亮按钮（theme-switcher.tsx）管，这里不重复
export function SkyPanel() {
  const palette = usePalette();
  const t = useT().theme;
  return (
    <div className="sky-panel">
      <p className="sky-label">{t.sky}</p>
      <RadioGroup className="sky-options" value={palette} onValueChange={(value) => setPalette(value as Palette)} aria-label={t.sky}>
        {palettes.map((item) => (
          <Radio.Root key={item} value={item} className="sky-option" data-sky={item}>
            <span className="sky-preview" aria-hidden="true" />
            <span className="sky-name">{t.palettes[item]}</span>
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}

// 入口：一个望远镜图标按钮（不用月亮，免得和切换深浅的按钮混在一起），点开是上面的面板。host：页头那份，浮层开着时夜航岛保持展开
export default function SkyMenu({ host = false, side = "bottom" }: { host?: boolean; side?: "bottom" | "top" }) {
  const palette = usePalette();
  const t = useT().theme;
  const setNavOpen = useIsland((state) => state.setNavOpen);
  return (
    <Popover.Root onOpenChange={(open) => { if (host) setNavOpen(open); }}>
      <Popover.Trigger className="icon-button sky-trigger" aria-label={t.skyButton(t.palettes[palette])}>
        <Telescope size={18} strokeWidth={1.75} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="sky-positioner" side={side} align="end" sideOffset={10} collisionPadding={12}>
          <Popover.Popup className="sky-popup">
            <SkyPanel />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
