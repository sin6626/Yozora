import { ArrowUpRight, BookOpen, Globe } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getProjects } from "../lib/blog-data";
import { formatDate } from "../lib/date";
import { safeUrl } from "../lib/safe-url";
import { getLocale, getT } from "../lib/i18n/server";
import "./corners.css";
import { SocialIcon } from "./iconify-icon";
import LoadError from "./load-error";
import type { CSSProperties } from "react";

type Project = Awaited<ReturnType<typeof getProjects>>[number];

// 代码托管站的地址显示成“所有者/仓库”配上站点图标；别的地址显示通用的“项目地址”
const forges = [["github.com", "simple-icons:github"], ["gitee.com", "simple-icons:gitee"]] as const;
function repoOf(url: string) {
  try {
    const { hostname, pathname } = new URL(url);
    const forge = forges.find(([host]) => hostname === host || hostname === `www.${host}`);
    const [owner, repo] = pathname.split("/").filter(Boolean);
    return forge && owner && repo ? { icon: forge[1], name: `${owner}/${repo.replace(/\.git$/, "")}` } : null;
  } catch {
    return null;
  }
}

// 作品的角落：像挂在墙上的卡片。左上图标（没有图标时用名字首字）、右上做的年月，名字、一句话描述，最下面一排链接；
// 整张卡可点，去主链接（仓库，没有就预览、文档）。首页预览、调试页复用。
export async function ProjectCard({ project, headingLevel = 2 }: { project: Project; headingLevel?: 2 | 3 }) {
  const t = (await getT()).projects;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const avatar = safeUrl(project.avatar);
  const repo = safeUrl(project.projectUrl);
  const forge = repo ? repoOf(repo) : null;
  const links = [
    { key: "repo", href: repo, label: forge?.name ?? t.repo, icon: forge ? <SocialIcon icon={forge.icon} label="" size={14} /> : null },
    { key: "preview", href: safeUrl(project.previewUrl), label: t.preview, icon: <Globe size={14} aria-hidden="true" /> },
    { key: "docs", href: safeUrl(project.docUrl), label: t.docs, icon: <BookOpen size={14} aria-hidden="true" /> },
  ].filter((link) => link.href);
  const main = links[0]?.href;
  const [year, month] = formatDate(project.created).split("/");
  return (
    <article className="project-card">
      <div className="project-card-top">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- 后台上传的任意域名图片，不走 next/image 白名单
          <img className="project-card-icon" src={avatar} alt="" width={48} height={48} />
        ) : <span className="project-card-icon is-letter" aria-hidden="true">{Array.from(project.name.trim())[0] ?? "✦"}</span>}
        <time className="project-card-date" dateTime={project.created}>{year}.{month}</time>
      </div>
      {/* 外文页面上没有译文的作品，名字和介绍标明是中文 */}
      <Heading lang={project.nameLang}>
        {main ? <a className="card-link" href={main} target="_blank" rel="noopener noreferrer">{project.name}</a> : project.name}
      </Heading>
      {project.description && <p className="project-card-description" lang={project.descriptionLang}>{project.description}</p>}
      {links.length > 0 && (
        <div className="project-card-links">
          {links.map((link) => (
            <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer" title={link.label}>
              {link.icon}
              <span className="project-card-link-label">{link.label}</span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

export default async function ProjectList() {
  const { projects: t } = await getT();
  let projects: Awaited<ReturnType<typeof getProjects>>;
  try {
    projects = await getProjects(await getLocale());
  } catch (error) {
    unstable_rethrow(error);
    // 重试用整页加载，确保重新请求；不用客户端路由。
    return <LoadError what={t.title} href={"/projects"} />;
  }

  return (
    <>
      <header className="page-heading">
        <h1>{t.title}</h1>
        <p className="post-meta">{t.count(projects.length)}</p>
      </header>
      <div className="post-list-content">
        {projects.length ? (
          <ul className="project-grid">
            {projects.map((project, index) => <li key={project.id} style={{ "--i": index } as CSSProperties}><ProjectCard project={project} /></li>)}
          </ul>
        ) : <p className="post-empty">{t.empty}</p>}
      </div>
    </>
  );
}
