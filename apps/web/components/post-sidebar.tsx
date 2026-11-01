import { ChevronDown, Hash } from "lucide-react";
import Link from "./locale-provider";
import { unstable_rethrow } from "next/navigation";
import { getTags } from "../lib/blog-data";
import { getLocale, getT } from "../lib/i18n/server";
import TagFold from "./tag-fold";
import "./details-sidebar.css";

// 宽屏右栏直接摊开的标签数，其余收在“展开全部”里
const popularTags = 12;

// 文章列表的标签，两种样子各渲染一份、CSS 只显示其中一种（details-sidebar.css）：
// 宽屏（≥ 90rem）在右侧筛选栏里摊开最常用的 12 个、其余收在下面、最后一个“展开全部 / 收起”按钮（tag-fold.tsx）；窄屏收在抽屉里，默认收起（选中的标签另有一枚“标签：xx ×”）。
// 不用“宽屏强制展开同一个 <details>”：那样读屏仍会念“已收起”。筛选状态只存在地址栏里。
export default async function PostTagDrawer({ activeTag }: { activeTag?: string }) {
  const [{ posts: t, list: listCopy }, locale] = await Promise.all([getT(), getLocale()]);
  let tags: Awaited<ReturnType<typeof getTags>> | null = null;
  try {
    tags = await getTags();
  } catch (error) {
    unstable_rethrow(error);
  }
  type Tag = NonNullable<typeof tags>[number];
  const renderChips = (list: Tag[]) => (
    // 标签是后台录入的原名（多是中文），外文页面标明语言，读屏才按中文念
    <ul className="tag-list" lang={locale === "zh" ? undefined : "zh-CN"}>
      {list.map((tag) => {
        // 已选中的标签再点一次回到完整列表。
        const active = tag.name === activeTag;
        return (
          <li key={tag.name}>
            <Link
              className="tag-chip"
              href={active ? "/posts" : `/posts?tag=${encodeURIComponent(tag.name)}`}
              aria-current={active ? "page" : undefined}
              title={active ? listCopy.clearFilter : undefined}
            >
              {tag.name.trim()}<span className="tag-count">{tag.count}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
  const message = tags === null ? <p className="details-message" role="alert">{t.tagsFailed}</p> : <p className="details-message">{t.noTags}</p>;
  // 宽屏右栏只摊开最常用的几个（getTags 已按篇数排好），其余收在“展开全部”里，标签越攒越多右栏也不会被拉长；
  // 正在筛的标签不在前面也挪上来，不用展开才看得到。窄屏抽屉本来就收着，里面放全部。
  const shown = tags ? tags.slice(0, popularTags) : [];
  const current = tags?.find((tag) => tag.name === activeTag);
  if (current && !shown.includes(current)) shown.push(current);
  const rest = tags ? tags.filter((tag) => !shown.includes(tag)) : [];
  return (
    <>
      <section className="list-aside-section list-aside-tags" aria-label={t.tags}>
        <h2>{t.tags}{tags?.length ? <span className="tag-count">{tags.length}</span> : null}</h2>
        {!tags?.length ? message : rest.length > 0 ? (
          <TagFold rest={renderChips(rest)} showLabel={t.showAllTags(tags.length)} hideLabel={t.hideTags}>{renderChips(shown)}</TagFold>
        ) : renderChips(shown)}
      </section>
      <details className="tag-drawer">
        <summary><Hash size={14} aria-hidden="true" />{t.byTag}{tags?.length ? <span className="tag-count">{tags.length}</span> : null}<ChevronDown className="tag-drawer-arrow" size={14} aria-hidden="true" /></summary>
        {tags?.length ? renderChips(tags) : message}
      </details>
    </>
  );
}
