// Lucian UX/UI Prompt #070 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#070
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
 * Thông báo nổi kiểu Dynamic Island xếp chồng đàn hồi, chạy thanh tiến trình thuần CSS (#070).
 */
export function DynamicIslandToasts({
  toasts,
  onDismiss,
}: DynamicIslandToastsProps) {
  const [expanded, setExpanded] = useState(false);
  const [leavingIds, setLeavingIds] = useState<Record<number, number>>({});
  const [enteredIds, setEnteredIds] = useState<Record<number, boolean>>({});
  const dragRef = useRef<{ id: number; startX: number; dx: number; el: HTMLDivElement } | null>(null);
  const removeTimersRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const rafs: number[] = [];
    toasts.forEach((t) => {
      if (!enteredIds[t.id]) {
        const raf = requestAnimationFrame(() => {
          setEnteredIds((prev) => ({ ...prev, [t.id]: true }));
        });
        rafs.push(raf);
      }
    });
    return () => rafs.forEach(cancelAnimationFrame);
  }, [toasts, enteredIds]);

  const triggerDismiss = useCallback(
    (id: number, swipeDir = 0) => {
      setLeavingIds((prev) => {
        if (prev[id] !== undefined) return prev;
        return { ...prev, [id]: swipeDir };
      });
      if (removeTimersRef.current[id]) return;

      removeTimersRef.current[id] = window.setTimeout(() => {
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
      }, 320);
    },
    [onDismiss]
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

  // Chỉ hẹn 1 timer cho toast đang ở trên cùng, tạm dừng khi đang mở rộng stack
  const frontId = toasts[0]?.id;
  useEffect(() => {
    if (!frontId || expanded || leavingIds[frontId] !== undefined) return;
    const timer = window.setTimeout(() => {
      triggerDismiss(frontId, 0);
    }, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [frontId, expanded, leavingIds, triggerDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      className={`ux u070-zone ${expanded ? 'is-paused' : ''}`}
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
            {idx === 0 && <span className="u070-bar" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
