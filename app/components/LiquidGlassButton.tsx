// Lucian UX/UI Prompt #001 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#001
'use client';

import React, { useEffect, useRef } from 'react';

interface LiquidGlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'glass';
  isLoading?: boolean;
  isSuccess?: boolean;
  successLabel?: string;
  magnetic?: boolean;
  children: React.ReactNode;
}

/**
 * Nút Liquid Glass (#001): từ trường hút nhẹ theo trỏ, co tròn kiểu giọt nước khi tải,
 * rồi bung lại kèm dấu tick xanh lá hoàn tất.
 */
export function LiquidGlassButton({
  variant = 'primary',
  isLoading = false,
  isSuccess = false,
  successLabel = 'Xong',
  magnetic = true,
  disabled,
  className = '',
  children,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  ...rest
}: LiquidGlassButtonProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const magRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const rmRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      rmRef.current = mq.matches;
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  const updatePointerGlow = (clientX: number, clientY: number, pointerType?: string) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const mx = (((clientX - rect.left) / (rect.width || 1)) * 100).toFixed(1);
    const my = (((clientY - rect.top) / (rect.height || 1)) * 100).toFixed(1);
    btn.style.setProperty('--mx', `${mx}%`);
    btn.style.setProperty('--my', `${my}%`);

    const mag = magRef.current;
    if (mag && magnetic && !rmRef.current && !disabled && !isLoading && pointerType !== 'touch') {
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const pull = Math.max(0, 1 - Math.hypot(dx, dy) / 180);
      mag.style.translate = `${(dx * 0.14 * pull).toFixed(1)}px ${(dy * 0.14 * pull).toFixed(1)}px`;
    }
  };

  const resetMagnetic = () => {
    if (magRef.current) {
      magRef.current.style.translate = '0px 0px';
    }
  };

  const state: 'idle' | 'load' | 'ok' = isLoading
    ? 'load'
    : isSuccess
    ? 'ok'
    : 'idle';

  const baseStyle =
    variant === 'primary' ? 'neon-orb-primary text-white is-primary' : 'liquid-btn';

  return (
    <div
      ref={slotRef}
      className="ux u001-slot"
      onPointerMove={(e) => updatePointerGlow(e.clientX, e.clientY, e.pointerType)}
      onPointerLeave={() => {
        resetMagnetic();
        btnRef.current?.removeAttribute('data-active');
      }}
    >
      <div ref={magRef} className="u001-mag">
        <button
          ref={btnRef}
          {...rest}
          disabled={disabled || isLoading}
          data-state={state}
          aria-busy={isLoading || undefined}
          onPointerMove={(e) => {
            updatePointerGlow(e.clientX, e.clientY, e.pointerType);
            onPointerMove?.(e);
          }}
          onPointerDown={(e) => {
            updatePointerGlow(e.clientX, e.clientY, e.pointerType);
            e.currentTarget.setAttribute('data-active', 'true');
            onPointerDown?.(e);
          }}
          onPointerUp={(e) => {
            e.currentTarget.removeAttribute('data-active');
            onPointerUp?.(e);
          }}
          onPointerLeave={(e) => {
            e.currentTarget.removeAttribute('data-active');
            onPointerLeave?.(e);
          }}
          onPointerCancel={(e) => {
            e.currentTarget.removeAttribute('data-active');
            resetMagnetic();
          }}
          className={`u001-btn ${baseStyle} ${className}`}
        >
          <span className="u001-sheen" aria-hidden="true" />
          <span className="u001-content">{children}</span>
          <span className="u001-spin" aria-hidden="true">
            <svg viewBox="0 0 30 30">
              <circle cx="15" cy="15" r="10" />
            </svg>
          </span>
          <span className="u001-done" aria-hidden={state !== 'ok'}>
            <b>
              <svg viewBox="0 0 16 16">
                <path d="M3.5 8.4l3 3 6-6.4" />
              </svg>
            </b>
            <span>{successLabel}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
