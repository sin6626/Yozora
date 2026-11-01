"use client";

import { useEffect, useRef } from "react";
import { moonPhase } from "../lib/moon";
import { useResolvedTheme } from "./use-resolved-theme";
import "./starfield.css";

// 全站的夜空（2026-11-01 原型）：一张固定在视口后面的 WebGL 画布，挂在根布局里、在换页过渡之外，换页时不重建。
// 片元着色器里画出天空渐变、淡淡的星云、三层闪烁的星星、偶尔划过的流星，以及按访客当天真实月相照亮的月亮。
// 星星和银河绕北天极缓缓转动（像真的在看夜空）。开灯时整片天空在 0.6 秒内过渡到黄昏。
// 两种状态：首页第一屏在视野里时是完整的夜空（月亮跟着第一屏走，画在首屏里悬停区域 .moon-tip 的位置，位置和大小写在 moon-tip.css）；
// 内页和首页往下滚之后是“安静”的夜空：天色压向页面底色、星星变暗变慢、没有流星和月亮，每秒只画约 15 帧。
// 标签页隐藏时停止绘制；“减少动态效果”时星星不闪不转，只在状态变化时重画；浏览器不支持 WebGL 时画布隐藏，首屏退回 CSS 渐变。
// 按下去（2026-11-01，原创的“星井”）：鼠标或手写笔在页面任何地方按下，那一片夜空就陷下去一口井——星光像被引力弯过去一样往井心收、
// 井心变暗；光从月亮那边（右上）照来，靠月亮那侧的井壁落进阴影、对面井壁亮起一道月光边，所以看得出是“陷下去”；按住不放井就一直在，
// 松开后弹回，同时一圈星光从井口往外荡开。最多同时 4 口井；触屏（滚动时到处都是按下）和输入框里不算；“减少动态效果”时没有。
// 没有显卡加速（软件渲染，例如 Chrome 关了硬件加速）时全屏着色器全靠 CPU 算，安静夜空也要占 3 个核，所以那时安静夜空只画一帧静止的。

const vertexSource = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const fragmentSource = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uLight;   // 0 夜里，1 黄昏
uniform float uPhase;   // 月相：0 新月，0.5 满月
uniform vec3 uMoon;     // 月亮圆心（像素）和半径（像素）
uniform float uSpin;    // 星空绕北天极转过的角度（弧度）
uniform float uQuiet;   // 0 完整夜空（首页第一屏），1 安静夜空（内页）
uniform vec3 uPage;     // 页面底色，安静时天色往它靠
uniform vec4 uPress[4]; // 按下的井：圆心（像素）、深度 0–1、松开后过了几秒（还按着为 -1）
uniform float uWell;    // 井的半径（像素）
// 配色（下面的 palettes，夜紫 / 墨黑 / 银河）：天空渐变、地平线的光、银河、星星的色温与多少、月亮的光晕与暗面
uniform vec3 uNightTop, uNightLow, uDuskTop, uDuskLow, uHorizonNight, uHorizonDusk;
uniform vec3 uNebulaA, uNebulaB;
uniform float uNebula;
uniform vec3 uTintA, uTintB, uTintC;
uniform float uStars, uStarGain, uSpikes;
uniform vec3 uMoonGlow, uMoonDark;
// 银河的形状：倾斜度、宽窄（越大越窄）、核心的亮光（颜色与强度）、横穿银河的暗色尘埃带（0 为没有）
uniform float uBandTilt, uBandWidth, uCore, uDust;
uniform vec3 uCoreColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

