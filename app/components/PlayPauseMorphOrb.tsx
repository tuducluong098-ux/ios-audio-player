// Lucian UX/UI Prompt #007 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#007
'use client';

import React, { useEffect, useId, useRef } from 'react';

interface PlayPauseMorphOrbProps {
  isPlaying: boolean;
  progress?: number;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  size?: 'lg' | 'sm';
  ariaLabel?: string;
}

const PLAY_PTS = [
  [
    [13, 8],
    [22.5, 13.6],
    [22.5, 26.4],
    [13, 32],
  ],
  [
    [22.5, 13.6],
    [32, 20],
    [32, 20],
    [22.5, 26.4],
  ],
];

const PAUSE_PTS = [
  [
    [11, 9],
    [17, 9],
    [17, 31],
    [11, 31],
  ],
  [
    [23, 9],
    [29, 9],
    [29, 31],
    [23, 31],
  ],
];

function formatPolygonPoints(idx: 0 | 1, t: number): string {
  return PLAY_PTS[idx]
    .map((p, j) => {
      const q = PAUSE_PTS[idx][j];
      return `${(p[0] + (q[0] - p[0]) * t).toFixed(2)},${(p[1] + (q[1] - p[1]) * t).toFixed(2)}`;
    })
    .join(' ');
}

/**
 * Nút Play/Pause biến hình mượt (morph) kèm vòng tiến trình & hào quang phát sáng (#007).
 */
export function PlayPauseMorphOrb({
  isPlaying,
  progress = 0,
  onClick,
  size = 'lg',
  ariaLabel,
}: PlayPauseMorphOrbProps) {
  const gradId = useId();
  const leftRef = useRef<SVGPolygonElement | null>(null);
  const rightRef = useRef<SVGPolygonElement | null>(null);
  const shapeRef = useRef<number>(isPlaying ? 1 : 0);
  const mountedRef = useRef(false);

  useEffect(() => {
    const applyShape = (t: number) => {
      if (leftRef.current) leftRef.current.setAttribute('points', formatPolygonPoints(0, t));
      if (rightRef.current) rightRef.current.setAttribute('points', formatPolygonPoints(1, t));
    };

    const target = isPlaying ? 1 : 0;
    if (!mountedRef.current) {
      mountedRef.current = true;
      shapeRef.current = target;
      applyShape(target);
      return;
    }

    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = rm ? 1 : 420;
    const from = shapeRef.current;
    const t0 = performance.now();
    let rafId = 0;

    const frame = (now: number) => {
      const x = Math.min(1, (now - t0) / duration);
      const eased = 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
      const next = from + (target - from) * eased;
      shapeRef.current = next;
      applyShape(next);
      if (x < 1) {
        rafId = requestAnimationFrame(frame);
      } else {
        shapeRef.current = target;
        applyShape(target);
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));

  if (size === 'sm') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isPlaying}
        aria-label={ariaLabel || (isPlaying ? 'Tạm dừng' : 'Phát')}
        className="ux u007-btn !w-10 !h-10 shrink-0"
      >
        <svg viewBox="0 0 40 40" aria-hidden="true" className="!w-[18px] !h-[18px]">
          <polygon ref={leftRef} points={formatPolygonPoints(0, isPlaying ? 1 : 0)} />
          <polygon ref={rightRef} points={formatPolygonPoints(1, isPlaying ? 1 : 0)} />
        </svg>
      </button>
    );
  }

  return (
    <div
      className={`ux u007-disc ${isPlaying ? 'is-play' : ''}`}
      style={{ '--p': clamped.toFixed(4) } as React.CSSProperties}
    >
      <svg className="u007-ring" viewBox="0 0 82 82" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="0.5" stopColor="#818cf8" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle className="u007-track" cx="41" cy="41" r="36" />
        <circle
          className="u007-arc"
          cx="41"
          cy="41"
          r="36"
          style={{ stroke: `url(#${gradId})` }}
        />
      </svg>
      <span className="u007-pulse" aria-hidden="true" />
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isPlaying}
        aria-label={ariaLabel || (isPlaying ? 'Tạm dừng' : 'Phát')}
        className="u007-btn"
      >
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <polygon ref={leftRef} points={formatPolygonPoints(0, isPlaying ? 1 : 0)} />
          <polygon ref={rightRef} points={formatPolygonPoints(1, isPlaying ? 1 : 0)} />
        </svg>
      </button>
    </div>
  );
}
