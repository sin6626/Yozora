import { ArrowUpRight } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getProjects } from "../lib/blog-data";
import { safeUrl } from "../lib/safe-url";
import { getLocale, getT } from "../lib/i18n/server";
import "./corners.css";
import LoadError from "./load-error";
import type { CSSProperties } from "react";

type Project = Awaited<ReturnType<typeof getProjects>>[number];

// 作品的角落：像挂在墙上的卡片，图标（没有图标时用名字首字）、名字、一句话描述和链接。首页预览复用。
export async function ProjectCard({ project, headingLevel = 2 }: { project: Project; headingLevel?: 2 | 3 }) {
  const t = (await getT()).projects;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const avatar = safeUrl(project.avatar);
  const links = [
    { label: t.repo, href: safeUrl(project.projectUrl) },
    { label: t.preview, href: safeUrl(project.previewUrl) },
    { label: t.docs, href: safeUrl(project.docUrl) },
  ].filter((link) => link.href);
  return (
    <article className="project-card">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- 后台上传的任意域名图片，不走 next/image 白名单
        <img className="project-card-icon" src={avatar} alt="" width={48} height={48} />
      ) : <span className="project-card-icon is-letter" aria-hidden="true">{Array.from(project.name.trim())[0] ?? "✦"}</span>}
      {/* 外文页面上没在配置片段里写译文的作品，名字和介绍标明是中文 */}
      <Heading lang={project.nameLang}>{project.name}</Heading>
      {project.description && <p className="project-card-description" lang={project.descriptionLang}>{project.description}</p>}
      {links.length > 0 && (
        <div className="project-card-links">
          {links.map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={14} aria-hidden="true" /></a>
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
