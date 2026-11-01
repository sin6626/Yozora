"use client";

import { useState } from "react";
import Reveal from "@/components/reveal";
import "@/components/home-hero.css";

// 调试页“首页入场动画”：用首页同样的类名拼一份标题和说明，点“重播”重新挂载、再播一遍入场和强调字亮起；
// 下面几条用真实的 Reveal，滚到才出现、只播一次（重播会一起重置）。
export default function HeroEntrancePreview() {
  const [round, setRound] = useState(0);
  return (
    <div key={round} className="debug-hero-entrance">
      <button type="button" className="btn btn-sm" onClick={() => setRound((value) => value + 1)}>重播</button>
      <div className="home-hero-content">
        <h1 className="home-hero-title">
          <span>你好，我是</span>
          <span><strong className="home-hero-name">Sin</strong><span>。</span></span>
          <br />
          <span>一个在深夜写代码的</span><strong>大三学生</strong>
        </h1>
        <p className="home-hero-description">白天上课，晚上折腾前端、写博客、做点小东西。</p>
      </div>
      <ul>
        {["第一条", "第二条", "第三条", "第四条"].map((text, index) => (
          <Reveal as="li" key={text} index={index}><p className="post-meta">{text}：滚到这里才出现</p></Reveal>
        ))}
      </ul>
    </div>
  );
}
