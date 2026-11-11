// Lucian UX/UI Prompt #091 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#091
'use client';

import React, { useEffect, useRef, useState } from 'react';

interface NetworkStatusBannerProps {
  onReconnect?: () => void;
}

/**
 * Dải thông báo mất kết nối & tự khôi phục khi có mạng (#091):
 * vệt gạch chéo trên icon Wi-Fi tự xóa khi 4G/Wi-Fi kết nối lại.
 */
export function NetworkStatusBanner({ onReconnect }: NetworkStatusBannerProps) {
  const [status, setStatus] = useState<'on' | 'off' | 'back'>('on');
  const hideTimerRef = useRef<number | null>(null);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const handleOffline = () => {
      clearHideTimer();
      setStatus('off');
    };

    const handleOnline = () => {
      clearHideTimer();
      setStatus('back');
      onReconnectRef.current?.();
      hideTimerRef.current = window.setTimeout(() => {
        setStatus('on');
        hideTimerRef.current = null;
      }, 2800);
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('off');
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      clearHideTimer();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const isOpen = status !== 'on';

  return (
    <div
      className={`ux u091-wrap w-full ${
        isOpen ? 'is-open' : ''
      } ${status === 'off' ? 'is-off' : ''} ${status === 'back' ? 'is-back' : ''}`}
      aria-live="polite"
    >
      <div className="u091-bn">
        <div className="u091-bi pb-1">
          <div className="u091-bc" role={isOpen ? 'status' : undefined}>
            <span className="u091-wf" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path className="a a3" d="M2.8 9.2a13.2 13.2 0 0 1 18.4 0" />
                <path className="a a2" d="M5.7 12.4a9 9 0 0 1 12.6 0" />
                <path className="a" d="M8.6 15.6a4.8 4.8 0 0 1 6.8 0" />
                <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
                <path className="x" d="M4.5 3.5l15 17" />
              </svg>
            </span>
            <span className="u091-bt">
              <b>
                {status === 'back'
                  ? 'Đã kết nối lại mạng'
                  : 'Đang mất kết nối Internet'}
              </b>
              <small>
                {status === 'back'
                  ? 'Nhạc sẽ tự động nối phát tiếp...'
                  : 'Đang dò lại Wi-Fi / 4G để phát tiếp'}
              </small>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
