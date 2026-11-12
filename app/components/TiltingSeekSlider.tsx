// Lucian UX/UI Prompt #017 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#017
'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TiltingSeekSliderProps {
  value: number;
  max: number;
  formatTime: (secs: number) => string;
  onSeek: (nextTime: number) => void;
  ariaLabel?: string;
}

/**
 * Thanh tua nhạc có bong bóng thời gian nghiêng theo tốc độ kéo tay (#017)
 * giúp ngón tay không che mất mốc giây đang tua trên iPhone.
 */
export function TiltingSeekSlider({
  value,
  max,
  formatTime,
  onSeek,
  ariaLabel = 'Vị trí phát nhạc',
}: TiltingSeekSliderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const bubRef = useRef<HTMLSpanElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number; committed: boolean } | null>(null);
  const stillTimerRef = useRef<number | null>(null);
  const rmRef = useRef(false);

  const safeMax = max > 0 && Number.isFinite(max) ? max : 0;
  const displayedVal = dragValue !== null ? dragValue : value;
  const clampedVal = Math.max(0, Math.min(safeMax || 0, Number.isFinite(displayedVal) ? displayedVal : 0));
  const ratio = safeMax > 0 ? Math.max(0, Math.min(1, clampedVal / safeMax)) : 0;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      rmRef.current = mq.matches;
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => {
      mq.removeEventListener?.('change', sync);
      if (stillTimerRef.current !== null) {
        window.clearTimeout(stillTimerRef.current);
      }
    };
  }, []);

  const applyTilt = (deg: number) => {
    const bub = bubRef.current;
    if (!bub || rmRef.current) return;
    const clampedDeg = Math.max(-22, Math.min(22, deg));
    bub.style.setProperty('--tilt', `${clampedDeg.toFixed(1)}deg`);
    if (stillTimerRef.current !== null) {
      window.clearTimeout(stillTimerRef.current);
    }
    stillTimerRef.current = window.setTimeout(() => {
      bubRef.current?.style.setProperty('--tilt', '0deg');
      stillTimerRef.current = null;
    }, 90);
  };

  const valueFromClientX = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || safeMax <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    return p * safeMax;
  };

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (safeMax <= 0) return;

    dragStartRef.current = { x: e.clientX, y: e.clientY, committed: false };
    lastXRef.current = e.clientX;
    lastTRef.current = performance.now();
  };

  const handleThumbPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const start = dragStartRef.current;
    if (!start || safeMax <= 0) return;

    if (!start.committed) {
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dy > 8 && dy > dx) {
        dragStartRef.current = null;
        return;
      }
      if (dx < 5 || dx <= dy) return;
      start.committed = true;
      setIsDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }

    const now = performance.now();
    const vel = (e.clientX - lastXRef.current) / Math.max(8, now - lastTRef.current);
    lastXRef.current = e.clientX;
    lastTRef.current = now;
    applyTilt(-vel * 14);

    const next = valueFromClientX(e.clientX);
    setDragValue(next);
    onSeek(next);
  };

  const finishDrag = () => {
    dragStartRef.current = null;
    if (!isDragging) return;
    setIsDragging(false);
    setDragValue(null);
    bubRef.current?.style.setProperty('--tilt', '0deg');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (safeMax <= 0) return;
    const deltas: Record<string, number> = {
      ArrowRight: 5,
      ArrowUp: 5,
      ArrowLeft: -5,
      ArrowDown: -5,
      PageUp: 15,
      PageDown: -15,
    };
    let delta = deltas[e.key];
    if (e.key === 'Home') delta = -safeMax;
    if (e.key === 'End') delta = safeMax;
    if (delta === undefined) return;

    e.preventDefault();
    const next = Math.max(0, Math.min(safeMax, clampedVal + delta));
    applyTilt(delta > 0 ? -9 : 9);
    onSeek(next);
  };

  const formattedCurrent = formatTime(clampedVal);

  return (
    <div
      ref={rootRef}
      className={`ux u017 ${isDragging ? 'is-drag' : ''}`}
      style={{ '--v': ratio.toFixed(4) } as React.CSSProperties}
    >
      <div
        ref={trackRef}
        className="u017-track"
      >
        <span className="u017-fill" aria-hidden="true" />
        <span
          ref={thumbRef}
          className="u017-thumb"
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={Math.round(safeMax)}
          aria-valuenow={Math.round(clampedVal)}
          aria-valuetext={`${formattedCurrent} / ${formatTime(safeMax)}`}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
        />
        <span ref={bubRef} className="u017-bub" aria-hidden="true">
          <span>{formattedCurrent}</span>
        </span>
      </div>
    </div>
  );
}
