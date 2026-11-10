'use client';

import React from 'react';

interface Snowflake {
  left: string;
  size: number;
  opacity: number;
  duration: string;
  delay: string;
  sway: string;
  blur: string;
}

// Danh sách 28 bông tuyết tính toán cố định (deterministic) để tránh lỗi hydration SSR trên Next.js
const SNOWFLAKES: Snowflake[] = Array.from({ length: 28 }, (_, i) => {
  const seed = (i * 37 + 13) % 100;
  const size = 2.5 + ((i * 19) % 4); // 2.5px -> 5.5px nhẹ nhàng
  const opacity = Number((0.22 + (((i * 23) % 35) / 100)).toFixed(2)); // 0.22 -> 0.56
  const duration = `${(11 + ((i * 7) % 11)).toFixed(1)}s`; // 11s -> 21s rơi chậm rãi
  const delay = `-${((i * 1.7) % 18).toFixed(1)}s`;
  const sway = `${(i % 2 === 0 ? 1 : -1) * (12 + ((i * 5) % 18))}px`;
  const blur = i % 3 === 0 ? 'blur-[1px]' : i % 5 === 0 ? 'blur-[0.5px]' : '';

  return {
    left: `${seed}%`,
    size,
    opacity,
    duration,
    delay,
    sway,
    blur,
  };
});

/**
 * Hiệu ứng tuyết rơi nhẹ chạy hoàn toàn trên GPU (pointer-events-none, không cản thao tác chạm iPhone).
 */
export function Snowfall() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none"
    >
      {SNOWFLAKES.map((flake, idx) => (
        <span
          key={idx}
          className={`snow-flake absolute -top-4 rounded-full bg-white ${flake.blur}`}
          style={
            {
              left: flake.left,
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              opacity: flake.opacity,
              boxShadow: '0 0 8px rgba(255, 255, 255, 0.75)',
              animationDuration: flake.duration,
              animationDelay: flake.delay,
              '--snow-sway': flake.sway,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
