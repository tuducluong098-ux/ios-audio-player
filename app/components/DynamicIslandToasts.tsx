// Lucian UX/UI Prompt #070 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#070
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

export interface IslandToastItem {
  id: number;
  message: string;
}

interface DynamicIslandToastsProps {
  toasts: IslandToastItem[];
  onDismiss: (id: number) => void;
}

const TOAST_DURATION_MS = 3200;

/**
 * Thông báo nổi kiểu Dynamic Island xếp chồng đàn hồi, vuốt ngang để đóng (#070).
 */
export function DynamicIslandToasts({
  toasts,
  onDismiss,
}: DynamicIslandToastsProps) {
  const [expanded, setExpanded] = useState(false);
  const [leavingIds, setLeavingIds] = useState<Record<number, number>>({});
  const [enteredIds, setEnteredIds] = useState<Record<number, boolean>>({});
  const barRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const remainingRef = useRef<Record<number, number>>({});
  const dragRef = useRef<{ id: number; startX: number; dx: number; el: HTMLDivElement } | null>(null);
  const removeTimersRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const rafs: number[] = [];
    toasts.forEach((t) => {
      if (remainingRef.current[t.id] === undefined) {
        remainingRef.current[t.id] = TOAST_DURATION_MS;
      }
      if (!enteredIds[t.id]) {
        const raf = requestAnimationFrame(() => {
          setEnteredIds((prev) => ({ ...prev, [t.id]: true }));
        });
        rafs.push(raf);
      }
    });
    return () => rafs.forEach(cancelAnimationFrame);
  }, [toasts, enteredIds]);

  const triggerDismiss = React.useCallback(
    (id: number, swipeDir = 0) => {
      if (leavingIds[id] !== undefined) return;
      setLeavingIds((prev) => ({ ...prev, [id]: swipeDir }));
      const timer = window.setTimeout(() => {
        delete remainingRef.current[id];
        delete removeTimersRef.current[id];
        setLeavingIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setEnteredIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        onDismiss(id);
      }, 340);
      removeTimersRef.current[id] = timer;
    },
    [leavingIds, onDismiss]
  );

  useEffect(() => {
    const timers = removeTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (toasts.length <= 1 && expanded) {
      setExpanded(false);
    }
  }, [toasts.length, expanded]);

  useEffect(() => {
    if (toasts.length === 0) return;

    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = now - last;
      last = now;

      if (!expanded && toasts.length > 0) {
        const front = toasts[0];
        if (front && leavingIds[front.id] === undefined) {
          const prevLeft = remainingRef.current[front.id] ?? TOAST_DURATION_MS;
          const nextLeft = Math.max(0, prevLeft - dt);
          remainingRef.current[front.id] = nextLeft;

          const bar = barRefs.current[front.id];
          if (bar) {
            bar.style.setProperty('--left', (nextLeft / TOAST_DURATION_MS).toFixed(3));
          }
          if (nextLeft <= 0) {
            triggerDismiss(front.id, 0);
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [toasts, expanded, leavingIds, triggerDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="ux u070-zone"
      role="region"
      aria-label="Thông báo"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse' && toasts.length > 1) setExpanded(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setExpanded(false);
      }}
    >
      <div className="sr-only" aria-live="polite">
        {toasts[0]?.message}
      </div>

      {toasts.slice(0, 4).map((t, idx) => {
        const isEntering = !enteredIds[t.id];
        const leaveDir = leavingIds[t.id];
        const isLeaving = leaveDir !== undefined;
        const yOffset = expanded ? idx * 54 : idx * 10;
        const scale = expanded ? 1 : Math.max(0.84, 1 - idx * 0.06);
        const opacity = isLeaving ? 0 : idx > 2 ? 0 : expanded ? 1 : Math.max(0.45, 1 - idx * 0.22);

        return (
          <div
            key={t.id}
            role="status"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              el.classList.add('is-drag');
              dragRef.current = { id: t.id, startX: e.clientX, dx: 0, el };
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current;
              if (!drag || drag.id !== t.id) return;
              const dx = e.clientX - drag.startX;
              drag.dx = dx;
              drag.el.style.setProperty('--dx', `${dx}px`);
              drag.el.style.setProperty('--o', String(Math.max(0.2, 1 - Math.abs(dx) / 220)));
            }}
            onPointerUp={() => {
              const drag = dragRef.current;
              if (!drag || drag.id !== t.id) return;
              dragRef.current = null;
              drag.el.classList.remove('is-drag');
              if (Math.abs(drag.dx) > 72) {
                triggerDismiss(t.id, drag.dx > 0 ? 1 : -1);
              } else {
                drag.el.style.setProperty('--dx', '0px');
                drag.el.style.removeProperty('--o');
                if (Math.abs(drag.dx) < 6 && toasts.length > 1) {
                  setExpanded((v) => !v);
                }
              }
            }}
            onPointerCancel={() => {
              const drag = dragRef.current;
              if (!drag || drag.id !== t.id) return;
              dragRef.current = null;
              drag.el.classList.remove('is-drag');
              drag.el.style.setProperty('--dx', '0px');
              drag.el.style.removeProperty('--o');
            }}
            style={
              {
                '--y': `${yOffset}px`,
                '--s': scale.toFixed(2),
                '--o': opacity.toFixed(2),
                '--dir': leaveDir || 1,
                zIndex: 60 - idx,
              } as React.CSSProperties
            }
            className={`u070-t ${isEntering ? 'is-enter' : ''} ${
              isLeaving ? 'is-leave' : ''
            } ${leaveDir ? 'is-side' : ''}`}
          >
            <span className="u070-ic" aria-hidden="true">
              <Check className="w-3.5 h-3.5" />
            </span>
            <span className="u070-msg">{t.message}</span>
            <button
              type="button"
              onClick={() => triggerDismiss(t.id, 0)}
              aria-label="Đóng thông báo"
              className="u070-x"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <span
              ref={(el) => {
                barRefs.current[t.id] = el;
              }}
              className="u070-bar"
              aria-hidden="true"
            />
          </div>
        );
      })}
    </div>
  );
}