// 一层星星：把画面切成格子，每格最多一颗，位置、亮度、颜色、闪烁节奏都由格子编号决定。
// spikes > 0 时，少数落在格子中间的亮星带一道细十字星芒（只给格子中间的星，星芒才不会被格子边界截断）。
vec3 starLayer(vec2 p, float scale, float density, float size, float t, float spikes) {
  vec2 g = p * scale;
  vec2 cell = floor(g);
  vec2 local = fract(g);
  float pick = hash(cell);
  if (pick > density * uStars) return vec3(0.0);
  vec2 pos = 0.15 + 0.7 * hash2(cell + 7.0);
  float d = length(local - pos);
  float twinkle = 0.55 + 0.45 * sin(t * (0.6 + 2.2 * hash(cell + 3.0)) + 6.2831 * hash(cell + 11.0));
  float core = smoothstep(size, 0.0, d);
  float halo = 0.25 * smoothstep(size * 5.0, 0.0, d);
  float tone = hash(cell + 19.0);
  vec3 tint = tone < 0.6 ? uTintA : tone < 0.82 ? uTintB : uTintC;
  vec2 dv = abs(local - pos);
  float centered = step(abs(pos.x - 0.5), 0.15) * step(abs(pos.y - 0.5), 0.15);
  float spike = spikes * centered * step(0.8, hash(cell + 23.0))
    * (smoothstep(0.3, 0.0, dv.x) * smoothstep(size * 0.3, 0.0, dv.y) + smoothstep(0.3, 0.0, dv.y) * smoothstep(size * 0.3, 0.0, dv.x));
  return tint * (core + halo + spike * 0.55) * twinkle * (0.5 + 0.5 * hash(cell + 5.0));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uResolution;
  vec2 p = frag / uResolution.y;   // 以高度为单位，星星在宽屏上不会被拉伸
  float t = uTime;

  // 星井：井是平底、陡壁的碗（深度 exp(-q⁴)），pull 是井壁的坡度（井心和井外为 0，约 0.93 个半径处最陡），星空的取样坐标沿坡往外挪，看起来就是星光被吸向井心；
  // wall 是井壁朝着月光的程度，hollow 是井心有多深，ripple 是松开后往外荡的那圈光
  vec2 pull = vec2(0.0);
  float wall = 0.0, hollow = 0.0, ripple = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 press = uPress[i];
    if (press.z <= 0.001 && press.w < 0.0) continue;
    vec2 d = frag - press.xy;
    float dist = length(d);
    vec2 dir = d / max(dist, 1.0);
    float q = dist / uWell;
    float bowl = exp(-q * q * q * q);
    float slope = q * q * q * bowl * 2.65 * press.z;
    pull += dir * slope;
    wall -= dot(dir, vec2(0.7071)) * slope;
    hollow += bowl * press.z;
    if (press.w >= 0.0) {
      float front = uWell * (0.5 + press.w * 3.2);
      ripple += exp(-pow((dist - front) / (uWell * 0.14), 2.0)) * exp(-press.w * 2.4);
    }
  }
  p += pull * uWell * 0.25 / uResolution.y;

  // 天空：从天顶到地平线的渐变（夜里 / 开灯时的天色），地平线附近再加一层光
  vec3 sky = mix(mix(uNightLow, uNightTop, pow(uv.y, 0.8)), mix(uDuskLow, uDuskTop, pow(uv.y, 0.9)), uLight);
  sky += mix(uHorizonNight, uHorizonDusk, uLight) * pow(1.0 - uv.y, 3.0);

  // 周日运动：星星和银河一起绕画面左上方外面的北天极逆时针转（地球自转），离天极越远走得越快；
  // 天空渐变、地平线的光、流星和月亮不跟着转。下面的星云、星星都在转过的坐标 sp 里取样。
  float aspect = uResolution.x / uResolution.y;
  vec2 pole = vec2(0.3 * aspect, 1.08);
  vec2 sp = pole + mat2(cos(uSpin), -sin(uSpin), sin(uSpin), cos(uSpin)) * (p - pole);
  vec2 suv = sp / vec2(aspect, 1.0);

  // 星云：一条斜着的银河，噪声让它有云絮感
  vec2 q = sp * 1.6;
  float band = exp(-pow((suv.y - 0.45 - (suv.x - 0.5) * uBandTilt) * uBandWidth, 2.0));
  float cloud = fbm(q * 2.0 + fbm(q * 1.3));
  // 尘埃带：另一层噪声里浓的地方把银河的光和星星压暗，银河才有立体感
  float lanes = uDust > 0.0 ? smoothstep(0.48, 0.72, fbm(q * 3.1 + 7.0)) * band * uDust : 0.0;
  vec3 nebula = mix(uNebulaA, uNebulaB, cloud) * band * pow(cloud, 2.4) * uNebula * (1.0 - lanes);
  // 核心：银河正中最亮的那一线光
  nebula += uCoreColor * pow(band, 4.0) * smoothstep(0.3, 0.85, cloud) * uCore * (1.0 - lanes);
  // 银河会随星空转动，转到画面最上面时会压在导航文字后面：亮银河（有尘埃带的配色）在顶部两成渐渐收淡，保证导航看得清
  nebula *= 1.0 - smoothstep(0.78, 0.97, uv.y) * 0.75 * min(uDust, 1.0);
  sky += nebula * (1.0 - uLight * 0.8) * (1.0 - uQuiet * 0.5);
  // 安静时天色大半压向页面底色，正文读起来不费眼
  sky = mix(sky, uPage, uQuiet * 0.7);

  // 三层星星：远处的小而密，近处的大而疏；银河里星星更多。安静时只剩约一半亮度
  float starAmount = (1.0 - uLight * 0.85) * (1.0 - uQuiet * 0.5);
  vec3 stars = starLayer(sp, 140.0, 0.10 + band * 0.22, 0.06, t, 0.0) * 0.8
             + starLayer(sp + 3.1, 70.0, 0.08 + band * 0.12, 0.07, t * 0.8, 0.0)
             + starLayer(sp + 7.7, 26.0, 0.07, 0.06, t * 0.6, uSpikes) * 1.5;
  sky += stars * starAmount * uStarGain * (1.0 - lanes * 0.6) * (1.0 + ripple * 2.0);

  // 星井的明暗：井心压暗，背着月亮的井壁亮起一道月光边、朝着月亮的井壁落进阴影，松开后那圈星光淡淡发亮
  hollow = min(hollow, 1.0);
  sky *= 1.0 - (hollow * 0.3 + max(-wall, 0.0) * 0.6) * mix(1.0, 0.4, uLight);
  sky += mix(uMoonGlow, vec3(1.0), uLight) * (pow(max(wall, 0.0), 1.5) * mix(0.2, 0.3, uLight) + ripple * 0.05);

  // 流星：每 23 秒一颗，划过约 1 秒，起点和方向每次不同
  float period = 23.0;
  float k = floor(t / period);
  float life = fract(t / period) * period;
  if (life < 1.1 && uLight < 0.5 && uQuiet < 0.5) {
    vec2 start = vec2(0.2 + 0.6 * hash(vec2(k, 1.0)), 0.75 + 0.2 * hash(vec2(k, 2.0))) * vec2(uResolution.x / uResolution.y, 1.0);
    vec2 dir = normalize(vec2(-0.85 - 0.3 * hash(vec2(k, 3.0)), -0.45));
    vec2 head = start + dir * life * 0.55;
    vec2 rel = p - head;
    float along = dot(rel, -dir);
    float across = length(rel + dir * along);
    float tail = smoothstep(0.22, 0.0, along) * step(0.0, along);
    float fade = smoothstep(0.0, 0.15, life) * smoothstep(1.1, 0.7, life);
    sky += vec3(0.95, 0.9, 1.0) * tail * smoothstep(0.0025, 0.0, across) * fade * 1.4;
  }

  // 月亮：圆盘按月相分出亮面和暗面，亮面带一点噪声做的月海，周围一圈光晕
  vec2 m = (frag - uMoon.xy) / uMoon.z;
  float r = length(m);
  float lit = (1.0 - cos(6.2831 * uPhase)) * 0.5;
  // 光晕从月面中心一直延伸出去，月亮边缘和光晕之间不会出现一圈暗缝
  float glow = exp(-max(r - 0.9, 0.0) * 2.4) * (0.18 + 0.5 * lit) * (1.0 - smoothstep(0.0, 1.0, max(r - 1.0, 0.0) / 6.0));
  float moonShow = 1.0 - uQuiet;
  sky += mix(uMoonGlow, vec3(1.0, 0.95, 0.9), uLight) * glow * mix(0.55, 0.35, uLight) * moonShow;
  if (r < 1.02 && moonShow > 0.0) {
    float edge = smoothstep(1.0, 1.0 - 2.0 / uMoon.z, r);
    float s = sqrt(max(1.0 - m.y * m.y, 0.0));
    float c = cos(6.2831 * uPhase);
    float side = uPhase < 0.5 ? m.x - c * s : -c * s - m.x;
    float bright = smoothstep(-0.04, 0.04, side);
    float maria = 0.82 + 0.18 * fbm(m * 2.6 + 4.0);
    vec3 moonLit = vec3(1.0, 0.96, 0.88) * maria;
    vec3 moonDark = mix(sky, uMoonDark, 0.6);
    sky = mix(sky, mix(moonDark, moonLit, bright), edge * moonShow);
  }

  // 一点颗粒，避免渐变出现色带
  sky += (hash(frag + fract(t)) - 0.5) / 255.0;
  gl_FragColor = vec4(sky, 1.0);
}
`;

// 三套配色（2026-10-29 起对比用，<html data-palette> 由地址参数决定，见 layout.tsx）：
// night = 原来的夜紫（紫黑天空、粉紫银河、偏粉的星）；ink = 墨黑，人眼看到的真实夜空：中性的黑，地平线附近一点冷灰的大气辉光，
// 银河是很淡的灰白雾，星星几乎纯白（零星极淡的蓝白和暖白），数量、亮度与夜紫相同（用户 10-29：加多加亮显得刻意），少数亮星带细十字星芒，月亮光晕不带颜色。
type Vec3 = [number, number, number];
const palettes: Record<"night" | "ink" | "galaxy", Record<string, Vec3 | number>> = {
  night: {
    uNightTop: [0.016, 0.012, 0.043], uNightLow: [0.082, 0.055, 0.16], uDuskTop: [0.62, 0.55, 0.82], uDuskLow: [1.0, 0.8, 0.78],
    uHorizonNight: [0.12, 0.05, 0.16], uHorizonDusk: [0.18, 0.08, 0.04],
    uNebulaA: [0.36, 0.22, 0.58], uNebulaB: [0.8, 0.46, 0.76], uNebula: 0.4,
    uTintA: [1.0, 0.97, 1.0], uTintB: [0.78, 0.84, 1.0], uTintC: [1.0, 0.82, 0.95],
    uStars: 1, uStarGain: 1, uSpikes: 0,
    uMoonGlow: [0.95, 0.85, 1.0], uMoonDark: [0.14, 0.12, 0.2],
    uBandTilt: 0.55, uBandWidth: 3.2, uCore: 0, uDust: 0, uCoreColor: [0, 0, 0],
  },
  ink: {
    uNightTop: [0.003, 0.003, 0.004], uNightLow: [0.02, 0.022, 0.028], uDuskTop: [0.8, 0.82, 0.86], uDuskLow: [0.94, 0.94, 0.95],
    uHorizonNight: [0.028, 0.03, 0.038], uHorizonDusk: [0.04, 0.04, 0.04],
    uNebulaA: [0.08, 0.08, 0.09], uNebulaB: [0.4, 0.4, 0.43], uNebula: 0.24,
    uTintA: [1.0, 1.0, 1.0], uTintB: [0.88, 0.92, 1.0], uTintC: [1.0, 0.96, 0.88],
    uStars: 1, uStarGain: 1, uSpikes: 1,
    uMoonGlow: [0.9, 0.9, 0.92], uMoonDark: [0.05, 0.05, 0.06],
    uBandTilt: 0.55, uBandWidth: 3.2, uCore: 0, uDust: 0, uCoreColor: [0, 0, 0],
  },
  // 银河（2026-10-30，按朋友给的一张星空图：只取天空，不要图里的行星）：深海军蓝的天到地平线的淡紫雾，
  // 一条从左上斜下来的亮银河（蓝色外缘、粉紫核心、暗色尘埃带），星星密且偏蓝白、少数偏粉
  galaxy: {
    uNightTop: [0.008, 0.02, 0.07], uNightLow: [0.06, 0.07, 0.2], uDuskTop: [0.5, 0.55, 0.85], uDuskLow: [0.92, 0.84, 0.96],
    uHorizonNight: [0.22, 0.12, 0.3], uHorizonDusk: [0.15, 0.1, 0.15],
    uNebulaA: [0.2, 0.32, 0.9], uNebulaB: [0.9, 0.5, 0.95], uNebula: 1.1,
    uTintA: [0.92, 0.96, 1.0], uTintB: [0.62, 0.78, 1.0], uTintC: [1.0, 0.72, 0.9],
    uStars: 1.7, uStarGain: 1.35, uSpikes: 0,
    uMoonGlow: [0.85, 0.85, 1.0], uMoonDark: [0.06, 0.07, 0.16],
    uBandTilt: -2.2, uBandWidth: 5.5, uCore: 0.9, uDust: 1.0, uCoreColor: [1.0, 0.86, 0.96],
  },
};

// 星空转一圈的时间。真实的地球自转一圈约 24 小时，肉眼看不出在动，这里加快到 10 分钟一圈；
// 角度按真实时钟算，刷新页面后星空接着上次的位置，不会跳回起点。
const skyTurnSeconds = 10 * 60;
function skyAngle(time: number) {
  return ((time / 1000) % skyTurnSeconds) / skyTurnSeconds * Math.PI * 2;
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// 页面底色（body 的 background-color）转成 0–1 的 RGB，安静时天色往它靠
function pageColor(): Vec3 {
  const value = getComputedStyle(document.body).backgroundColor;
  const parts = (value.match(/[\d.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  const scale = value.startsWith("color(") ? 1 : 255;
  return [parts[0] / scale, parts[1] / scale, parts[2] / scale];
}

// 首屏在视口里占了多少（0–1）。Next 把上一页藏起来时（display: none）它的尺寸是 0，自然算作不在
function heroInView() {
  let best: { hero: HTMLElement; amount: number } | null = null;
  for (const hero of document.querySelectorAll<HTMLElement>(".home-hero")) {
    const rect = hero.getBoundingClientRect();
    const amount = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)) / window.innerHeight;
    if (!best || amount > best.amount) best = { hero, amount };
  }
  return best;
}

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useResolvedTheme();
  // 目标天色交给绘制循环读取（开灯 1，熄灯 0），循环里再慢慢过渡过去。
  const lightTarget = useRef(theme === "light" ? 1 : 0);
  useEffect(() => {
    lightTarget.current = theme === "light" ? 1 : 0;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!canvas || !gl) {
      canvas?.setAttribute("data-fallback", "");
      return;
    }
    const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      canvas.setAttribute("data-fallback", "");
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      light: gl.getUniformLocation(program, "uLight"),
      phase: gl.getUniformLocation(program, "uPhase"),
      moon: gl.getUniformLocation(program, "uMoon"),
      spin: gl.getUniformLocation(program, "uSpin"),
      quiet: gl.getUniformLocation(program, "uQuiet"),
      page: gl.getUniformLocation(program, "uPage"),
      press: gl.getUniformLocation(program, "uPress"),
      well: gl.getUniformLocation(program, "uWell"),
    };
    gl.uniform1f(uniforms.phase, moonPhase(Date.now()));
    // 配色在页面打开时由地址参数定下（layout.tsx 的 themeScript），这里读一次
    const chosen = document.documentElement.dataset.palette;
    const palette = palettes[chosen === "ink" || chosen === "galaxy" ? chosen : "night"];
    for (const [name, value] of Object.entries(palette)) {
      const location = gl.getUniformLocation(program, name);
      if (typeof value === "number") gl.uniform1f(location, value);
      else gl.uniform3f(location, ...value);
    }
    const setPage = () => gl.uniform3f(uniforms.page, ...pageColor());
    setPage();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const software = /swiftshader|llvmpipe|software|basic render/i.test(rendererInfo ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)) : "");
    let light = lightTarget.current;
    let quiet = 1;
    let ratio = 1;
    let time = 8;
    let frame = 0;
    let timer = 0;
    let last = performance.now();
    let drawn = "";
    // 按下的井：按下时刻、松开时刻（还按着为 null），时间用 performance.now() 的秒
    type Press = { x: number; y: number; down: number; up: number | null };
    let presses: Press[] = [];
    const pressData = new Float32Array(16);

    // 画布铺满视口，像素比最多 1.5，全屏着色器在高分屏上也不会太费电。
    const resize = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.well, 64 * ratio);
      drawn = "";
    };

    // 月亮画在首屏悬停区域（.moon-tip）的正下方，跟着首屏一起滚动
    const placeMoon = (hero: HTMLElement) => {
      const tip = hero.querySelector(".moon-tip")?.getBoundingClientRect();
      if (!tip) return "";
      gl.uniform3f(uniforms.moon, (tip.left + tip.width / 2) * ratio, canvas.height - (tip.top + tip.height / 2) * ratio, (tip.width / 2) * ratio);
      return `${Math.round(tip.top)}/${Math.round(tip.width)}`;
    };

    const draw = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.25);
      last = now;
      const ease = (value: number, target: number, seconds: number) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), step / seconds);
      // 开灯 / 熄灯：0.6 秒内过渡到目标天色；首屏占视口一半以上时是完整夜空，往下滚、换到内页时 0.8 秒内安静下来
      light = reduceMotion ? lightTarget.current : ease(light, lightTarget.current, 0.6);
      const found = heroInView();
      const quietTarget = 1 - Math.min(Math.max((found?.amount ?? 0) - 0.25, 0) / 0.5, 1);
      quiet = reduceMotion ? quietTarget : ease(quiet, quietTarget, 0.8);
      const moonKey = found && quiet < 1 ? placeMoon(found.hero) : "";
      // 井：0.12 秒按到底；松开（快速点一下时从按下 0.15 秒后算起）以 0.45 秒的节奏弹回，松开 1.8 秒后整口井连同那圈光消失
      const seconds = now / 1000;
      presses = presses.filter((press) => press.up === null || seconds - press.up < 1.8);
      pressData.fill(0);
      presses.forEach((press, index) => {
        const rise = Math.min(Math.max((seconds - press.down) / 0.12, 0), 1);
        const settle = press.up === null ? 1 : Math.exp(-Math.max(seconds - Math.max(press.up, press.down + 0.15), 0) / 0.45);
        pressData.set([press.x * ratio, canvas.height - press.y * ratio, rise * rise * (3 - 2 * rise) * settle, press.up === null ? -1 : seconds - press.up], index * 4);
      });
      gl.uniform4fv(uniforms.press, pressData);
      // 减少动态效果、或软件渲染时的安静夜空：画面静止，只在天色、安静程度、月亮位置变化时重画；有井在动时照常每帧画
      const still = presses.length === 0 && (reduceMotion || (software && quiet >= 1));
      // 安静时星星闪得慢一些
      if (!still) time += step * (1 - quiet * 0.6);
      const key = `${light}/${quiet}/${moonKey}`;
      if (still && key === drawn) return;
      drawn = key;
      gl.uniform1f(uniforms.light, light);
      gl.uniform1f(uniforms.quiet, quiet);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.spin, reduceMotion ? 0 : skyAngle(Date.now()));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // 完整夜空和有井的时候每帧都画；安静（或减少动态效果）时约每秒 15 帧，中间让浏览器歇着
    const loop = (now: number) => {
      frame = 0;
      draw(now);
      if (document.hidden) return;
      if ((quiet >= 0.999 || reduceMotion) && presses.length === 0) timer = window.setTimeout(() => { timer = 0; frame = requestAnimationFrame(loop); }, 66);
      else frame = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!frame && !timer && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    };

    // 鼠标左键、手写笔按下就记一口井（立刻开始逐帧画，不等安静夜空的下一拍）；松开、拖出窗口、窗口失焦都算松开
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === "touch" || reduceMotion) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      presses = [...presses.slice(-3), { x: event.clientX, y: event.clientY, down: performance.now() / 1000, up: null }];
      clearTimeout(timer);
      timer = 0;
      wake();
    };
    const release = () => {
      const seconds = performance.now() / 1000;
      presses = presses.map((item) => (item.up === null ? { ...item, up: seconds } : item));
    };
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("blur", release);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      wake();
    });
    resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    // 主题变了，页面底色跟着变
    const themeObserver = new MutationObserver(() => requestAnimationFrame(() => { setPage(); drawn = ""; }));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    resize();
    wake();

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield" aria-hidden="true" />;
}
