import type { CSSProperties } from "react";
import { unstable_rethrow } from "next/navigation";
import { getActivitySky } from "../lib/activity-sky";
import { htmlLang } from "../lib/i18n/config";
import { getLocale, getT } from "../lib/i18n/server";
import FooterSkyFrame from "./footer-sky-frame";
import "./footer-sky.css";

// 页脚的星带：从最早有记录的那一周到今天，一天一颗星（每列一周、每行一个星期几），那天提交越多越亮。
// 力扣刷题、GitHub 写代码各一种颜色（随配色），两样都有的日子用较亮那边的颜色（data-lead）；从左到右能看出“从刷题到写代码”的过渡。
// 不写总数，只在悬停时用 title 显示那天的日期和次数；下面的图例可以点，关掉其中一类（footer-sky-frame.tsx）。读取失败时整块不显示。
// 每颗星带上两边各自的亮度档（--lc / --gh），关掉一边时 CSS 按另一边重新算大小和亮度。
export default async function FooterSky() {
  let sky: Awaited<ReturnType<typeof getActivitySky>>;
  try {
    sky = await getActivitySky();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
  if (!sky) return null;
  const [t, locale] = await Promise.all([getT().then((all) => all.footer), getLocale()]);
  const first = sky.days.find((day) => day?.kind)?.date ?? sky.days[0]!.date;
  // “2024年3月”“March 2024”：年月的写法交给 Intl 按语言来
  const since = new Intl.DateTimeFormat(htmlLang(locale), { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${first.slice(0, 7)}-01T00:00:00Z`));
  return (
    <FooterSkyFrame weeks={sky.weeks}>
      <div className="footer-sky-years" aria-hidden="true">
        {sky.years.map(({ year, week }) => <span key={year} style={{ "--week": week } as CSSProperties}>{year}</span>)}
      </div>
      <div className="footer-sky-band" role="img" aria-label={t.sky(since)}>
        {sky.days.map((day, index) => {
          if (!day) return <i key={index} className="is-future" />;
          if (!day.kind) return <i key={index} />;
          const parts = [day.date, day.leetcode && `LeetCode ${day.leetcode}`, day.github && `GitHub ${day.github}`].filter(Boolean);
          const style = { "--lc": day.levels.leetcode, "--gh": day.levels.github, ...(day.level === 5 ? { "--twinkle": index % 9 } : {}) } as CSSProperties;
          const lead = day.kind === "both" ? (day.levels.leetcode >= day.levels.github ? "leetcode" : "github") : undefined;
          return <i key={index} className={`is-${day.kind}`} data-level={day.level} data-lead={lead} title={parts.join(" · ")} style={style} />;
        })}
      </div>
    </FooterSkyFrame>
  );
}
