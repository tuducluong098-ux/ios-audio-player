'use client';

import React from 'react';

interface Snowflake {
  left: string;
  size: number;
  opacity: number;
  duration: string;
  delay: string;
  sway: string;
}

// 16 hạt ánh sáng tuyết nhẹ (pure radial-gradient + GPU translate3d, không boxShadow/blur gây lag iOS)
const SNOWFLAKES: Snowflake[] = Array.from({ length: 16 }, (_, i) => {
  const seed = (i * 41 + 9) % 96 + 2;
  const size = 4 + ((i * 19) % 5);
  const opacity = Number((0.28 + (((i * 23) % 36) / 100)).toFixed(2));
  const duration = `${(11 + ((i * 7) % 10)).toFixed(1)}s`;
  const delay = `-${((i * 1.9) % 16).toFixed(1)}s`;
  const sway = `${(i % 2 === 0 ? 1 : -1) * (10 + ((i * 5) % 14))}px`;

  return {
    left: `${seed}%`,
    size,
    opacity,
    duration,
    delay,
    sway,
  };
});

/**
 * Hiệu ứng hạt ánh sáng tuyết rơi mượt 60fps trên GPU iPhone Safari.
 */
export const Snowfall = React.memo(function Snowfall() {
  return (
    <div
      aria-hidden="true"
      style={{ contain: 'strict' }}
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none"
    >
      {SNOWFLAKES.map((flake, idx) => (
        <span
          key={idx}
          className="snow-flake absolute -top-4 rounded-full"
          style={
            {
              left: flake.left,
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              opacity: flake.opacity,
              background:
                'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(103,232,249,0.45) 45%, transparent 72%)',
              animationDuration: flake.duration,
              animationDelay: flake.delay,
              '--snow-sway': flake.sway,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});
