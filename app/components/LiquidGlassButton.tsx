// Lucian UX/UI Prompt #001 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#001
'use client';

import React, { useRef } from 'react';

interface LiquidGlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'glass';
  isLoading?: boolean;
  children: React.ReactNode;
}

/**
 * Nút Liquid Glass có ánh sáng phản chiếu chạy qua, spotlight theo chạm/trỏ & spinner giọt nước (#001).
 */
export function LiquidGlassButton({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  children,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  ...rest
}: LiquidGlassButtonProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const updatePointerGlow = (clientX: number, clientY: number) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const mx = (((clientX - rect.left) / (rect.width || 1)) * 100).toFixed(1);
    const my = (((clientY - rect.top) / (rect.height || 1)) * 100).toFixed(1);
    btn.style.setProperty('--mx', `${mx}%`);
    btn.style.setProperty('--my', `${my}%`);
  };

  const baseStyle = variant === 'primary' ? 'neon-orb-primary text-white' : 'liquid-btn';

  return (
    <button
      ref={btnRef}
      {...rest}
      disabled={disabled || isLoading}
      data-loading={isLoading ? 'true' : 'false'}
      aria-busy={isLoading || undefined}
      onPointerMove={(e) => {
        updatePointerGlow(e.clientX, e.clientY);
        onPointerMove?.(e);
      }}
      onPointerDown={(e) => {
        updatePointerGlow(e.clientX, e.clientY);
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
      }}
      className={`ux u001-btn ${baseStyle} ${className}`}
    >
      <span className="u001-sheen" aria-hidden="true" />
      <span className="u001-content">{children}</span>
      <span className="u001-spin" aria-hidden="true">
        <svg viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="10" />
        </svg>
      </span>
    </button>
  );
}
