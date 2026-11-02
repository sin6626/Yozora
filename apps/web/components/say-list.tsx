import "./corners.css";
import "./details-sidebar.css";
import "./says.css";
import { unstable_rethrow } from "next/navigation";
import { getAllSays, getSiteSettings, getSiteUrl } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { getT } from "../lib/i18n/server";
import { skyFrames, skyLayout, type Say } from "../lib/says";
import LoadError from "./load-error";
import SayListDrawer from "./say-list-drawer";
import SaySky from "./say-sky";
import { SayCardButton } from "./say-tools";

// 一言：朋友们说过的好句子。整页是一片星空（say-sky.tsx），每句话一颗星，同一个人说的连成星座，移到星上读那一句；
// 全部句子收在“全部 N 条”抽屉里（say-list-drawer.tsx），每张引文卡片右上角可以“做成卡片”（say-tools.tsx）。纯逻辑在 lib/says.ts。
// 旧的 ?page=、?author= 链接都直接显示这一页。
export default async function SayList() {
  const { says: t } = await getT();

  let says: Awaited<ReturnType<typeof getAllSays>>;
  let site: string;
  try {
    const [all, settings, siteUrl] = await Promise.all([getAllSays(), getSiteSettings().catch(() => null), getSiteUrl().catch(() => "")]);
    says = all;
    site = [settings?.name, siteUrl && new URL(siteUrl).host].filter(Boolean).join(" · ");
  } catch (error) {
    unstable_rethrow(error);
    return <LoadError what={t.title} href="/says" />;
  }

  return (
    <>
      <header className="page-heading">
        <h1>{t.title}</h1>
        <p className="post-meta">{t.count(says.length)}</p>
      </header>
      {says.length ? (
        <SaySky layouts={{ wide: skyLayout(says, skyFrames.wide), tall: skyLayout(says, skyFrames.tall) }} says={says} site={site}>
          <SayListDrawer count={says.length}>
            <SayCards says={says} site={site} />
          </SayListDrawer>
        </SaySky>
      ) : (
        <p className="post-empty">{t.empty}</p>
      )}
    </>
  );
}

// 全部句子的引文卡片（抽屉里用，调试页也用）
export function SayCards({ says, site }: { says: Say[]; site: string }) {
  return (
    <ul className="say-list">
      {says.map((say) => (
        <li key={say.id} className="say-card">
          <blockquote lang="zh-CN">
            <p>{say.text}</p>
            {(say.author || say.source) && (
              <footer className="post-meta">
                {say.author && <span>{say.author}</span>}
                {say.source && <cite>{say.source}</cite>}
              </footer>
            )}
          </blockquote>
          <time className="say-date" dateTime={say.created}>{formatDate(say.created)}</time>
          <SayCardButton say={say} site={site} />
        </li>
      ))}
    </ul>
  );
}
