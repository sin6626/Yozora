import { execFileSync } from "node:child_process";

// 本机连线上 Core 时用的代理：终端里有 HTTPS_PROXY 就用它，否则读 macOS 系统代理（Clash 通常只开“系统代理”），都没有返回 null。
// 直连洛杉矶的服务器经常被重置，所以本机脚本连线上都尽量走代理。
export function systemProxy() {
  const fromEnv = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (fromEnv) return new URL(fromEnv);
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync("scutil", ["--proxy"], { encoding: "utf8" });
    const host = out.match(/HTTPSProxy : (\S+)/)?.[1];
    const port = out.match(/HTTPSPort : (\d+)/)?.[1];
    return /HTTPSEnable : 1/.test(out) && host && port ? new URL(`http://${host}:${port}`) : null;
  } catch {
    return null;
  }
}
