import { NoteEntry } from "@/components/note-list";
import { PostCard } from "@/components/post-list";
import { ProjectCard } from "@/components/project-list";
import ThemeToggle from "@/components/theme-switcher";
import "@/components/corners.css";
import "@/components/details-sidebar.css";
import "./style-guide.css";

// 设计系统“熄灯以后”的活样式指南：变量与组件直接取自真实样式，改了 globals.css 这里就跟着变。
const colors = [
  ["--background", "背景"],
  ["--surface", "浮起的容器"],
  ["--muted", "淡底分区"],
  ["--accent", "悬停"],
  ["--foreground", "文字"],
  ["--muted-foreground", "次要文字"],
  ["--primary", "强调色"],
  ["--primary-soft", "强调色淡底"],
  ["--danger", "错误"],
  ["--success", "成功"],
];
const sizes = [["--text-2xl", "32"], ["--text-xl", "24"], ["--text-lg", "20"], ["--text-base", "16"], ["--text-sm", "14"], ["--text-xs", "12"]];
const spaces = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-6", "--space-8", "--space-12", "--space-16"];
const radii = [["--radius-sm", "6px 按钮、输入框"], ["--radius-md", "12px 卡片、弹层"], ["--radius-full", "胶囊、头像"]];
const created = "2026-10-27T13:00:00.000Z";

export default function StyleGuide() {
  return (
    <>
      <h2>设计系统：熄灯以后</h2>
      <p className="post-meta">变量都在 globals.css 开头。切换浅色 / 深色主题看两套颜色：</p>
      <ThemeToggle />

      <h3 className="guide-heading">颜色</h3>
      <ul className="guide-swatches">
        {colors.map(([name, label]) => (
          <li key={name}>
            <span className="guide-swatch" style={{ background: `var(${name})` }} />
            <span>{label}</span>
            <code>{name}</code>
          </li>
        ))}
      </ul>

      <h3 className="guide-heading">字号与字体</h3>
      <ul className="guide-type">
        {sizes.map(([name, px]) => (
          <li key={name} style={{ fontSize: `var(${name})` }}>夜深里也有月亮 <code>{name} · {px}px</code></li>
        ))}
        <li className="guide-serif">衬线只用于手记：夜深里也有月亮和星星陪我作伴</li>
      </ul>

      <h3 className="guide-heading">间距与圆角</h3>
      <ul className="guide-spaces">
        {spaces.map((name) => (
          <li key={name}><span style={{ width: `var(${name})` }} /><code>{name}</code></li>
        ))}
      </ul>
      <ul className="guide-radii">
        {radii.map(([name, label]) => (
          <li key={name} style={{ borderRadius: `var(${name})` }}>{label}</li>
        ))}
      </ul>

      <h3 className="guide-heading">按钮、输入框、开关</h3>
      <div className="guide-row">
        <button className="btn btn-primary" type="button">主要操作</button>
        <button className="btn" type="button">普通按钮</button>
        <button className="btn btn-ghost" type="button">次要</button>
        <button className="btn btn-sm" type="button">小按钮</button>
        <button className="btn btn-primary" type="button" disabled>禁用</button>
      </div>
      <div className="guide-row">
        <input className="field" placeholder="输入框（聚焦看描边）" aria-label="示例输入框" />
      </div>
      <div className="guide-row">
        <button className="toggle-chip" type="button" aria-pressed="false">点赞 3</button>
        <button className="toggle-chip" type="button" aria-pressed="true">已赞 4</button>
        <span className="badge">置顶</span>
        <a className="tag-chip" href="#tags">标签<span className="tag-count">5</span></a>
        <a className="tag-chip" href="#tags" aria-current="page">选中的标签<span className="tag-count">2</span></a>
      </div>

      <h3 className="guide-heading">四个角落的卡片</h3>
      <PostCard post={{ id: "a", href: "#post", title: "置顶文章：北极星卡片（带星光的卡片，左栏是会呼吸的北极星）", summary: "整张卡片可点，悬停有淡底，标题变成强调色；分类链接还能单独点。", excerpt: { text: "AI 摘要优先显示（前面一枚小星标记），没有就用自己写的摘要，再没有就截正文开头。", source: "ai" }, stats: { minutes: 5, reads: 21, likes: 2 }, tags: ["学习心得", "React"], created, pinned: true, category: { name: "学习与感悟", slug: "study" } }} headingLevel={3} />
      <PostCard post={{ id: "b", href: "#post", title: "普通文章：没有置顶时的样子", summary: "左栏是大号的日和小字年月。", stats: { minutes: 3, reads: 5, likes: 0 }, created, category: { name: "技术", slug: "tech" } }} headingLevel={3} />
      <NoteEntry note={{ id: "n", nid: 1, title: "标记过的手记（后台“回忆项”）：月光色的北极星卡片", created, mood: "平静", weather: "晴", topic: "近况", bookmark: true, excerpt: { text: "停下来的时候，去阳台看看外面的星星，月亮也在。", source: "text" }, stats: { minutes: 2, reads: 8, likes: 0 }, original: false }} headingLevel={3} />
      <NoteEntry note={{ id: "m", nid: 2, title: "手记：熄灯以后的阳台", created, mood: "平静", weather: "晴", topic: "近况", bookmark: false, excerpt: { text: "没有标记的手记，按时间排在原处。", source: "text" }, stats: { minutes: 2, reads: 8, likes: 0 }, original: false }} headingLevel={3} />
      <ul className="project-grid guide-gap">
        <li><ProjectCard project={{ id: "p", name: "作品卡片", description: "没有图标时用名字的首字。", avatar: undefined, projectUrl: "https://example.com", previewUrl: undefined, docUrl: undefined, original: false }} headingLevel={3} /></li>
      </ul>
      <div className="thinking-card guide-gap"><p>思考卡片：完整显示的一小段话。</p><p className="post-meta thinking-meta"><time dateTime={created}>2026/10/27</time></p></div>
    </>
  );
}
