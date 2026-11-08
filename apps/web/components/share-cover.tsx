import { ogSize } from "../lib/og";

type Kind = "home" | "post" | "note" | "page";
export type Cover = { kind: Kind; title: string; caption: string; date?: string; seed: string };

const ink = {
  home: {
    sky: "#13192f",
    low: "#363251",
    paper: "#f7eedb",
    accent: "#f0c28d",
    line: "#afa5bc",
    tag: "PERSONAL SPACE",
  },
  post: {
    sky: "#0b242a",
    low: "#163c40",
    paper: "#edf4e6",
    accent: "#a4d8bd",
    line: "#a3c5b9",
    tag: "FIELD NOTES",
  },
  note: { sky: "#f4ecdb", low: "#eee1d2", paper: "#392d32", accent: "#87493c", line: "#977866", tag: "JOURNAL" },
  page: { sky: "#211d31", low: "#393044", paper: "#faefdf", accent: "#dbb8cb", line: "#b9a1b4", tag: "ABOUT" },
} as const;

// 同一篇内容的星点和山脊固定，预览与爬虫拿到的封面一致。
function seededRandom(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0)!, 16777619);
  return () => (h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function Plate({ kind, seed }: { kind: Kind; seed: string }) {
  const p = ink[kind],
    random = seededRandom(seed);
  const phase = random() * 6;
  const cx = 951,
    cy = 269;
  const sky = kind === "post" || kind === "page";
  const star = (x: number, y: number, r: number) =>
    `M ${x - r} ${y} Q ${x} ${y} ${x} ${y - r * 1.6} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r * 1.6} Q ${x} ${y} ${x - r} ${y} Z`;
  return (
    <svg width={1200} height={630} viewBox="0 0 1200 630" style={{ position: "absolute", top: 0, left: 0 }}>
      <defs>
        <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={p.sky} />
          <stop offset="100%" stopColor={p.low} />
        </linearGradient>
        <linearGradient id="disc" x1="0" y1="0" x2="0.6" y2="1">
          <stop stopColor={kind === "note" ? "#e39578" : "#f8ddae"} />
          <stop offset="100%" stopColor={kind === "note" ? "#c57566" : "#c59ca4"} />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#wash)" />
      {Array.from({ length: sky ? 95 : 130 }, (_, i) => {
        const x = random() * 1200,
          y = random() * 630,
          r = random();
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={0.6 + r * 1.35}
            fill={p.line}
            opacity={(x < 730 ? 0.25 : 0.85) * (0.3 + r * 0.65)}
          />
        );
      })}
      {sky ? (
        <g fill="none" stroke={p.accent}>
          <circle cx={cx} cy={cy} r="164" opacity=".2" strokeDasharray="2 8" />
          <circle cx={cx} cy={cy} r="139" opacity=".8" strokeWidth="1.6" />
          {[-66, -37, 0, 37, 66].map((lat) => {
            const a = (lat * Math.PI) / 180;
            return (
              <ellipse
                key={lat}
                cx={cx}
                cy={cy + 121 * Math.sin(a)}
                rx={139 * Math.cos(a)}
                ry={36 * Math.cos(a)}
                transform={`rotate(-22 ${cx} ${cy})`}
                opacity=".43"
              />
            );
          })}
          {[32, 74, 114].map((r) => (
            <ellipse key={r} cx={cx} cy={cy} rx={r} ry="139" transform={`rotate(-22 ${cx} ${cy})`} opacity=".48" />
          ))}
          <ellipse
            cx={cx}
            cy={cy}
            rx="213"
            ry="56"
            transform={`rotate(-32 ${cx} ${cy})`}
            strokeWidth="2"
            opacity=".95"
          />
          <circle cx={cx + 174} cy={cy - 103} r="6" fill={p.paper} />
          {Array.from({ length: 64 }, (_, i) => (
            <path
              key={i}
              d={`M${cx} ${cy - 163} v${i % 8 === 0 ? -12 : -4}`}
              transform={`rotate(${(i * 360) / 64} ${cx} ${cy})`}
              opacity={i % 8 === 0 ? ".7" : ".27"}
            />
          ))}
        </g>
      ) : (
        <g>
          <circle cx="965" cy="225" r="121" fill="none" stroke={p.line} strokeDasharray="2 8" opacity=".55" />
          <circle cx="965" cy="225" r="91" fill="url(#disc)" />
          {Array.from({ length: 20 }, (_, i) => {
            const dy = 12 + i * 3.85,
              dx = Math.sqrt(91 * 91 - dy * dy);
            return (
              <path
                key={i}
                d={`M${965 - dx} ${225 + dy}h${2 * dx}`}
                stroke={p.low}
                strokeWidth={0.7 + i / 27}
                opacity=".46"
              />
            );
          })}
          <path d={star(816, 161, 10)} fill={p.accent} />
          <path d={star(1105, 114, 6)} fill={p.accent} />
        </g>
      )}
      {/* 等高线在右侧起伏，左侧压低，标题和说明始终在干净的底色上。 */}
      {Array.from({ length: sky ? 11 : 38 }, (_, i) => {
        const d = Array.from({ length: 91 }, (_, j) => {
          const x = j * 14;
          const t = i / 38;
          const ridge =
            Math.exp(-((x - 978) ** 2) / 102000) *
            (81 * Math.sin(x / 118 + phase + t * 0.8) +
              30 * Math.sin(x / 63 + phase) +
              9 * Math.sin(x / 23 + phase + t));
          const y =
            (sky ? 512 : 407) + i * (sky ? 4.4 : 3.3) + ridge * (sky ? 0.18 : 1) + 18 * Math.cos(x / 230 + t * 3);
          return `${j ? "L" : "M"}${x} ${y.toFixed(1)}`;
        }).join(" ");
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={p.line}
            strokeWidth={i % 6 === 0 ? 1.55 : 0.85}
            opacity={sky ? 0.23 : kind === "note" ? 0.54 : 0.44}
          />
        );
      })}
    </svg>
  );
}

