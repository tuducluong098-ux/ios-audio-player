// Lucian UX/UI Prompt #003 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#003
'use client';

import React, { useCallback, useEffect, useRef } from 'react';

interface HoldToDeleteButtonProps {
  label?: string;
  holdingLabel?: string;
  ariaLabel?: string;
  holdDurationMs?: number;
  className?: string;
  onConfirm: () => void;
}

const TRASH_SVG = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.5 7h15M9.5 7V4.8h5V7M7 7l.8 12.2h8.4L17 7" />
  </svg>
);

/**
 * Nút Nhấn & Giữ để Xóa (#003): vệt đỏ dâng dần theo thời gian giữ (chống bấm nhầm trên iOS),
 * rung nhẹ sau 55% tiến trình và tự rút lại nếu buông tay sớm.
 */
export function HoldToDeleteButton({
  label = 'Giữ để xóa',
  holdingLabel,
  ariaLabel,
  holdDurationMs = 1150,
  className = '',
  onConfirm,
}: HoldToDeleteButtonProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const progressRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const holdingRef = useRef(false);
  const completedRef = useRef(false);
  const rmRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      rmRef.current = mq.matches;
    };
    update();
    mq.addEventListener?.('change', update);
    return () => {
      mq.removeEventListener?.('change', update);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, []);

  const setProgress = useCallback((v: number) => {
    progressRef.current = v;
    btnRef.current?.style.setProperty('--p', v.toFixed(4));
  }, []);

  const tick = useCallback(
    (now: number) => {
      const btn = btnRef.current;
      if (!btn || !btn.isConnected) return;

      const dt = now - (lastTsRef.current || now);
      lastTsRef.current = now;

      const next = holdingRef.current
        ? Math.min(1, progressRef.current + dt / holdDurationMs)
        : Math.max(0, progressRef.current - dt / (holdDurationMs / 2.4));

      setProgress(next);
      btn.style.setProperty(
        '--shake',
        holdingRef.current && next > 0.55 && !rmRef.current ? 'running' : 'paused'
      );

      if (next >= 1 && holdingRef.current) {
        holdingRef.current = false;
        completedRef.current = true;
        rafRef.current = 0;
        lastTsRef.current = 0;
        btn.classList.remove('is-holding');
        btn.style.setProperty('--shake', 'paused');
        onConfirmRef.current();
        setTimeout(() => {
          completedRef.current = false;
          setProgress(0);
        }, 120);
        return;
      }

      if (holdingRef.current || next > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
        lastTsRef.current = 0;
      }
    },
    [holdDurationMs, setProgress]
  );

  const startHold = () => {
    if (completedRef.current) return;
    holdingRef.current = true;
    btnRef.current?.classList.add('is-holding');
    if (!rafRef.current) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const stopHold = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    btnRef.current?.classList.remove('is-holding');
    btnRef.current?.style.setProperty('--shake', 'paused');
    if (!rafRef.current && progressRef.current > 0) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const activeText = holdingLabel || label;

  return (
    <span className="ux u003-wrap">
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel || `${label} (nhấn giữ 1 giây)`}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          startHold();
        }}
        onPointerUp={stopHold}
        onPointerCancel={stopHold}
        onLostPointerCapture={stopHold}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (!e.repeat) startHold();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') stopHold();
        }}
        onBlur={stopHold}
        onClick={(e) => e.preventDefault()}
        className={`u003-btn ${className}`}
      >
        <span className="u003-lab">
          {TRASH_SVG}
          <span>{label}</span>
        </span>
        <span className="u003-fill" aria-hidden="true">
          {TRASH_SVG}
          <span>{activeText}</span>
        </span>
      </button>
    </span>
  );
}

interface HoldToDeleteUndoBarProps {
  message: string;
  undoLabel?: string;
  onUndo: () => void;
}

/**
 * Thanh thông báo kèm nút Hoàn tác sau khi thực hiện Giữ để xóa (#003).
 */
export function HoldToDeleteUndoBar({
  message,
  undoLabel = 'Hoàn tác',
  onUndo,
}: HoldToDeleteUndoBarProps) {
  return (
    <div className="ux u003-done" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onUndo} className="u003-undo">
        {undoLabel}
      </button>
    </div>
  );
}
