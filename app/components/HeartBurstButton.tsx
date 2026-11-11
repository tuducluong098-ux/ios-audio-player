// Lucian UX/UI Prompt #022 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#022
'use client';

import React, { useEffect, useId, useRef, useState } from 'react';

interface HeartBurstButtonProps {
  liked: boolean;
  onToggle: () => void;
  ariaLabel?: string;
  title?: string;
}

const BURST_DOTS = [
  { a: '0deg', c: '#FF4D6D', c2: '#FFB26B' },
  { a: '51deg', c: '#8B6CFF', c2: '#FF7A93' },
  { a: '103deg', c: '#FFB547', c2: '#22C3A6' },
  { a: '154deg', c: '#FF4D6D', c2: '#8B6CFF' },
  { a: '206deg', c: '#22C3A6', c2: '#FFB547' },
  { a: '257deg', c: '#FF7A93', c2: '#3D8BFF' },
  { a: '309deg', c: '#3D8BFF', c2: '#FF4D6D' },
];

/**
 * Nút Tim Yêu thích bùng nổ vòng sáng & hạt màu (#022) lưu nhanh bài vào Playlist đầu tiên.
 */
export function HeartBurstButton({
  liked,
  onToggle,
  ariaLabel = 'Yêu thích bài hát',
  title = 'Thả tim lưu vào Yêu thích',
}: HeartBurstButtonProps) {
  const gradId = useId();
  const [popping, setPopping] = useState(false);
  const timerRef = useRef<number | null>(null);
  const rmRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      rmRef.current = mq.matches;
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => {
      mq.removeEventListener?.('change', sync);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    const nextLiked = !liked;
    onToggle();

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (nextLiked && !rmRef.current) {
      setPopping(false);
      requestAnimationFrame(() => {
        setPopping(true);
      });
      timerRef.current = window.setTimeout(() => {
        setPopping(false);
        timerRef.current = null;
      }, 850);
    } else {
      setPopping(false);
    }
  };

  return (
    <span className={`ux u022 ${liked ? 'is-on' : ''} ${popping ? 'is-pop' : ''}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={liked}
        aria-label={ariaLabel}
        title={title}
        className="u022-btn"
      >
        <span className="u022-ring" aria-hidden="true" />
        {BURST_DOTS.map((d) => (
          <span
            key={d.a}
            className="u022-dot"
            style={
              {
                '--a': d.a,
                '--c': d.c,
                '--c2': d.c2,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <i />
            <i />
          </span>
        ))}
        <span className="u022-heart" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FF7A93" />
                <stop offset="1" stopColor="#F0264D" />
              </linearGradient>
            </defs>
            <path
              className="u022-f"
              fill={`url(#${gradId})`}
              d="M26 45S5 33 5 18.5C5 11.6 10.4 7 16.4 7c4.3 0 7.6 2.3 9.6 5.6C28 9.3 31.3 7 35.6 7 41.6 7 47 11.6 47 18.5 47 33 26 45 26 45z"
            />
            <path
              className="u022-o"
              d="M26 45S5 33 5 18.5C5 11.6 10.4 7 16.4 7c4.3 0 7.6 2.3 9.6 5.6C28 9.3 31.3 7 35.6 7 41.6 7 47 11.6 47 18.5 47 33 26 45 26 45z"
            />
          </svg>
        </span>
      </button>
    </span>
  );
}