function trimmed(text: string, n: number) {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length > n
    ? chars
        .slice(0, n - 1)
        .join("")
        .trimEnd() + "…"
    : chars.join("");
}

export default function ShareCover({
  cover,
  byline,
  avatar,
}: {
  cover: Cover;
  byline: string;
  avatar: string | null;
}) {
  const p = ink[cover.kind],
    home = cover.kind === "home";
  const title = trimmed(cover.title, 80);
  const length = Array.from(title).reduce((n, c) => n + (/^[\x20-\x7e]$/.test(c) ? 0.56 : 1), 0);
  const fontSize = home && length < 12 ? 92 : length <= 12 ? 68 : length <= 26 ? 56 : 48;
  return (
    <div
      style={{
        ...ogSize,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Yozora",
        color: p.paper,
        backgroundColor: p.sky,
      }}
    >
      <Plate kind={cover.kind} seed={cover.seed} />
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 21,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageResponse reads embedded image bytes.
            <img alt="" src={avatar} width={46} height={46} style={{ borderRadius: 23 }} />
          ) : (
            <svg width="30" height="30" viewBox="0 0 30 30">
              <path d="M15 1 Q16 13 29 15 Q16 16 15 29 Q14 16 1 15 Q14 14 15 1Z" fill={p.accent} />
            </svg>
          )}
          <span>{trimmed(byline, 35)}</span>
        </div>
        <span style={{ color: p.line, letterSpacing: 4, fontSize: 15 }}>
          {" "}
          {home ? "01" : cover.kind === "note" ? "03" : "02"} / {p.tag}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 124,
          height: 268,
          width: 700,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 15,
            fontSize: 20,
            color: p.accent,
          }}
        >
          <div style={{ display: "flex", width: 42, height: 3, backgroundColor: p.accent }} />
          {cover.date}
        </div>
        <div
          style={{
            display: "block",
            fontSize,
            lineHeight: 1.14,
            letterSpacing: -1.4,
            lineClamp: 3,
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {title}
        </div>
        {cover.caption && (
          <div
            style={{
              display: "block",
              maxWidth: 650,
              marginTop: 19,
              color: p.paper,
              opacity: 0.82,
              fontSize: home ? 29 : 24,
              lineHeight: 1.3,
              lineClamp: 2,
              overflow: "hidden",
            }}
          >
            {trimmed(cover.caption, home ? 46 : 52)}
          </div>
        )}
      </div>
    </div>
  );
}
