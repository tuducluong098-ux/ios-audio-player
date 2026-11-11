// Lucian UX/UI Prompt #079 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#079
'use client';

import React from 'react';

interface SuggestionSkeletonProps {
  rows?: number;
}

/**
 * Khung xương Skeleton lướt vệt sáng (#079) khi đang tìm danh sách bài hát gợi ý.
 */
export function SuggestionSkeleton({ rows = 4 }: SuggestionSkeletonProps) {
  return (
    <div
      className="ux space-y-2 py-1"
      aria-busy="true"
      aria-label="Đang tải bài gợi ý"
    >
      {Array.from({ length: rows }, (_, idx) => (
        <div
          key={idx}
          className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.04] border border-white/10"
        >
          <span className="w-5 h-3.5 rounded-md u079-sk shrink-0" />
          <span className="w-11 h-11 rounded-xl u079-sk shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className="h-3.5 rounded-lg u079-sk"
              style={{ width: idx % 2 === 0 ? '74%' : '62%' }}
            />
            <div
              className="h-2.5 rounded-md u079-sk"
              style={{ width: idx % 2 === 0 ? '48%' : '56%' }}
            />
          </div>
          <span className="w-8 h-8 rounded-full u079-sk shrink-0" />
        </div>
      ))}
    </div>
  );
}
