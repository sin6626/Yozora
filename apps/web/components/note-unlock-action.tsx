"use server";

import { getLiveApiClient } from "../lib/api";
import ArticleBody from "./article-body";

function httpStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
}

// 加密手记：访客在页面里输入密码，服务端带密码向 Core 读取并直接渲染正文返回。
// 结果按访客的密码各不相同，不能进 "use cache"；用现取客户端转发读者 IP，试密码按读者限流；密码只在本次请求里使用，不落日志、不写进地址栏。
// 失败只返回原因，文案由页面按当前语言显示；emptyText 也由页面传入。
export async function unlockNote(nid: number, password: string, emptyText: string) {
  if (!Number.isSafeInteger(nid) || nid < 1 || !password || password.length > 100) {
    return { ok: false as const, reason: "needPassword" as const };
  }
  try {
    const note = await (await getLiveApiClient()).note.getNoteById(nid, password, true);
    return {
      ok: true as const,
      body: <ArticleBody text={note.text} contentFormat={note.contentFormat} content={note.contentFormat === "lexical" ? note.content : undefined} emptyText={emptyText.slice(0, 100)} variant="note" />,
    };
  } catch (error) {
    // Core 对密码错误和未提供密码都返回 403。
    if (httpStatus(error) === 403) return { ok: false as const, reason: "wrongPassword" as const };
    return { ok: false as const, reason: "failed" as const };
  }
}
