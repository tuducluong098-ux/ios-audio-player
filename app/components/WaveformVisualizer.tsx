// Lucian UX/UI Prompt #007 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#007
'use client';

import React, { useRef } from 'react';

interface WaveformVisualizerProps {
  isPlaying: boolean;
  progressPct?: number;
  currentTime?: number;
  duration?: number;
  onSeek?: (seconds: number) => void;
}

// Chiều cao cơ bản tạo hình sóng đối xứng Cyan -> Pink
const WAVE_BARS = [
  24, 42, 30, 60, 48, 84, 56, 96, 68, 44, 78, 52, 92, 64, 88, 50, 74, 98, 62,
  86, 46, 70, 54, 82, 38, 58, 34, 22,
];

/**
 * Sóng âm thanh chuyển sắc Cyan -> Indigo -> Pink, tự đồng bộ tiến trình & chạm để tua (#007).
 */
export function WaveformVisualizer({
  isPlaying,
  progressPct = 0,
  currentTime = 0,
  duration = 0,
  onSeek,
}: WaveformVisualizerProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const canSeek = Boolean(onSeek && duration > 0);
  const litCount =
    duration > 0
      ? Math.round((Math.max(0, Math.min(100, progressPct)) / 100) * WAVE_BARS.length)
      : WAVE_BARS.length;

  const seekAtClientX = (clientX: number) => {
    if (!onSeek || !duration || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    onSeek(ratio * duration);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekAtClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canSeek || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    seekAtClientX(e.clientX);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek || !onSeek) return;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 5;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -5;
    else if (e.key === 'Home') delta = -duration;
    else if (e.key === 'End') delta = duration;

    if (delta !== 0) {
      e.preventDefault();
      onSeek(Math.max(0, Math.min(duration, currentTime + delta)));
    }
  };

  return (
    <div
      ref={trackRef}
      role={canSeek ? 'slider' : undefined}
      tabIndex={canSeek ? 0 : undefined}
      aria-hidden={canSeek ? undefined : true}
      aria-label={canSeek ? 'Chạm hoặc kéo trên sóng âm để tua' : undefined}
      aria-valuemin={canSeek ? 0 : undefined}
      aria-valuemax={canSeek ? Math.floor(duration) : undefined}
      aria-valuenow={canSeek ? Math.floor(currentTime) : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
      className={`ux u007-wave ${canSeek ? 'is-seekable' : ''}`}
    >
      {WAVE_BARS.map((heightPct, idx) => {
        const ratio = idx / (WAVE_BARS.length - 1);
        const [barFrom, barVia, barTo] =
          ratio < 0.45
            ? ['#67e8f9', '#22d3ee', '#38bdf8']
            : ratio < 0.7
            ? ['#38bdf8', '#818cf8', '#e879f9']
            : ['#e879f9', '#ec4899', '#fb7185'];

        const dur = `${(0.75 + ((idx * 17) % 7) * 0.11).toFixed(2)}s`;
        const delay = `${(-((idx * 0.13) % 1.2)).toFixed(2)}s`;
        const isLit = idx < litCount || duration <= 0;

        return (
          <div
            key={idx}
            className={`u007-wave-bar ${isLit ? 'is-lit' : ''} ${
              isPlaying ? 'wave-bar-active' : isLit ? 'opacity-75' : 'opacity-45'
            }`}
            style={
              {
                height: isPlaying
                  ? `${heightPct}%`
                  : `${Math.max(18, Math.round(heightPct * 0.38))}%`,
                '--wave-dur': dur,
                '--wave-delay': delay,
                '--bar-from': barFrom,
                '--bar-via': barVia,
                '--bar-to': barTo,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
