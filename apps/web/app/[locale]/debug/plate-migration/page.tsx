import { Suspense } from "react";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { validateDocument } from "@suzuri/editor/schema";
import ArticleBody from "@/components/article-body";
import { coreFetch } from "@/lib/api";
import { sample } from "./sample";
import "./plate-migration.css";

// 迁移预演：左边用 Haklex 渲染库里的 Lexical 正文，右边用 Suzuri 渲染离线转换器（scripts/lib/lexical-to-plate.mjs）
// 当场转出的 Plate 信封，下面是转换报告。只读 Core 的公开接口，不写库。开发环境才有，生产 notFound。
// ?type=post|note|page&id=<id> 看一篇；不带 id 列出所有文章、手记、页面。

type Kind = "post" | "note" | "page";
type Report = {
  status: "converted" | "blocked";
  before: Record<string, number>;
  after: Record<string, number>;
  unsupported: { type: string; path: string; reason: string }[];
  warnings: string[];
  error?: string;
};
type Doc = { id: string; title: string; text?: string; content_format?: string; content?: string; slug?: string; nid?: number };
const kinds: Kind[] = ["post", "note", "page"];

// 转换器是仓库根目录的 Node 脚本（自己引 Core 那份 @suzuri/editor），不进打包，运行时由 Node 直接加载
async function convert(content: string): Promise<{ envelope: unknown; report: Report }> {
  const url = pathToFileURL(join(process.cwd(), "../../scripts/lib/lexical-to-plate.mjs")).href;
  const { lexicalToPlate } = await import(/* turbopackIgnore: true */ url);
  return lexicalToPlate(content);
}

async function json<T>(path: string): Promise<T> {
  const response = await coreFetch(path);
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return response.json();
}

async function list(kind: Kind) {
  return (await json<{ data: Doc[] }>(`/${kind}s?size=50`)).data;
}

// 页面按 id 读要登录，所以先在列表里按 id 找到 slug
async function load(kind: Kind, id: string): Promise<Doc> {
  if (kind !== "page") return json<Doc>(`/${kind}s/${encodeURIComponent(id)}`);
  const slug = (await list("page")).find((page) => page.id === id)?.slug;
  if (!slug) notFound();
  return json<Doc>(`/pages/slug/${encodeURIComponent(slug)}`);
}

const href = (kind: Kind, id: string) => `?type=${kind}&id=${id}`;

async function Index() {
  const rows = await Promise.all(kinds.map(async (kind) => {
    const docs = await list(kind);
    return Promise.all(docs.map(async (summary) => {
      if (summary.content_format !== "lexical") return { kind, summary, status: summary.content_format ?? "markdown" };
      const doc = await load(kind, summary.id);
      return { kind, summary, status: doc.content ? (await convert(doc.content)).report.status : "empty" };
    }));
  }));
  return (
    <table className="plate-migration-index">
      <thead><tr><th>类型</th><th>标题</th><th>格式 / 转换</th></tr></thead>
      <tbody>
        {rows.flat().map(({ kind, summary, status }) => (
          <tr key={summary.id} data-status={status}>
            <td>{kind}</td>
            <td><a href={href(kind, summary.id)}>{summary.title}</a></td>
            <td>{status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportView({ report, valid }: { report: Report; valid: string | null }) {
  return (
    <section className="plate-migration-report" data-status={report.status}>
      <h2>转换报告：{report.status}{valid && `（Suzuri 校验失败：${valid}）`}</h2>
      {report.error && <p className="plate-migration-error">{report.error}</p>}
      {report.unsupported.length > 0 && (
        <ul className="plate-migration-blocked">
          {report.unsupported.map((entry) => <li key={entry.path + entry.reason}><code>{entry.path}</code> {entry.type} · {entry.reason}</li>)}
        </ul>
      )}
      {report.warnings.length > 0 && (
        <details>
          <summary>警告 {report.warnings.length} 条</summary>
          <ul>{[...new Set(report.warnings)].map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}
      <p>节点：<code>{JSON.stringify(report.before)}</code> → <code>{JSON.stringify(report.after)}</code></p>
    </section>
  );
}

async function Compare({ kind, doc }: { kind: Kind; doc: Omit<Doc, "id"> }) {
  const variant = kind === "note" ? "note" : "article";
  const empty = "（没有正文）";
  if (doc.content_format !== "lexical" || !doc.content) {
    return (
      <>
        <h1>{doc.title}</h1>
        <p className="plate-migration-note">库里存的已是 {doc.content_format ?? "markdown"}，没有 Lexical 可对比。</p>
        <ArticleBody text={doc.text} contentFormat={doc.content_format} content={doc.content} emptyText={empty} variant={variant} />
      </>
    );
  }
  const { envelope, report } = await convert(doc.content);
  const plate = envelope ? JSON.stringify(envelope) : null;
  const checked = plate ? validateDocument(plate, { requireEnvelope: true, fingerprintPolicy: "restamp" }) : null;
  return (
    <>
      <h1>{doc.title}</h1>
      <ReportView report={report} valid={checked && !checked.ok ? checked.error : null} />
      <div className="plate-migration-columns">
        <section data-side="lexical">
          <h2 className="plate-migration-side">Lexical（Haklex）</h2>
          <ArticleBody text={doc.text} contentFormat="lexical" content={doc.content} emptyText={empty} variant={variant} />
        </section>
        <section data-side="plate">
          <h2 className="plate-migration-side">Plate（Suzuri）</h2>
          {plate
            ? <ArticleBody text={doc.text} contentFormat="plate" content={plate} emptyText={empty} variant={variant} />
            : <p className="plate-migration-note">转换被阻挡，保留 Lexical。</p>}
        </section>
      </div>
    </>
  );
}

async function Preview({ searchParams }: { searchParams: Promise<{ type?: string; id?: string; sample?: string }> }) {
  await connection();
  const { type, id, sample: showSample } = await searchParams;
  if (showSample === "1") return <><p><a href="?">← 全部</a></p><Compare kind="post" doc={sample} /></>;
  if (!id) return <><h1>Lexical → Plate 迁移预演</h1><p><a href="?sample=1">查看迁移示例：给实况照片保留一张封面</a></p><Index /></>;
  if (!kinds.includes(type as Kind)) notFound();
  return <><p><a href="?">← 全部</a></p><Compare kind={type as Kind} doc={await load(type as Kind, id)} /></>;
}

export default function PlateMigrationPreview({ searchParams }: { searchParams: Promise<{ type?: string; id?: string; sample?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="plate-migration">
      <Suspense fallback={<p>读取中…</p>}>
        <Preview searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
