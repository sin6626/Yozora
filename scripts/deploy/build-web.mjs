// 在本机构建要部署到服务器的前台，打成一个 tar.gz（Next standalone + 静态文件 + public）：
//   node scripts/deploy/build-web.mjs <已装好依赖的代码目录> <输出 .tgz>
// 构建时会预渲染页面，要从线上 Core 取数据。本机直连洛杉矶的服务器，并发一多就有一半 TLS 连接被重置，走 Clash 也会断，
// 线路慢（约 150KB/s，Core 的响应没有压缩），前台每个请求只等 8 秒，所以构建经常失败。这里开一条 SSH 隧道到服务器本机的 443，再在本机起一个小 HTTP 代理：
// 发往 Core 域名的连接塞进隧道（TLS 仍是端到端，证书和地址都不变），其他连接（下载 Google 字体）照旧走系统代理或直连。
// 隧道只解决断连，带宽仍慢，所以构建时把每个请求的超时放宽到 90 秒（MIX_SPACE_TIMEOUT_MS，只在构建时生效）。
// 构建流量在服务器上来自 127.0.0.1，和旧 Shiro 不是同一个 IP，不会让 Shiro 被 Core 限流（每 IP 每 10 秒 100 个请求）。
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { systemProxy } from "../lib/system-proxy.mjs";

const [checkout, output] = process.argv.slice(2).map((path) => path && resolve(path));
if (!checkout || !output) {
  console.error("用法：node scripts/deploy/build-web.mjs <代码目录> <输出 .tgz>");
  process.exit(1);
}
const apiUrl = process.env.DEPLOY_API_URL || "https://api.sin6626.me/api/v2";
const sshTarget = process.env.DEPLOY_SSH || "root@38.95.74.213";
const sshKey = process.env.DEPLOY_SSH_KEY || join(homedir(), ".ssh/id_ed25519_windows");
const apiHost = `${new URL(apiUrl).hostname}:443`;

const freePort = () =>
  new Promise((done) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });

const waitForPort = async (port) => {
  for (let i = 0; i < 60; i++) {
    const open = await new Promise((done) => {
      const socket = net.connect(port, "127.0.0.1", () => socket.end(done(true))).on("error", () => done(false));
    });
    if (open) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`SSH 隧道 ${port} 没有打开`);
};

const run = (command, args, options) =>
  new Promise((done, fail) => {
    spawn(command, args, { stdio: "inherit", ...options }).on("exit", (code) => (code === 0 ? done() : fail(new Error(`${command} ${args.join(" ")} 退出码 ${code}`))));
  });

const tunnelPort = await freePort();
const tunnel = spawn("ssh", ["-N", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=15", "-i", sshKey, "-L", `127.0.0.1:${tunnelPort}:127.0.0.1:443`, sshTarget], { stdio: "inherit" });

const upstream = systemProxy();
// 只认 CONNECT（HTTPS）：Core 域名进隧道，其他的转给上游代理（原样重放 CONNECT），没有上游就直连
const proxy = net.createServer((client) => {
  client.once("data", (head) => {
    const [method, target] = head.toString("latin1").split("\r\n")[0].split(" ");
    if (method !== "CONNECT") return client.end("HTTP/1.1 405 Method Not Allowed\r\n\r\n");
    const [host, port] = target.split(":");
    const viaTunnel = target === apiHost;
    const remote = viaTunnel ? net.connect(tunnelPort, "127.0.0.1") : upstream ? net.connect(Number(upstream.port), upstream.hostname) : net.connect(Number(port), host);
    remote.on("connect", () => {
      if (!viaTunnel && upstream) remote.write(head);
      else client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      remote.pipe(client);
      client.pipe(remote);
    });
    remote.on("error", () => client.destroy());
    client.on("error", () => remote.destroy());
  });
});
const proxyPort = await freePort();
proxy.listen(proxyPort, "127.0.0.1");

try {
  await waitForPort(tunnelPort);
  const proxyUrl = `http://127.0.0.1:${proxyPort}`;
  // NEXT_DEPLOYMENT_ID：Next 自带的版本偏差保护。<html data-dpl-id> 记着页面是哪一版，换页时服务端已经是新版本就整页重新加载，
  // 不会拿旧页面的脚本去调新版本的服务端函数；所以前台不另做“网站已更新，请刷新”的提示（Shiro 有）。
  const deploymentId = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: checkout }).toString().trim();
  const env = { ...process.env, NEXT_DEPLOYMENT_ID: deploymentId, MIX_SPACE_API_URL: apiUrl, MIX_SPACE_TIMEOUT_MS: "90000", SITE_NOINDEX: "1", NEXT_TELEMETRY_DISABLED: "1", NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, NO_PROXY: "localhost,127.0.0.1,::1" };
  const web = join(checkout, "apps/web");
  await run("pnpm", ["build:sdk"], { cwd: checkout });
  await run("pnpm", ["exec", "next", "build"], { cwd: web, env });

  // standalone 里是 apps/web/server.js 和追踪到的 node_modules；静态文件和 public 要自己拷进去
  const standalone = join(web, ".next/standalone");
  if (!existsSync(join(standalone, "apps/web/server.js"))) throw new Error("没有找到 .next/standalone/apps/web/server.js");
  cpSync(join(web, ".next/static"), join(standalone, "apps/web/.next/static"), { recursive: true });
  cpSync(join(web, "public"), join(standalone, "apps/web/public"), { recursive: true });
  mkdirSync(dirname(output), { recursive: true });
  rmSync(output, { force: true });
  execFileSync("tar", ["--no-mac-metadata", "--no-xattrs", "-czf", output, "-C", standalone, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  console.log(`打包完成：${output}`);
} finally {
  proxy.close();
  tunnel.kill();
}
