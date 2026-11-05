"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { SkySource } from "../lib/sky-calendar";
import { useT } from "./locale-provider";

const sources: { id: SkySource; name: string }[] = [
  { id: "leetcode", name: "LeetCode" },
  { id: "github", name: "GitHub" },
];

// 星带的外框和图例：图例像统计图表那样可以点，点一下关掉那一类星星（只剩很淡的远星），再点打开；
// 两样都有的日子按还开着的那一边显示。星星本身由服务端渲染（children），这里只切换 data-hide，样式在 footer-sky.css。
export default function FooterSkyFrame({ weeks, children }: { weeks: number; children: ReactNode }) {
  const t = useT().footer;
  const [hidden, setHidden] = useState<SkySource[]>([]);
  const toggle = (source: SkySource) => setHidden((current) => (current.includes(source) ? current.filter((item) => item !== source) : [...current, source]));
  return (
    <figure className="footer-sky" data-hide={hidden.join(" ") || undefined} style={{ "--weeks": weeks } as CSSProperties}>
      {children}
      <figcaption className="footer-sky-legend" aria-label={t.skyLegend}>
        {sources.map(({ id, name }) => {
          const shown = !hidden.includes(id);
          return (
            <button key={id} type="button" className={`is-${id}`} aria-pressed={shown} title={(shown ? t.skyHide : t.skyShow)(name)} onClick={() => toggle(id)}>
              {name}
            </button>
          );
        })}
      </figcaption>
    </figure>
  );
}
