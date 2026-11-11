// Lucian UX/UI Prompt #013 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#013
'use client';

import React, { useEffect, useRef } from 'react';

interface StretchySwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

/**
 * Nút gạt đàn hồi co giãn (squash & stretch) vẽ lại dấu ✕ / ✓ và hỗ trợ kéo ngón tay (#013).
 */
export function StretchySwitch({
  checked,
  onChange,
  ariaLabel,
  ariaLabelledBy,
}: StretchySwitchProps) {
  const swRef = useRef<HTMLButtonElement | null>(null);
  const knobRef = useRef<HTMLSpanElement | null>(null);
  const dragRef = useRef<{ x: number; moved: boolean; start: number } | null>(null);
  const skipClickRef = useRef(false);
  const stretchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (stretchTimerRef.current !== null) {
        window.clearTimeout(stretchTimerRef.current);
      }
    };
  }, []);

  const triggerStretch = () => {
    const sw = swRef.current;
    if (!sw) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sw.classList.add('is-stretch');
    if (stretchTimerRef.current !== null) {
      window.clearTimeout(stretchTimerRef.current);
    }
    stretchTimerRef.current = window.setTimeout(() => {
      sw.classList.remove('is-stretch');
      stretchTimerRef.current = null;
    }, 170);
  };

  const commit = (next: boolean) => {
    triggerStretch();
    if (next !== checked) {
      onChange(next);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragRef.current = { x: e.clientX, moved: false, start: checked ? 30 : 4 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const sw = swRef.current;
    const knob = knobRef.current;
    if (!drag || !sw || !knob) return;

    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (!drag.moved) return;

    sw.classList.add('is-drag');
    const x = Math.max(4, Math.min(30, drag.start + dx));
    knob.style.left = `${x}px`;
    knob.style.width = `${26 + Math.min(10, Math.abs(dx) * 0.25)}px`;
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    const sw = swRef.current;
    const knob = knobRef.current;
    if (!drag || !sw || !knob) return;

    dragRef.current = null;
    sw.classList.remove('is-drag');
    const currentLeft = parseFloat(knob.style.left || (checked ? '30' : '4'));
    knob.style.left = '';
    knob.style.width = '';

    if (drag.moved) {
      skipClickRef.current = true;
      commit(currentLeft > 17);
    }
  };

  return (
    <button
      ref={swRef}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClick={() => {
        if (skipClickRef.current) {
          skipClickRef.current = false;
          return;
        }
        commit(!checked);
      }}
      className={`ux u013-sw ${checked ? 'is-on' : ''}`}
    >
      <span ref={knobRef} className="u013-knob" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path className="u013-x" d="M7.5 7.5l9 9M16.5 7.5l-9 9" />
          <path className="u013-v" d="M5.5 12.5l4.5 4.5 8.5-9" />
        </svg>
      </span>
    </button>
  );
}
