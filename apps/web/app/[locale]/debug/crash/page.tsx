import { notFound } from "next/navigation";

// 仅开发环境：渲染时必然抛错，用来查看站内错误页 app/[locale]/error.tsx（e2e scripts/e2e/error-page.mjs）。生产环境 404。
export default function DebugCrashPage(): never {
  if (process.env.NODE_ENV === "production") notFound();
  throw new Error("调试：/debug/crash 故意抛出的渲染错误");
}
