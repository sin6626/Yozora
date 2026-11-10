import { getSiteContent } from "@/lib/blog-data";
import { getLocale } from "../lib/i18n/server";
import type { Tech } from "@/lib/theme-config";
import IconifyIcon, { isIconName } from "./iconify-icon";
import Reveal from "./reveal";

// 首页底部的技术栈：两行只显示图标的横向无限滚动（单数行向左、双数行向右），鼠标停上去暂停并显示名字；
// “减少动态效果”时不滚动，改成可以手动横向拖动。标题、说明和每一行都在后台配置片段 theme/yozora 的 techStack 里改
// （格式和清空规则见 lib/theme-config.ts，外文标题、说明在 i18n 里）；清空 rows 就整块不显示。图标名是 Iconify 的“图标集:名字”，
// 只认 iconify-icon.tsx 里装了的几套，填了没装的图标时显示名字首字。
// skill-icons 的深色方块（xxx-dark）在浅色主题里是一排黑砖；图标集里有浅色版（xxx-light）时两份都放，按主题只显示一份（home-hero.css）
function StackIcon({ item }: { item: Tech }) {
  if (!isIconName(item.icon)) return <span className="stack-letter" aria-hidden="true">{item.name.slice(0, 1)}</span>;
  const light = item.icon.replace(/-dark$/, "-light");
  if (light === item.icon || !isIconName(light)) return <IconifyIcon icon={item.icon} size={52} />;
  return (
    <>
      <IconifyIcon icon={item.icon} size={52} className="stack-icon-dark" />
      <IconifyIcon icon={light} size={52} className="stack-icon-light" />
    </>
  );
}

function Track({ items, reverse, index }: { items: Tech[]; reverse?: boolean; index: number }) {
  return (
    <Reveal className="stack-marquee" index={index + 1}>
      <ul className="stack-track" data-reverse={reverse ? "" : undefined}>
        {/* 图标比文字窄，重复 4 份才够两个屏幕宽；滚动一半（2 份）正好无缝衔接。只有第一份给读屏读 */}
        {[...items, ...items, ...items, ...items].map((item, index) => (
          <li key={`${item.name}-${index}`} title={item.name} aria-label={index < items.length ? item.name : undefined} aria-hidden={index >= items.length || undefined}>
            <StackIcon item={item} />
            <span className="stack-name">{item.name}</span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

export default async function TechStack() {
  const { techStack } = await getLocale().then(getSiteContent);
  if (techStack.rows.length === 0) return null;
  return (
    <section className="home-section home-stack" aria-labelledby={techStack.title ? "home-stack-heading" : undefined}>
      {(techStack.title || techStack.description) && (
        <Reveal className="home-section-heading">
          {techStack.title && <h2 id="home-stack-heading" lang={techStack.title.lang}>{techStack.title.text}</h2>}
          {techStack.description && <p lang={techStack.description.lang}>{techStack.description.text}</p>}
        </Reveal>
      )}
      {techStack.rows.map((items, index) => <Track key={index} items={items} reverse={index % 2 === 1} index={index} />)}
    </section>
  );
}
