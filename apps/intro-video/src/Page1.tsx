import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import shots from "../../../scripts/intro-video/shots.json";
import { Bg, Reveal, Sprite, Subtitles } from "./kit";

// 第一页：p1a 小城和 Sin、p1b 被 bug 气到、p1c 十点半。
// ponytail: 时长先用 shots.json 的秒数，等 TTS 旁白出来后按旁白实际长度改。
const FPS = 30;
const shot = (id: string) => shots.shots.find((s) => s.id === id)!;
const lines = (id: string) => shot(id).lines.map((l) => l.text);
const frames = (id: string) => shot(id).seconds * FPS;

const P1A = frames("p1a");
const P1B = frames("p1b");
const P1C = frames("p1c");
export const page1Frames = P1A + P1B + P1C;

const W = 1080;

function Bug({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const t = frame / dur;
  const x = interpolate(t, [0, 1], [380, 760]);
  const y = 905 + 12 * Math.sin(frame / 3);
  return <Img src={staticFile("page1/bug.png")} style={{ position: "absolute", width: 150, left: x, top: y, transform: `rotate(${8 * Math.sin(frame / 2)}deg)` }} />;
}

function RobotAndFile() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = frame / fps;
  const blink = s % 1.6 < 0.12 ? 0.15 : 1;
  const shake = s > 1.2 && s < 3 ? 10 * Math.sin(s * 22) : 0;
  const crumple = interpolate(s, [3.6, 4.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const puff = interpolate(s, [4.4, 5.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Img
        src={staticFile("page1/file-icon.png")}
        style={{ position: "absolute", width: 420, left: 80, top: 700, opacity: 1 - crumple, transform: `scale(${1 - 0.8 * crumple}) rotate(${-200 * crumple}deg)` }}
      />
      {puff > 0 && puff < 1 &&
        [0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 300 + 90 * Math.cos(i * 1.26) * puff,
              top: 820 + 90 * Math.sin(i * 1.26) * puff,
              width: 60,
              height: 60,
              borderRadius: 30,
              background: "rgba(214,200,240,0.8)",
              opacity: 1 - puff,
            }}
          />
        ))}
      <Img
        src={staticFile("page1/robot-face.png")}
        style={{ position: "absolute", width: 540, left: 470, top: 600, transform: `rotate(${shake}deg) scaleY(${blink === 1 ? 1 : 0.94})` }}
      />
    </>
  );
}

function Walker({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const step = Math.floor(frame / 8) % 2 === 0 ? "a" : "b";
  const t = frame / dur;
  const x = interpolate(t, [0, 1], [330, 640]);
  const y = interpolate(t, [0, 1], [1640, 1220]);
  const size = interpolate(t, [0, 1], [560, 380]);
  return (
    <>
      <div style={{ position: "absolute", left: x - size * 0.9, top: y - 22, width: size * 0.9, height: 40, borderRadius: "50%", background: "rgba(60,30,100,0.35)", transform: "skewX(-40deg)" }} />
      <Img src={staticFile(`page1/sin-walk-${step}.png`)} style={{ position: "absolute", width: size, left: x - size / 2, top: y - size, transform: `translateY(${step === "a" ? 0 : -6}px)` }} />
    </>
  );
}

function Fade({ dur, children }: { dur: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 8, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

function Scene({ from, dur, children }: { from: number; dur: number; children: React.ReactNode }) {
  return (
    <Sequence from={from} durationInFrames={dur}>
      <Fade dur={dur}>{children}</Fade>
    </Sequence>
  );
}

export function Page1() {
  const a1 = Math.round(8.5 * FPS);
  const b1 = 4 * FPS;
  const c1 = 3 * FPS;
  return (
    <AbsoluteFill style={{ background: "#2b1d47" }}>
      {/* p1a：小城的窗一扇扇亮起来 → 实验室门口走出 Sin */}
      <Scene from={0} dur={a1}>
        <Reveal a="page1/bg-town.png" b="page1/bg-town-lit.png" at={1.5} over={4} dur={a1} />
      </Scene>
      <Scene from={a1} dur={P1A - a1}>
        <Bg src="page1/bg-lab-door.png" dur={P1A - a1} from={1.12} to={1.04} />
        <Sequence durationInFrames={3 * FPS}>
          <Sprite src="page1/sin-step-out.png" x={W / 2} y={1640} size={780} enter={0.2} />
        </Sequence>
        <Sequence from={3 * FPS}>
          <Sprite src="page1/sin-stand.png" x={W / 2} y={1640} size={780} />
        </Sequence>
      </Scene>

      {/* p1b：书桌前被 bug 气到挠头 → 屏幕上的 AI 装傻、文件被揉成团 */}
      <Scene from={P1A} dur={b1}>
        <Bg src="page1/bg-desk-day.png" dur={b1} />
        <Sprite src="page1/sin-desk-scratch.png" x={360} y={1720} size={700} wiggle={2} bob={0} />
        <Bug dur={b1} />
      </Scene>
      <Scene from={P1A + b1} dur={P1B - b1}>
        <Bg src="page1/bg-laptop-screen.png" dur={P1B - b1} from={1.02} to={1.08} />
        <RobotAndFile />
      </Scene>

      {/* p1c：气鼓鼓 → 夜里一个人从实验室走回寝室 */}
      <Scene from={P1A + P1B} dur={c1}>
        <Bg src="page1/bg-desk-day.png" dur={c1} from={1.3} to={1.36} />
        <Sprite src="page1/sin-pout.png" x={W / 2} y={1500} size={820} bob={10} />
      </Scene>
      <Scene from={P1A + P1B + c1} dur={P1C - c1}>
        <Bg src="page1/bg-road-night.png" dur={P1C - c1} from={1.08} to={1.16} panY={-40} />
        <Walker dur={P1C - c1} />
      </Scene>

      <Sequence durationInFrames={P1A}>
        <Subtitles lines={lines("p1a")} dur={P1A} />
      </Sequence>
      <Sequence from={P1A} durationInFrames={P1B}>
        <Subtitles lines={lines("p1b")} dur={P1B} />
      </Sequence>
      <Sequence from={P1A + P1B} durationInFrames={P1C}>
        <Subtitles lines={lines("p1c")} dur={P1C} />
      </Sequence>
    </AbsoluteFill>
  );
}
