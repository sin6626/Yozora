#!/usr/bin/env bash
# 只读：看看服务器上 Mix Space Core、旧 Shiro、MongoDB、Redis、反向代理现在是怎么跑的，好定灰度的部署方案（docs/deploy-beta.md）。
# 不改任何东西；不打印密码、密钥和环境变量的值（pm2、docker 只取名字、镜像、状态、端口、目录）。
# 用法（在你自己的终端里）：ssh root@你的服务器 'bash -s' < scripts/deploy/server-inspect.sh > server-inspect.txt
# 把 server-inspect.txt 发给 Agent 之前先扫一眼，确认里面没有密码。
set -u
section() { printf '\n===== %s =====\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1; }

section "系统"
uname -sr
grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release 2>/dev/null
echo "CPU 核数: $(nproc 2>/dev/null)"
free -h 2>/dev/null | head -2
df -h / 2>/dev/null | tail -1

section "Node / pnpm / pm2"
has node && echo "node $(node -v)" || echo "没有 node"
has pnpm && echo "pnpm $(pnpm -v)" || echo "没有 pnpm"
if has pm2; then
  # 只取名字、状态、目录、入口文件，不取环境变量
  pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      try { for (const p of JSON.parse(s)) console.log([p.name, p.pm2_env?.status, p.pm2_env?.pm_cwd, p.pm2_env?.pm_exec_path].join("  |  ")); }
      catch { console.log("pm2 列表读不出来"); }
    });' 2>/dev/null || pm2 ls
else
  echo "没有 pm2"
fi

section "Docker 容器"
if has docker; then
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  echo
  docker compose ls 2>/dev/null
  echo
  echo "--- 和博客有关的容器挂载的目录（不含环境变量）---"
  for c in $(docker ps -a --format '{{.Names}}' | grep -iE 'mx|core|space|shiro|mongo|redis|blog|yozora|admin'); do
    docker inspect --format '{{.Name}}  {{.Config.Image}}  {{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}' "$c"
  done
else
  echo "没有 docker"
fi

section "1Panel"
systemctl is-active 1panel 2>/dev/null || echo "没有 1panel 服务"
ls /opt/1panel/apps 2>/dev/null
ls /opt/1panel/www/sites 2>/dev/null

section "反向代理（Nginx / OpenResty）里的域名、监听端口、转发地址"
has nginx && nginx -v 2>&1
grep -RhoE '^\s*(server_name|listen|proxy_pass|root)\s[^;]+;' \
  /etc/nginx /www/server/panel/vhost/nginx /opt/1panel/apps/openresty /opt/1panel/www/sites 2>/dev/null \
  | sed 's/^\s*//' | sort | uniq -c | sort -rn | head -80

section "正在监听的端口"
(ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | awk 'NR > 1 {print $4, $NF}' | sort -u | head -60

section "Mix Space Core 版本（能读到 package.json 的话）"
for dir in $(find / -maxdepth 4 -type d \( -name 'mx-server' -o -name 'mx-space' -o -name 'core' \) 2>/dev/null | head -20); do
  [ -f "$dir/package.json" ] && grep -E '"(name|version)":' "$dir/package.json" | head -2 | sed "s|^|$dir: |"
done
echo
echo "完成。"
