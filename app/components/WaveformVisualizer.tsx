// Lucian UX/UI Prompt #007 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#007
'use client';

import React from 'react';

interface WaveformVisualizerProps {
  isPlaying: boolean;
  progressPct?: number;
  duration?: number;
}

const WAVE_BARS = [
  24, 42, 30, 60, 48, 84, 56, 96, 68, 44, 78, 52, 92, 64, 88, 50, 74, 98, 62,
  86, 46, 70, 54, 82, 38, 58, 34, 22,
];

/**
 * Sóng âm thanh chuyển sắc Cyan -> Indigo -> Pink 60fps trên GPU (#007, chỉ hiển thị tránh chạm nhầm tua khi cuộn).
 */
export function WaveformVisualizer({
  isPlaying,
  progressPct = 0,
  duration = 0,
}: WaveformVisualizerProps) {
  const litCount =
    duration > 0
      ? Math.round((Math.max(0, Math.min(100, progressPct)) / 100) * WAVE_BARS.length)
      : WAVE_BARS.length;

  return (
    <div
      aria-hidden="true"
      className="ux u007-wave"
    >
      {WAVE_BARS.map((heightPct, idx) => {
        const ratio = idx / (WAVE_BARS.length - 1);
        const [barFrom, barVia, barTo] =
          ratio < 0.45
            ? ['#67e8f9', '#22d3ee', '#38bdf8']
            : ratio < 0.7
            ? ['#38bdf8', '#818cf8', '#e879f9']
            : ['#e879f9', '#ec4899', '#fb7185'];

        const dur = `${(0.72 + ((idx * 17) % 7) * 0.1).toFixed(2)}s`;
        const delay = `${(-((idx * 0.13) % 1.2)).toFixed(2)}s`;
        const isLit = idx < litCount || duration <= 0;

        return (
          <div
            key={idx}
            className={`u007-wave-bar ${isLit ? 'is-lit' : ''} ${
              isPlaying ? 'wave-bar-active' : 'is-paused'
            }`}
            style={
              {
                height: `${heightPct}%`,
                opacity: isPlaying ? (isLit ? 1 : 0.42) : isLit ? 0.65 : 0.3,
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
