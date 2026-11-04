import { LinkState, LinkType } from "@mx-space/api-client";
import { unstable_rethrow } from "next/navigation";
import { getLinkApplyOpen, getLinks, getSiteDescription, getSiteSettings } from "../lib/blog-data";
import { getApiUrl } from "../lib/config";
import { safeUrl } from "../lib/safe-url";
import LinkApplyForm from "./link-apply-form";
import "./corners.css";
import { getLocale, getT } from "../lib/i18n/server";
import LoadError from "./load-error";
import type { CSSProperties } from "react";

type Link = Awaited<ReturnType<typeof getLinks>>[number];

// 分组沿用 Shiro：隐藏的不显示；已通过的按类型分“朋友”“收藏”；失联的只列名字（不可访问，不给链接）；
// 被封禁的不展示。页面底部是友链申请（后台开放申请时才有表单）。
// 每个朋友一张小卡片：圆形头像、站名、一句话，整张可点（新窗口打开）。调试页用示例数据复用。
export function LinkCards({ links }: { links: Pick<Link, "id" | "name" | "url" | "avatar" | "description">[] }) {
  return (
    <ul className="friend-grid">
      {links.map((link, index) => {
        const url = safeUrl(link.url);
        const avatar = safeUrl(link.avatar);
        return (
          <li key={link.id} style={{ "--i": index } as CSSProperties}>
            <article className="friend-card">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- 友链头像来自任意域名，不走 next/image 白名单
                <img className="friend-avatar" src={avatar} alt="" width={48} height={48} loading="lazy" />
              ) : <span className="friend-avatar is-letter" aria-hidden="true">{Array.from(link.name.trim())[0] ?? "✦"}</span>}
              <div>
                <h3 lang={/\p{Script=Han}/u.test(link.name) ? "zh-CN" : undefined}>{url ? <a className="card-link" href={url} target="_blank" rel="noopener noreferrer">{link.name}</a> : link.name}</h3>
                {/* 朋友们自己填的站名和介绍，原样显示（含中文时标明语言） */}
                {link.description && <p lang="zh-CN">{link.description}</p>}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

export default async function FriendList() {
  const { friends: t } = await getT();
  let links: Link[];
  try {
    links = await getLinks();
  } catch (error) {
    unstable_rethrow(error);
    // 重试用整页加载，确保重新请求
    return <LoadError what={t.title} href={"/friends"} />;
  }
  const visible = links.filter((link) => !link.hide);
  const passed = visible.filter((link) => link.state === LinkState.Pass);
  const friends = passed.filter((link) => link.type === LinkType.Friend);
  const collections = passed.filter((link) => link.type === LinkType.Collection);
  const outdated = visible.filter((link) => link.state === LinkState.Outdate);

  return (
    <>
      <header className="page-heading">
        <h1>{t.title}</h1>
        <p className="post-meta">{t.motto}</p>
      </header>
      <div className="post-list-content">
        {!friends.length && !collections.length && !outdated.length && <p className="post-empty">{t.empty}</p>}
        {friends.length > 0 && (
          <section className="friend-section" aria-labelledby="friends-heading">
            <h2 id="friends-heading">{t.mine}</h2>
            <LinkCards links={friends} />
          </section>
        )}
        {collections.length > 0 && (
          <section className="friend-section" aria-labelledby="collections-heading">
            <h2 id="collections-heading">{t.collections}</h2>
            <LinkCards links={collections} />
          </section>
        )}
        {outdated.length > 0 && (
          <details className="friend-outdated">
            <summary>{t.outdated}</summary>
            <ul>{outdated.map((link) => <li key={link.id}>{link.name}</li>)}</ul>
          </details>
        )}
        <LinkApply />
      </div>
    </>
  );
}

// 申请区：先给出本站信息方便对方回加，再给申请表单。开关读取失败时按“未开放”处理，不影响上面的友链列表。
async function LinkApply() {
  const [open, site, { friends: t }, motto] = await Promise.all([getLinkApplyOpen().catch(() => false), getSiteSettings().catch(() => null), getT(), getLocale().then(getSiteDescription)]);
  return (
    <section className="link-apply" aria-labelledby="link-apply-heading">
      <h2 id="link-apply-heading">{t.apply}</h2>
      {site && (
        <dl className="post-meta">
          <dt>{t.siteName}</dt><dd>{site.name}</dd>
          <dt>{t.siteUrl}</dt><dd>{site.siteUrl}</dd>
          <dt>{t.intro}</dt><dd lang={motto.original ? "zh-CN" : undefined}>{motto.text}</dd>
        </dl>
      )}
      {open ? <LinkApplyForm apiUrl={getApiUrl()} /> : <p className="post-meta">{t.closed}</p>}
    </section>
  );
}
