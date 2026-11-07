import { notFound } from "next/navigation";

// 仅开发环境：渲染时抛错，用来查看站内错误页 app/[locale]/error.tsx（e2e scripts/e2e/error-page.mjs）。生产环境 404。
// ?once=<随便一个字符串>：同一个字符串只在第一次渲染时出错，重试后显示正常内容（测“重试”真的会重新渲染）；不带参数时每次都出错。
// ponytail: 记在开发服务器进程内存里，重启 dev 清空，只给调试页用。
const failedOnce = new Set<string>();

export default async function DebugCrashPage({ searchParams }: { searchParams: Promise<{ once?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { once } = await searchParams;
  if (once && failedOnce.has(once)) return <p className="debug-crash-ok">重试后正常显示了。</p>;
  if (once) failedOnce.add(once);
  throw new Error("调试：/debug/crash 故意抛出的渲染错误");
}
