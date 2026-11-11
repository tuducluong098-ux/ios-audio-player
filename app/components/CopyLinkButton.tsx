// Lucian UX/UI Prompt #008 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#008
'use client';

import React, { useEffect, useRef, useState } from 'react';

interface CopyLinkButtonProps {
  textToCopy: string;
  tooltipLabel?: string;
  ariaLabel?: string;
  title?: string;
  onCopied?: () => void;
}

async function copyString(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Nút Sao chép link biến hình thành dấu tick xanh (#008) kèm bong bóng "Đã chép".
 */
export function CopyLinkButton({
  textToCopy,
  tooltipLabel = 'Đã chép',
  ariaLabel = 'Sao chép link bài hát',
  title = 'Sao chép link bài hát',
  onCopied,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!textToCopy) return;
    await copyString(textToCopy);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setCopied(false);
    requestAnimationFrame(() => {
      setCopied(true);
    });
    onCopied?.();
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1800);
  };

  return (
    <span className={`ux u008-wrap ${copied ? 'is-copied' : ''}`}>
      <button
        type="button"
        onClick={handleCopy}
        title={title}
        aria-label={ariaLabel}
        className="u008-btn"
      >
        <svg className="u008-cp" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
          <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
        </svg>
        <svg className="u008-ok" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5.5 12.5l4.2 4.2L18.5 8" />
        </svg>
      </button>
      <span className="u008-tip" role="status" aria-live="polite">
        {copied ? tooltipLabel : ''}
      </span>
    </span>
  );
}
