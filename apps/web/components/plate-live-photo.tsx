"use client";

import { bindLivePhoto, type LivePhotoPlayer } from "@suzuri/editor/live-photo";
import { createMotionPhoto } from "@yozora/live-photo";
import { readImage } from "@yozora/live-photo/browser";
import "@yozora/live-photo/style.css";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadLivePhoto } from "../lib/live-photo-download";
import { useT } from "./locale-provider";

// Plate 正文里的实况图：封面 + 静音短片。按住画面 250ms（或聚焦 LIVE 后按住空格）播放，点一下 LIVE 播完整段；
// 右下角下载成一张 Motion Photo（封面 JPEG + 视频），需要两个地址都允许跨域读取。播放逻辑用 Suzuri 的无框架播放器。
// 下载限大小边读边数、30 秒超时，离开页面时取消（lib/live-photo-download.ts）。
export default function PlateLivePhoto({ url, videoUrl, alt, width, height }: { url: string; videoUrl: string; alt?: string; width?: number; height?: number }) {
  const t = useT().livePhoto;
  const video = useRef<HTMLVideoElement>(null);
  const badge = useRef<HTMLButtonElement>(null);
  const player = useRef<LivePhotoPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<"idle" | "busy" | "failed">("idle");
  const mounted = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    mounted.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const clip = video.current;
    if (!clip?.parentElement || !badge.current) return;
    setFailed(false);
    player.current = bindLivePhoto(clip.parentElement, clip, badge.current, {
      playing: setPlaying,
      error: () => setFailed(true),
    });
    return () => {
      player.current?.dispose();
      player.current = null;
    };
  }, [videoUrl]);

  async function download() {
    if (saving === "busy") return;
    const unmount = mounted.current?.signal;
    if (!unmount || unmount.aborted) return;
    setSaving("busy");
    try {
      await downloadLivePhoto({
        url,
        videoUrl,
        signal: AbortSignal.any([unmount, AbortSignal.timeout(30_000)]),
        build: async (cover, clip, signal) => {
          const jpeg = await readImage(new File([cover], "cover.jpg", { type: cover.type || "image/jpeg" }), signal);
          return createMotionPhoto(jpeg.blob, clip);
        },
        save: (motion) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(motion);
          link.download = "LivePhoto_MP.jpg";
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        },
      });
      setSaving("idle");
    } catch {
      if (!unmount.aborted) setSaving("failed");
    }
  }

  return (
    <span className="yz-live-frame plate-live" data-playing={playing ? "" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt ?? ""} width={width} height={height} draggable={false} />
      <video ref={video} className="yz-live-clip" src={videoUrl} muted playsInline preload="none" style={{ opacity: Number(playing) }} aria-hidden="true" />
      <button
        ref={badge}
        type="button"
        className="yz-live-badge"
        aria-label={t.hold}
        title={t.hold}
        onClick={() => (player.current?.isPlaying() ? player.current.stop() : player.current?.play())}
      >
        {failed ? t.unavailable : playing ? t.playing : `◉ ${t.live}`}
      </button>
      <button
        type="button"
        className="plate-live-download"
        aria-label={saving === "failed" ? t.downloadFailed : t.download}
        title={saving === "failed" ? t.downloadFailed : saving === "busy" ? t.downloading : t.download}
        data-state={saving}
        onClick={download}
      >
        <Download size={14} aria-hidden="true" />
      </button>
    </span>
  );
}
