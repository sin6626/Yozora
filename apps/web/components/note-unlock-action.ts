"use server";

import { cookies } from "next/headers";
import { getLiveApiClient } from "../lib/api";
import { noteUnlockCookie } from "../lib/blog-data";

function httpStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
}

// 加密手记：访客输入密码后，服务端先带密码问 Core 对不对（现取客户端转发读者 IP，试密码按读者限流），
// 对了就把密码存进这篇的会话 Cookie。Next 在服务端函数改了 Cookie 后会重新渲染当前页面，页面带着 Cookie 读到全文、整页换成正常的手记。
// 密码不进地址栏、不落日志（next.config 关了服务端函数日志）；失败只返回原因，文案由页面按当前语言显示。
export async function unlockNote(nid: number, password: string) {
  if (!Number.isSafeInteger(nid) || nid < 1 || !password || password.length > 100) {
    return { ok: false as const, reason: "needPassword" as const };
  }
  try {
    await (await getLiveApiClient()).note.getNoteByNid(nid, { password, single: true });
  } catch (error) {
    // Core 对密码错误和未提供密码都返回 403。
    if (httpStatus(error) === 403) return { ok: false as const, reason: "wrongPassword" as const };
    return { ok: false as const, reason: "failed" as const };
  }
  (await cookies()).set(noteUnlockCookie(nid), password, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return { ok: true as const };
}
