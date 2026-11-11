'use client';

import React from 'react';

interface WaveformVisualizerProps {
  isPlaying: boolean;
}

// Chiều cao cơ bản tạo hình sóng đối xứng Cyan -> Pink giống ảnh gợi ý
const WAVE_BARS = [
  24, 42, 30, 60, 48, 84, 56, 96, 68, 44, 78, 52, 92, 64, 88, 50, 74, 98, 62,
  86, 46, 70, 54, 82, 38, 58, 34, 22,
];

/**
 * Sóng âm thanh chuyển sắc Cyan -> Pink giống thiết kế tham chiếu.
 */
export function WaveformVisualizer({ isPlaying }: WaveformVisualizerProps) {
  return (
    <div
      aria-hidden="true"
      className="w-full h-14 flex items-center justify-center gap-[4px] px-2"
    >
      {WAVE_BARS.map((heightPct, idx) => {
        const ratio = idx / (WAVE_BARS.length - 1);
        // Chuyển sắc mượt từ Cyan (#22d3ee) -> Indigo (#818cf8) -> Magenta (#ec4899)
        const barColor =
          ratio < 0.45
            ? 'from-cyan-300 via-cyan-400 to-sky-400'
            : ratio < 0.7
            ? 'from-sky-400 via-indigo-400 to-fuchsia-400'
            : 'from-fuchsia-400 via-pink-500 to-rose-400';

        const dur = `${(0.75 + ((idx * 17) % 7) * 0.11).toFixed(2)}s`;
        const delay = `${(-((idx * 0.13) % 1.2)).toFixed(2)}s`;

        return (
          <div
            key={idx}
            className={`w-[3.5px] rounded-full bg-gradient-to-t ${barColor} shadow-[0_0_10px_rgba(34,211,238,0.28)] transition-all duration-300 ${
              isPlaying ? 'wave-bar-active' : 'opacity-45'
            }`}
            style={
              {
                height: isPlaying ? `${heightPct}%` : `${Math.max(18, Math.round(heightPct * 0.36))}%`,
                '--wave-dur': dur,
                '--wave-delay': delay,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
