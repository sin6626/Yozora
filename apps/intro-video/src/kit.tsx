import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const sec = (s: number, fps: number) => Math.round(s * fps);

/** Full-bleed background that slowly drifts (Ken Burns). */
export function Bg({ src, dur, from = 1.06, to = 1.14, panY = 0, opacity = 1 }: { src: string; dur: number; from?: number; to?: number; panY?: number; opacity?: number }) {
  const frame = useCurrentFrame();
  const t = frame / dur;
  const scale = from + (to - from) * t;
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale}) translateY(${panY * t}px)` }} />
    </AbsoluteFill>
  );
}

/** Cross-fade between two stills of the same drawing (e.g. windows lighting up). */
export function Reveal({ a, b, at, over, dur }: { a: string; b: string; at: number; over: number; dur: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = interpolate(frame, [sec(at, fps), sec(at + over, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Bg src={a} dur={dur} />
      <Bg src={b} dur={dur} opacity={k} />
    </>
  );
}

type SpriteProps = {
  src: string;
  x: number; // centre, px
  y: number; // bottom, px
  size: number; // px
  enter?: number; // seconds after the sequence starts
  wiggle?: number; // degrees
  bob?: number; // px
  flip?: boolean;
};

/** A transparent cut-out that pops in with a spring, then breathes. */
export function Sprite({ src, x, y, size, enter = 0, wiggle = 0, bob = 6, flip = false }: SpriteProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - sec(enter, fps), fps, config: { damping: 11, mass: 0.7 } });
  const life = frame / fps;
  const rot = wiggle * Math.sin(life * 9);
  const lift = bob * Math.sin(life * 2.4);
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: "absolute",
        width: size,
        height: size,
        left: x - size / 2,
        top: y - size,
        opacity: pop,
        transformOrigin: "50% 100%",
        transform: `translateY(${(1 - pop) * 60 + lift}px) scale(${(0.85 + 0.15 * pop) * (flip ? -1 : 1)}, ${0.85 + 0.15 * pop}) rotate(${rot}deg)`,
      }}
    />
  );
}

/** Burned-in subtitle; lines are shown one after another, split evenly by length. */
export function Subtitles({ lines, dur }: { lines: string[]; dur: number }) {
  const frame = useCurrentFrame();
  const durationInFrames = dur;
  const total = lines.reduce((n, l) => n + l.length, 0);
  let start = 0;
  const current = lines.find((l) => {
    const end = start + (l.length / total) * durationInFrames;
    const hit = frame >= start && frame < end;
    start = end;
    return hit;
  });
  if (!current) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 240,
        display: "flex",
        justifyContent: "center",
        fontFamily: '"PingFang SC", "Hiragino Sans GB", sans-serif',
        fontSize: 50,
        fontWeight: 600,
        lineHeight: 1.35,
        color: "#fffaf0",
        textShadow: "0 0 10px rgba(46,24,78,0.9), 0 3px 0 rgba(46,24,78,0.9)",
      }}
    >
      <span style={{ background: "rgba(43,29,71,0.55)", borderRadius: 28, padding: "14px 30px", maxWidth: 860, textAlign: "center" }}>{current}</span>
    </div>
  );
}
