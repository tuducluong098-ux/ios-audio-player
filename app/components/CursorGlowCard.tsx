// Lucian UX/UI Prompt #228 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#228
'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

interface CursorGlowCardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Thẻ Liquid Glass có viền & hào quang phát sáng mượt theo vị trí con trỏ/chạm (#228).
 */
export const CursorGlowCard = forwardRef<HTMLElement, CursorGlowCardProps>(
  function CursorGlowCard({ children, className = '' }, forwardedRef) {
    const shellRef = useRef<HTMLElement | null>(null);
    const innerRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(forwardedRef, () => shellRef.current as HTMLElement);

    useEffect(() => {
      const shell = shellRef.current;
      const inner = innerRef.current;
      if (!shell || !inner) return;

      const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let px = -400;
      let py = -400;
      let o = 0;
      let oT = 0;
      let raf = 0;
      let last = 0;

      const apply = () => {
        shell.style.setProperty('--cx', `${px.toFixed(1)}px`);
        shell.style.setProperty('--cy', `${py.toFixed(1)}px`);
        shell.style.setProperty('--o', o.toFixed(3));
        inner.style.setProperty('--ix', `${(px - 1.5).toFixed(1)}px`);
        inner.style.setProperty('--iy', `${(py - 1.5).toFixed(1)}px`);
        inner.style.setProperty('--o', o.toFixed(3));
      };

      const frame = (now: number) => {
        raf = 0;
        if (!shell.isConnected) return;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        o += (oT - o) * (rm ? 1 : Math.min(1, dt * (oT ? 8 : 2.5)));
        apply();
        if (Math.abs(oT - o) > 0.005) {
          raf = requestAnimationFrame(frame);
        }
      };

      const kick = () => {
        if (!raf) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      };

      const updatePoint = (clientX: number, clientY: number) => {
        const rect = shell.getBoundingClientRect();
        px = clientX - rect.left;
        py = clientY - rect.top;
        oT = 1;
        apply();
        kick();
      };

      const onPointerDown = (e: PointerEvent) => {
        updatePoint(e.clientX, e.clientY);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === 'touch' && oT === 0) return;
        updatePoint(e.clientX, e.clientY);
      };

      const onPointerOff = () => {
        oT = 0;
        kick();
      };

      shell.addEventListener('pointerdown', onPointerDown);
      shell.addEventListener('pointermove', onPointerMove);
      shell.addEventListener('pointerleave', onPointerOff);
      shell.addEventListener('pointerup', onPointerOff);
      shell.addEventListener('pointercancel', onPointerOff);

      apply();

      return () => {
        if (raf) cancelAnimationFrame(raf);
        shell.removeEventListener('pointerdown', onPointerDown);
        shell.removeEventListener('pointermove', onPointerMove);
        shell.removeEventListener('pointerleave', onPointerOff);
        shell.removeEventListener('pointerup', onPointerOff);
        shell.removeEventListener('pointercancel', onPointerOff);
      };
    }, []);

    return (
      <section ref={shellRef} className="ux u228-shell">
        <div ref={innerRef} className={`u228-inner ${className}`}>
          {children}
        </div>
      </section>
    );
  }
);
