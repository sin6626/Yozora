import { LinkState, LinkType } from "@mx-space/api-client";
import { unstable_rethrow } from "next/navigation";
import { getLinkApplyOpen, getLinks, getOwner, getSiteDescription, getSiteSettings } from "../lib/blog-data";
import { getApiUrl } from "../lib/config";
import CodeCopy from "./code-copy";
import FriendCard from "./friend-card";
import LinkApplyForm from "./link-apply-form";
import "./corners.css";
import { getLocale, getT } from "../lib/i18n/server";
import LoadError from "./load-error";
import type { CSSProperties } from "react";

type Link = Awaited<ReturnType<typeof getLinks>>[number];

// 分组沿用 Shiro：隐藏的不显示；已通过的按类型分“朋友”“收藏”；失联的只列名字（不可访问，不给链接）；
// 被封禁的不展示。页面底部是友链申请（后台开放申请时才有表单）。
// 每个朋友一张小卡片（friend-card.tsx），整张可点（新窗口打开）。调试页用示例数据复用。
export function LinkCards({ links }: { links: Pick<Link, "id" | "name" | "url" | "avatar" | "description">[] }) {
  return (
    <ul className="friend-grid">
      {links.map((link, index) => (
        <li key={link.id} style={{ "--i": index } as CSSProperties}>
          <FriendCard name={link.name} url={link.url} avatar={link.avatar} description={link.description} />
        </li>
      ))}
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

// 申请区是“交换名片”：左边是本站的名片和可以复制的信息（方便对方先把本站加进友链），右边是对方的名片，边填边预览。
// 开关读取失败时按“未开放”处理，不影响上面的友链列表。
async function LinkApply() {
  const [open, site, owner, { friends: t }, motto] = await Promise.all([
    getLinkApplyOpen().catch(() => false),
    getSiteSettings().catch(() => null),
    getOwner().catch(() => null),
    getT(),
    getLocale().then(getSiteDescription),
  ]);
  const mottoLang = motto.original ? "zh-CN" : undefined;
  const rows: [label: string, value: string, lang?: string][] = site
    ? [[t.siteName, site.name], [t.siteUrl, site.siteUrl], ...(owner?.avatar ? [[t.avatarUrl, owner.avatar] as [string, string]] : []), [t.intro, motto.text, mottoLang]]
    : [];
  return (
    <section className="friend-section link-apply" aria-labelledby="link-apply-heading">
      <h2 id="link-apply-heading">{t.apply}</h2>
      <p className="link-apply-lead">{t.applyLead}</p>
      <div className="link-apply-exchange">
        {site && (
          <div className="link-apply-side link-apply-mine">
            <p className="link-apply-label">{t.myCard}</p>
            <FriendCard name={site.name} url={site.siteUrl} avatar={owner?.avatar} description={motto.text} descriptionLang={mottoLang} />
            <dl className="link-apply-info">
              {rows.map(([label, value, lang]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <span lang={lang} title={value}>{value}</span>
                    <CodeCopy code={value} label={t.copyOf(label)} className="btn btn-ghost btn-sm link-apply-copy" />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {open ? <LinkApplyForm apiUrl={getApiUrl()} /> : <p className="link-apply-closed">{t.closed}</p>}
      </div>
    </section>
  );
}
