"use client";

import { bindLivePhoto } from "@suzuri/editor/live-photo";
import { useEffect, useRef, useState } from "react";

// 只读页的实况图：封面 + 静音短片，长按 250ms（或聚焦后按住空格）播放，用 Suzuri 的轻量播放入口。
export default function SuzuriLivePhoto({ url, videoUrl, alt }: { url: string; videoUrl: string; alt?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!frame.current || !video.current) return;
    const player = bindLivePhoto(frame.current, video.current, frame.current, { playing: setPlaying });
    return () => player.dispose();
  }, [videoUrl]);

  return (
    <div ref={frame} className="suzuri-live" data-playing={playing ? "" : undefined} tabIndex={0} role="img" aria-label={alt}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" draggable={false} />
      <video ref={video} src={videoUrl} muted playsInline preload="metadata" aria-hidden="true" />
      <span className="suzuri-live-badge" aria-hidden="true">LIVE</span>
    </div>
  );
}
