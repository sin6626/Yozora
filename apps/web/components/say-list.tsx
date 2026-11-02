import "./says.css";
import { unstable_rethrow } from "next/navigation";
import { getAllSays, getSiteSettings, getSiteUrl } from "../lib/blog-data";
import { getT } from "../lib/i18n/server";
import { skyFrames, skyLayout } from "../lib/says";
import LoadError from "./load-error";
import SaySky from "./say-sky";

// 一言：朋友们说过的好句子。整页就是一片星空（say-sky.tsx），每句话一颗星，同一个人说的连成星座，移到星上读那一句、可以做成卡片（say-tools.tsx）。
// 没有列表（2026-11-02 用户：只要这张星图）；星对读屏隐藏，所以全部句子另有一份只给读屏和搜索引擎的列表（sr-only）。纯逻辑在 lib/says.ts。
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
          <ul className="sr-only">
            {says.map((say) => (
              <li key={say.id}>
                <blockquote lang="zh-CN">
                  <p>{say.text}</p>
                  {(say.author || say.source) && <footer>—— {[say.author, say.source && `《${say.source}》`].filter(Boolean).join(" ")}</footer>}
                </blockquote>
              </li>
            ))}
          </ul>
        </SaySky>
      ) : (
        <p className="post-empty">{t.empty}</p>
      )}
    </>
  );
}
