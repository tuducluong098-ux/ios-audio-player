// Lucian UX/UI Prompt #071 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#071
'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SwipeToDeleteRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  ariaLabel?: string;
}

/**
 * Dòng bài hát hỗ trợ Vuốt sang trái để Xóa (#071):
 * phân biệt rõ thao tác cuộn dọc trên iPhone với cử chỉ vuốt xóa ngang.
 */
export function SwipeToDeleteRow({
  children,
  onDelete,
  ariaLabel,
}: SwipeToDeleteRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLSpanElement | null>(null);

  const [isGone, setIsGone] = useState(false);

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockRef = useRef<'none' | 'swipe' | 'scroll'>('none');
  const lastDxRef = useRef(0);
  const deleteTimerRef = useRef<number | null>(null);
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
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current);
      }
    };
  }, []);

  const triggerDelete = () => {
    if (isGone) return;
    if (rowRef.current) {
      rowRef.current.style.setProperty('--x', '-108%');
    }
    setIsGone(true);
    deleteTimerRef.current = window.setTimeout(
      () => {
        onDelete();
      },
      rmRef.current ? 10 : 210
    );
  };

  const resetSwipe = () => {
    lockRef.current = 'none';
    startRef.current = null;
    lastDxRef.current = 0;
    const row = rowRef.current;
    const bg = bgRef.current;
    if (row) {
      row.classList.remove('drag');
      row.style.setProperty('--x', '0px');
    }
    if (bg) {
      bg.style.setProperty('--k', '0.6');
      bg.style.setProperty('--op', '0');
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isGone || e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement)?.closest('button')) return;

    startRef.current = { x: e.clientX, y: e.clientY };
    lockRef.current = 'none';
    lastDxRef.current = 0;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    const row = rowRef.current;
    const bg = bgRef.current;
    if (!start || !row || !bg || isGone || lockRef.current === 'scroll') return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (lockRef.current === 'none') {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        lockRef.current = 'scroll';
        return;
      }
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        lockRef.current = 'swipe';
        row.classList.add('drag');
        try {
          row.setPointerCapture(e.pointerId);
        } catch {}
      } else {
        return;
      }
    }

    const clamped = Math.min(0, dx);
    lastDxRef.current = clamped;
    const visualX = clamped < -88 ? -88 + (clamped + 88) * 0.55 : clamped;
    const scale = Math.min(1.22, 0.6 + -clamped / 145);
    const opacity = Math.min(1, -clamped / 36);

    row.style.setProperty('--x', `${visualX.toFixed(1)}px`);
    bg.style.setProperty('--k', scale.toFixed(2));
    bg.style.setProperty('--op', opacity.toFixed(2));
  };

  const handlePointerEnd = () => {
    if (!startRef.current) return;
    const wasSwipe = lockRef.current === 'swipe';
    const finalDx = lastDxRef.current;
    startRef.current = null;
    lockRef.current = 'none';
    rowRef.current?.classList.remove('drag');

    if (wasSwipe && finalDx < -88) {
      triggerDelete();
    } else {
      resetSwipe();
    }
  };

  return (
    <div className={`ux u071-it ${isGone ? 'gone' : ''}`}>
      <div>
        <span ref={bgRef} className="u071-bg" aria-hidden="true">
          <svg viewBox="0 0 22 22">
            <path d="M4 6.5h14M9 6.5V4.5h4v2M6 6.5l1 11a1.5 1.5 0 0 0 1.5 1.4h5a1.5 1.5 0 0 0 1.5-1.4l1-11" />
          </svg>
        </span>
        <div
          ref={rowRef}
          tabIndex={0}
          aria-label={ariaLabel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault();
              triggerDelete();
            }
          }}
          className="u071-row"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface UndoDeleteSnackbarProps {
  visible: boolean;
  message: string;
  undoLabel?: string;
  hasBottomDock?: boolean;
  resetKey: number;
  onUndo: () => void;
  onExpire: () => void;
}

/**
 * Snackbar Hoàn tác nổi kèm vòng đếm ngược (#071) tự ẩn sau 5 giây.
 */
export function UndoDeleteSnackbar({
  visible,
  message,
  undoLabel = 'Hoàn tác',
  hasBottomDock = false,
  resetKey,
  onUndo,
  onExpire,
}: UndoDeleteSnackbarProps) {
  const undoBtnRef = useRef<HTMLButtonElement | null>(null);
  const pausedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!visible) return;
    const DUR = 5000;
    let left = DUR;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      if (!pausedRef.current) {
        left -= now - last;
      }
      last = now;
      undoBtnRef.current?.style.setProperty(
        '--left',
        Math.max(0, left / DUR).toFixed(3)
      );
      if (left <= 0) {
        onExpireRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, resetKey]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerEnter={() => {
        pausedRef.current = true;
      }}
      onPointerLeave={() => {
        pausedRef.current = false;
      }}
      onFocus={() => {
        pausedRef.current = true;
      }}
      onBlur={() => {
        pausedRef.current = false;
      }}
      className={`ux u071-snack ${hasBottomDock ? 'has-dock' : ''}`}
    >
      <p>{message}</p>
      <button
        ref={undoBtnRef}
        type="button"
        onClick={onUndo}
        className="u071-undo"
      >
        <svg viewBox="0 0 22 22" aria-hidden="true">
          <circle className="t" cx="11" cy="11" r="8.5" />
          <circle className="p" cx="11" cy="11" r="8.5" pathLength="100" />
        </svg>
        <span>{undoLabel}</span>
      </button>
    </div>
  );
}
