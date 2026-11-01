import { getThemeConfig } from "@/lib/blog-data";
import { getLocale, getT } from "../lib/i18n/server";
import { parseTechStack, type Tech } from "@/lib/theme-config";
import IconifyIcon, { isIconName } from "./iconify-icon";
import Reveal from "./reveal";

// 首页底部的技术栈：两行只显示图标的横向无限滚动（单数行向左、双数行向右），鼠标停上去暂停并显示名字；
// “减少动态效果”时不滚动，改成可以手动横向拖动。内容在后台配置片段 theme/sin-space 的 techStack 里改（格式见 lib/theme-config.ts），
// 片段没建、读取失败或格式不对时用下面写死的默认值。图标名是 Iconify 的“图标集:名字”，只认 iconify-icon.tsx 里装了的几套，
// 填了没装的图标时显示名字首字。
const defaultRows: Tech[][] = [
  [
    { name: "Vue", icon: "skill-icons:vuejs-dark" },
    { name: "React", icon: "skill-icons:react-dark" },
    { name: "TypeScript", icon: "skill-icons:typescript" },
    { name: "JavaScript", icon: "skill-icons:javascript" },
    { name: "Next.js", icon: "skill-icons:nextjs-dark" },
    { name: "Nuxt", icon: "skill-icons:nuxtjs-dark" },
    { name: "Tailwind CSS", icon: "skill-icons:tailwindcss-dark" },
    { name: "Sass", icon: "skill-icons:sass" },
    { name: "Vite", icon: "skill-icons:vite-dark" },
    { name: "pnpm", icon: "skill-icons:pnpm-dark" },
  ],
  [
    { name: "Node.js", icon: "skill-icons:nodejs-dark" },
    { name: "NestJS", icon: "skill-icons:nestjs-dark" },
    { name: "Express", icon: "skill-icons:expressjs-dark" },
    { name: "MongoDB", icon: "skill-icons:mongodb" },
    { name: "Redis", icon: "skill-icons:redis-dark" },
    { name: "Git", icon: "skill-icons:git" },
    { name: "GitHub", icon: "skill-icons:github-dark" },
    { name: "Linux", icon: "skill-icons:linux-dark" },
    { name: "C++", icon: "skill-icons:cpp" },
    { name: "VS Code", icon: "skill-icons:vscode-dark" },
  ],
];

function Track({ items, reverse, index }: { items: Tech[]; reverse?: boolean; index: number }) {
  return (
    <Reveal className="stack-marquee" index={index + 1}>
      <ul className="stack-track" data-reverse={reverse ? "" : undefined}>
        {/* 图标比文字窄，重复 4 份才够两个屏幕宽；滚动一半（2 份）正好无缝衔接。只有第一份给读屏读 */}
        {[...items, ...items, ...items, ...items].map((item, index) => (
          <li key={`${item.name}-${index}`} title={item.name} aria-label={index < items.length ? item.name : undefined} aria-hidden={index >= items.length || undefined}>
            {isIconName(item.icon) ? <IconifyIcon icon={item.icon} size={52} /> : <span className="stack-letter" aria-hidden="true">{item.name.slice(0, 1)}</span>}
            <span className="stack-name">{item.name}</span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

async function readTechStack() {
  try {
    return parseTechStack(await getThemeConfig());
  } catch {
    return null;
  }
}

export default async function TechStack() {
  const [config, locale, t] = await Promise.all([readTechStack(), getLocale(), getT()]);
  // 后台片段里的标题、说明是中文，英文、日文页面用文案字典里的
  const title = locale === "zh" ? config?.title ?? t.home.techTitle : t.home.techTitle;
  const description = locale === "zh" ? config?.description ?? t.home.techNote : t.home.techNote;
  return (
    <section className="home-section home-stack" aria-labelledby="home-stack-heading">
      <Reveal className="home-section-heading">
        <h2 id="home-stack-heading">{title}</h2>
        <p>{description}</p>
      </Reveal>
      {(config?.rows ?? defaultRows).map((items, index) => <Track key={index} items={items} reverse={index % 2 === 1} index={index} />)}
    </section>
  );
}
