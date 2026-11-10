'use client';

import React from 'react';

interface AppleSpinnerProps {
  size?: number;
  className?: string;
}

/**
 * Vòng xoay Loading 12 nan kiểu iOS UIActivityIndicatorView (giống ảnh tham chiếu).
 */
export function AppleSpinner({ size = 48, className = '' }: AppleSpinnerProps) {
  const blades = Array.from({ length: 12 }, (_, idx) => idx);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label="Loading"
      role="status"
    >
      {blades.map((idx) => {
        const angle = idx * 30;
        const delay = `${-((11 - idx) * 0.08).toFixed(2)}s`;
        return (
          <rect
            key={idx}
            x="45.5"
            y="6"
            width="9"
            height="25"
            rx="4.5"
            fill="currentColor"
            transform={`rotate(${angle} 50 50)`}
            className="apple-spinner-blade"
            style={{ animationDelay: delay }}
          />
        );
      })}
    </svg>
  );
}
