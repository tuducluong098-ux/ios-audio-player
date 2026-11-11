// Lucian UX/UI Prompt #228 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#228
'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

interface CursorGlowCardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Thẻ Liquid Glass 60fps trên GPU: viền cầu vồng lướt nhẹ + vệt sáng theo trỏ/chạm & bloom khi chạm (#228).
 */
export const CursorGlowCard = forwardRef<HTMLElement, CursorGlowCardProps>(
  function CursorGlowCard({ children, className = '' }, forwardedRef) {
    const shellRef = useRef<HTMLElement | null>(null);
    const beamRef = useRef<HTMLSpanElement | null>(null);
    const rippleRef = useRef<HTMLSpanElement | null>(null);

    useImperativeHandle(forwardedRef, () => shellRef.current as HTMLElement);

    useEffect(() => {
      const shell = shellRef.current;
      const beam = beamRef.current;
      const ripple = rippleRef.current;
      if (!shell || !beam) return;

      const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let pointerActive = false;

      const moveBeam = (clientX: number, clientY: number) => {
        const rect = shell.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        beam.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        beam.style.opacity = '1';
      };

      const triggerRipple = (clientX: number, clientY: number) => {
        if (!ripple || rm) return;
        const rect = shell.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        ripple.style.setProperty('--tx', `${x.toFixed(1)}px`);
        ripple.style.setProperty('--ty', `${y.toFixed(1)}px`);
        ripple.classList.remove('is-blooming');
        void ripple.offsetWidth;
        ripple.classList.add('is-blooming');
      };

      const onPointerDown = (e: PointerEvent) => {
        pointerActive = true;
        moveBeam(e.clientX, e.clientY);
        triggerRipple(e.clientX, e.clientY);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === 'touch' && !pointerActive) return;
        moveBeam(e.clientX, e.clientY);
      };

      const onPointerOff = () => {
        pointerActive = false;
        beam.style.opacity = '0';
      };

      shell.addEventListener('pointerdown', onPointerDown);
      shell.addEventListener('pointermove', onPointerMove);
      shell.addEventListener('pointerleave', onPointerOff);
      shell.addEventListener('pointerup', onPointerOff);
      shell.addEventListener('pointercancel', onPointerOff);

      return () => {
        shell.removeEventListener('pointerdown', onPointerDown);
        shell.removeEventListener('pointermove', onPointerMove);
        shell.removeEventListener('pointerleave', onPointerOff);
        shell.removeEventListener('pointerup', onPointerOff);
        shell.removeEventListener('pointercancel', onPointerOff);
      };
    }, []);

    return (
      <section ref={shellRef} className="ux u228-shell">
        <span className="u228-prism" aria-hidden="true" />
        <span ref={beamRef} className="u228-beam" aria-hidden="true" />
        <div className={`u228-inner ${className}`}>
          <span ref={rippleRef} className="u228-ripple" aria-hidden="true" />
          {children}
        </div>
      </section>
    );
  }
);
