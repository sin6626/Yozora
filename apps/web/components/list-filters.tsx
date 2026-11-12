import { X } from "lucide-react";
import Link from "./locale-provider";
import { getT } from "../lib/i18n/server";

// 文章、手记列表共用：当前筛选（标签或搜索）显示成一枚“标签：Vue ×”，点 × 回到完整列表
export async function ActiveFilter({ label, clearHref }: { label: string; clearHref: string }) {
  const { list } = await getT();
  return (
    <p className="active-filter">
      <span>{label}</span>
      <Link href={clearHref} aria-label={list.removeFilter} title={list.removeFilter}><X size={13} aria-hidden="true" /></Link>
    </p>
  );
}

type PageLink = { href: string; text: string; rel?: "prev" | "next" };

// 翻页那一行：三栏（往前 | 第几页 | 往后），没有的那边空着、不放灰色的字，页码永远在正中。文章、手记、碎碎念、思考共用
export async function PageNav({ label, prev, center, next }: { label: string; prev?: PageLink; center?: string; next?: PageLink }) {
  const { list } = await getT();
  return (
    <nav className="post-pagination" aria-label={list.pagination(label)}>
      {prev ? <Link href={prev.href} rel={prev.rel}>{prev.text}</Link> : <span />}
      <span>{center}</span>
      {next ? <Link href={next.href} rel={next.rel}>{next.text}</Link> : <span />}
    </nav>
  );
}

// 按页码翻页：上一页 / 第几页 / 下一页（碎碎念把两边写成“更近的 / 更早的”）；href 由列表按当前筛选拼好（翻页保留标签、关键词）
export async function Pagination({ label, page, totalPage, href, prevText, nextText }: { label: string; page: number; totalPage: number; href: (page: number) => string; prevText?: string; nextText?: string }) {
  if (totalPage <= 1) return null;
  const { list } = await getT();
  return (
    <PageNav
      label={label}
      center={list.page(page, totalPage)}
      prev={page > 1 ? { href: href(page - 1), text: prevText ?? list.prev, rel: "prev" } : undefined}
      next={page < totalPage ? { href: href(page + 1), text: nextText ?? list.next, rel: "next" } : undefined}
    />
  );
}

// 列表地址：筛选参数 + 页码（第 1 页不写）
export function listHref(base: string, filter: Record<string, string>, page: number) {
  const params = new URLSearchParams(filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
