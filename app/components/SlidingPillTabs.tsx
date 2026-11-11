// Lucian UX/UI Prompt #039 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#039
'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export interface SlidingTabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  icon: React.ReactNode;
}

interface SlidingPillTabsProps<T extends string> {
  tabs: SlidingTabItem<T>[];
  activeTab: T;
  onChange: (id: T, direction: 1 | -1) => void;
  ariaLabel?: string;
}

/**
 * Thanh Tab với viên pill gradient trượt co giãn đàn hồi & điều hướng phím (#039).
 */
export function SlidingPillTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel = 'Danh sách phát',
}: SlidingPillTabsProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasMeasuredRef = useRef(false);

  const activeIdx = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTab)
  );

  const updatePill = useCallback((animate: boolean) => {
    const pill = pillRef.current;
    const activeBtn = tabRefs.current[activeIdx];
    if (!pill || !activeBtn) return;

    if (!animate) pill.style.transition = 'none';
    pill.style.setProperty('--x', `${activeBtn.offsetLeft}px`);
    pill.style.setProperty('--w', `${activeBtn.offsetWidth}px`);
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = '';
    }
  }, [activeIdx]);

  useLayoutEffect(() => {
    updatePill(hasMeasuredRef.current);
    hasMeasuredRef.current = true;
  }, [updatePill, tabs.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updatePill(false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [updatePill]);

  const selectByIndex = (nextIdx: number, shouldFocus = false) => {
    const nextTab = tabs[nextIdx];
    if (!nextTab || nextTab.id === activeTab) return;
    const dir: 1 | -1 = nextIdx > activeIdx ? 1 : -1;
    if (shouldFocus) tabRefs.current[nextIdx]?.focus();
    onChange(nextTab.id, dir);
  };

  return (
    <div ref={listRef} className="ux u039-tabs" role="tablist" aria-label={ariaLabel}>
      <span ref={pillRef} className="u039-pill" aria-hidden="true" />
      {tabs.map((tab, idx) => {
        const isSelected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => selectByIndex(idx)}
            onKeyDown={(e) => {
              const delta =
                e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (delta !== 0) {
                e.preventDefault();
                selectByIndex((idx + delta + tabs.length) % tabs.length, true);
              }
            }}
            className="u039-tab"
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
