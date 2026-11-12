// Lucian UX/UI Prompt #208 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#208
'use client';

import React, { useEffect, useId, useRef } from 'react';

export interface MacDockItem {
  id: string;
  label: string;
  isActive?: boolean;
  gradFrom: string;
  gradTo: string;
  iconPath: React.ReactNode;
  onSelect: () => void;
}

interface MacBookAppDockProps {
  items: MacDockItem[];
  ariaLabel?: string;
}

const BASE_SIZE = 50;
const MAX_SIZE = 74;
const SPREAD_PX = 84;
const GAP_PX = 14;

/**
 * Thanh Dock kiểu MacBook (#208) nổi ở đáy màn hình:
 * rê chuột hoặc lướt ngón tay sẽ phóng to mượt các icon lân cận theo đường cong Gaussian,
 * hiện tên nhãn phía trên, nảy nhịp khi chọn và sáng chấm xanh chỉ trang đang mở.
 */
export function MacBookAppDock({
  items,
  ariaLabel = 'Thanh điều hướng kiểu MacBook',
}: MacBookAppDockProps) {
  const uid = useId();
  const dkRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sizesRef = useRef<number[]>(items.map(() => BASE_SIZE));
  const mxRef = useRef<number | null>(null);
  const focusedIdxRef = useRef<number>(-1);
  const rafRef = useRef<number>(0);
  const rmRef = useRef<boolean>(false);

  useEffect(() => {
    sizesRef.current = items.map((_, idx) => sizesRef.current[idx] ?? BASE_SIZE);
  }, [items.length]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      rmRef.current = mq.matches;
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => {
      mq.removeEventListener?.('change', sync);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, []);

  const scheduleFrame = () => {
    if (rafRef.current) return;

    const frame = () => {
      rafRef.current = 0;
      const dk = dkRef.current;
      const tip = tipRef.current;
      if (!dk || !dk.isConnected) return;

      let busy = false;
      let bestIdx = -1;
      let bestSize = 0;
      const count = items.length;
      const mx = mxRef.current;
      const fi = focusedIdxRef.current;

      for (let i = 0; i < count; i++) {
        const el = btnRefs.current[i];
        if (!el) continue;

        const centerX = (i - (count - 1) / 2) * (BASE_SIZE + GAP_PX);
        let target = BASE_SIZE;
        if (mx !== null) {
          const d = (mx - centerX) / SPREAD_PX;
          target = BASE_SIZE + (MAX_SIZE - BASE_SIZE) * Math.exp(-d * d * 1.6);
        } else if (fi === i) {
          target = MAX_SIZE * 0.85;
        }

        const current = sizesRef.current[i] ?? BASE_SIZE;
        const next = current + (target - current) * (rmRef.current ? 1 : 0.3);
        if (Math.abs(target - next) > 0.12) {
          busy = true;
          sizesRef.current[i] = next;
        } else {
          sizesRef.current[i] = target;
        }

        const finalSize = sizesRef.current[i];
        el.style.setProperty('--s', `${finalSize.toFixed(2)}px`);
        el.style.setProperty('--lift', `${((finalSize - BASE_SIZE) * 0.28).toFixed(2)}px`);

        if (finalSize > bestSize) {
          bestSize = finalSize;
          bestIdx = i;
        }
      }

      if (tip) {
        if ((mx !== null || fi >= 0) && bestIdx >= 0 && bestSize > BASE_SIZE + 5) {
          const activeBtn = btnRefs.current[bestIdx];
          const br = activeBtn?.getBoundingClientRect();
          if (br) {
            tip.textContent = items[bestIdx].label;
            tip.style.left = `${(br.left + br.width / 2).toFixed(1)}px`;
            tip.style.top = `${(br.top - 10).toFixed(1)}px`;
            tip.classList.add('is-on');
          }
        } else {
          tip.classList.remove('is-on');
        }
      }

      if (busy) {
        rafRef.current = requestAnimationFrame(frame);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
  };

  const updatePointerX = (clientX: number, clientY: number) => {
    const dk = dkRef.current;
    if (!dk) return;
    const rect = dk.getBoundingClientRect();
    const yRel = clientY - rect.bottom;
    if (yRel > -110 && yRel < 16) {
      mxRef.current = clientX - (rect.left + rect.width / 2);
    } else {
      mxRef.current = null;
    }
    scheduleFrame();
  };

  const resetPointer = () => {
    mxRef.current = null;
    scheduleFrame();
  };

  return (
    <>
      <nav className="ux u208-wrap" aria-label={ariaLabel}>
        <div
          ref={dkRef}
          role="toolbar"
          aria-label={ariaLabel}
          onPointerMove={(e) => updatePointerX(e.clientX, e.clientY)}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') {
              updatePointerX(e.clientX, e.clientY);
            }
          }}
          onPointerUp={(e) => {
            if (e.pointerType === 'touch') {
              resetPointer();
            }
          }}
          onPointerCancel={resetPointer}
          onPointerLeave={resetPointer}
          className="u208-dk"
        >
          {items.map((item, idx) => {
            const gradId = `u208g_${uid}_${idx}`;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  btnRefs.current[idx] = el;
                }}
                type="button"
                aria-label={item.label}
                aria-current={item.isActive ? 'page' : undefined}
                onFocus={() => {
                  mxRef.current = null;
                  focusedIdxRef.current = idx;
                  scheduleFrame();
                }}
                onBlur={() => {
                  focusedIdxRef.current = -1;
                  scheduleFrame();
                }}
                onClick={() => {
                  const el = btnRefs.current[idx];
                  if (el && !rmRef.current) {
                    el.classList.remove('is-hop');
                    void el.offsetWidth;
                    el.classList.add('is-hop');
                  }
                  item.onSelect();
                }}
                className={`u208-a ${item.isActive ? 'is-run' : ''}`}
              >
                <svg viewBox="0 0 46 46" aria-hidden="true">
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={item.gradFrom} />
                      <stop offset="100%" stopColor={item.gradTo} />
                    </linearGradient>
                    <linearGradient id={`${gradId}_glass`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
                      <stop offset="48%" stopColor="#ffffff" stopOpacity="0.06" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
                    </linearGradient>
                  </defs>
                  <rect width="46" height="46" rx="12" fill={`url(#${gradId})`} />
                  <rect width="46" height="46" rx="12" fill={`url(#${gradId}_glass)`} />
                  {item.iconPath}
                </svg>
              </button>
            );
          })}
        </div>
      </nav>
      <div ref={tipRef} className="ux u208-tip" aria-hidden="true" />
    </>
  );
}
