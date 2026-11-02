import { SayCards } from "@/components/say-list";
import SayListDrawer from "@/components/say-list-drawer";
import SaySky from "@/components/say-sky";
import { skyFrames, skyLayout, type Say } from "@/lib/says";
import "@/components/corners.css";
import "@/components/says.css";

// 调试页“金句星图”：真实的 SaySky + 抽屉，用示例句子（不读库）摆出现在、几十句、几百句三种规模，看星空装不装得下、星座挤不挤。
const lines = [
  "年少的时候总想快点长大，长大了才知道慢一点也挺好。",
  "代码能跑就别动它，能删就别留着它。",
  "今天的月亮很圆，可惜我在写 bug。",
  "别等准备好了再出发，路上会准备好的。",
  "凌晨三点的实验室，只有风扇和我还醒着。",
  "人总要为喜欢的东西熬几个夜。",
  "先把事情做完，再把事情做好。",
  "考试周的我和期末的天气一样，阴转小雨。",
  "所有的不确定，都是还没走到的路。",
  "能用一行写完的，就不要写十行。",
  "饭可以晚点吃，觉不能不睡。",
  "Talk is cheap, show me the commit.",
  "星星不会因为你看不见就不发光。",
  "学不会的时候，就先抄一遍。",
  "你不用很厉害才开始，但你要开始才会很厉害。",
  "路灯下的影子，比我更早到宿舍。",
];
// 说话的人按比例分（说得多的成大星座），剩下的一半是只说过一句的人，一半没写作者（孤星）
const authors: [string, number][] = [["捞大", 0.28], ["Sin", 0.14], ["室友阿杰", 0.1], ["学长", 0.08], ["大帝", 0.07], ["老妈", 0.05], ["实验室师兄", 0.04], ["同桌", 0.03], ["猫猫", 0.02]];

function sampleSays(count: number): Say[] {
  const names = authors.flatMap(([name, share]) => Array<string>(Math.round(count * share)).fill(name));
  return Array.from({ length: count }, (_, i) => {
    const rest = i - names.length;
    const author = i < names.length ? names[i] : rest % 2 === 0 ? `路过的人 ${rest / 2 + 1}` : undefined;
    return {
      id: `debug-say-${count}-${i}`,
      text: lines[(i * 7) % lines.length],
      author,
      source: i % 3 === 0 ? "与朋友的微信聊天" : undefined,
      created: new Date(Date.UTC(2025, 0, 1) + i * 86400000 * (700 / count)).toISOString(),
    };
  });
}

export default function SaySkyPreview() {
  return (
    <>
      {[5, 60, 240].map((count) => {
        const says = sampleSays(count);
        return (
          <div key={count} className="debug-say-sky" data-count={count}>
            <p className="post-meta">{count} 句</p>
            <SaySky layouts={{ wide: skyLayout(says, skyFrames.wide), tall: skyLayout(says, skyFrames.tall) }} says={says} site="Sin’s Yozora · 调试">
              <SayListDrawer count={says.length}>
                <SayCards says={says} site="Sin’s Yozora · 调试" />
              </SayListDrawer>
            </SaySky>
          </div>
        );
      })}
    </>
  );
}
