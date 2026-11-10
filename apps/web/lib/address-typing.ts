// 站内跳转时，浏览器地址栏里的路径“删旧打新”（2026-11-10 站长在 Ryugi 试验台里比过“滚轮落定”后选定）：
// 保留新旧路径相同的开头，旧的尾巴一段段删掉，再一段段打出新的，域名不动。地址栏是浏览器自己的界面，没有接口做动画，
// 只能连续 history.replaceState 换整条地址：不跳转、不发请求、不新增历史记录。跳转本身由 Next 先做完，这里只改显示。
// 动画期间地址栏是中间帧，要读“当前页面地址”的地方一律用 realHref()。

// 一帧帧的路径（已解码的字符串，按字符切，不会把汉字切成两半）；最后一帧就是新路径
export function typingFrames(from: string, to: string, max: number): string[] {
  const a = [...from];
  const b = [...to];
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  const total = a.length - common + (b.length - common);
  const step = Math.max(1, Math.ceil(total / max));
  const frames: string[] = [];
  for (let n = a.length - step; n > common; n -= step) frames.push(a.slice(0, n).join(""));
  frames.push(a.slice(0, common).join("") || "/");
  for (let n = common + step; n < b.length; n += step) frames.push(b.slice(0, n).join(""));
  frames.push(to);
  return frames.filter((frame, index) => frame !== frames[index - 1] && !(index === 0 && frame === from));
}

const frameMs = 32;
const maxFrames = 12;
// Safari 30 秒内 replaceState 超过 100 次直接报错；连续快速换页时留出余量，超了这次就不播
const budget = 80;
const calls: number[] = [];

let real: string | null = null; // 动画进行中时，这一页真正的地址
let shown: string | null = null; // 地址栏里现在显示的路径（解码后）
let timer = 0;
let rawReplace: History["replaceState"] | null = null;

export const realHref = () => real ?? location.href;

const decode = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};
const encode = (path: string) => path.split("/").map(encodeURIComponent).join("/");

// 写回真实地址（必须带 history.state，否则 Next 当成一次路由更新）
function finish() {
  clearTimeout(timer);
  if (real === null) return;
  rawReplace?.(history.state, "", real);
  shown = decode(new URL(real).pathname);
  real = null;
}

// 动画中途又有人改历史（站内再跳一次、Next 自己 replace）：先把当前这条历史记录的地址写回真实的，
// 不然这条记录会一直停在中间帧，以后后退回来、刷新就是错的地址
function install() {
  if (rawReplace) return;
  rawReplace = history.replaceState.bind(history);
  const push = history.pushState.bind(history);
  const replace = rawReplace;
  history.pushState = (...args) => {
    finish();
    push(...args);
  };
  history.replaceState = (...args) => {
    finish();
    replace(...args);
  };
}

// 每次路径变了（React 提交时同步调用，Next 已经把新地址写进地址栏）
export function typeAddress() {
  install();
  clearTimeout(timer);
  // 走到这里时 real 还在，说明是前进后退打断了动画（历史已经切过去了），不能再把旧地址写到新的那条记录上；
  // ponytail: 被打断的那条记录停在中间帧，再前进回去时地址不对；要修得用 Navigation API 在切走前写回
  real = null;
  const to = decode(location.pathname);
  const from = shown ?? to;
  shown = to;
  if (from === to || document.hidden) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(pointer: fine)").matches) return;
  const frames = typingFrames(from, to, maxFrames);
  const now = Date.now();
  while (calls.length && now - calls[0] > 30000) calls.shift();
  if (calls.length + frames.length > budget) return;
  real = location.href;
  const target = real;
  let index = 0;
  const step = () => {
    const last = index === frames.length - 1;
    calls.push(Date.now());
    rawReplace?.(history.state, "", last ? target : encode(frames[index]));
    shown = frames[index++];
    if (last) {
      real = null;
      return;
    }
    timer = window.setTimeout(step, frameMs);
  };
  timer = window.setTimeout(step, 0);
}
