// Lucian UX/UI Prompt #218 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#218
'use client';

import React, { useEffect, useState } from 'react';
import { SkipForward } from 'lucide-react';
import { PlayPauseMorphOrb } from './PlayPauseMorphOrb';

interface MiniPlayerTrack {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
}

interface DockedMiniPlayerProps {
  track: MiniPlayerTrack | null;
  targetRef: React.RefObject<HTMLElement | null>;
  isPlaying: boolean;
  progressPct: number;
  forceDocked?: boolean;
  onOpenPlayer?: () => void;
  onTogglePlayPause: () => void;
  onNextTrack: () => void;
}

/**
 * Thanh Mini Player nổi tự thu gọn phía trên Dock khi cuộn xuống hoặc khi lướt sang trang Tìm kiếm (#218).
 */
export const DockedMiniPlayer = React.memo(function DockedMiniPlayer({
  track,
  targetRef,
  isPlaying,
  progressPct,
  forceDocked = false,
  onOpenPlayer,
  onTogglePlayPause,
  onNextTrack,
}: DockedMiniPlayerProps) {
  const [scrolledPast, setScrolledPast] = useState(false);
  const isDocked = forceDocked || scrolledPast;

  useEffect(() => {
    const el = targetRef.current;
    if (!track || !el || typeof IntersectionObserver === 'undefined') {
      setScrolledPast(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.bottom < 80);
      },
      { threshold: 0.08 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [track, targetRef]);

  if (!track) return null;

  const handleOpenOrScroll = () => {
    if (onOpenPlayer && forceDocked) {
      onOpenPlayer();
      return;
    }
    const el = targetRef.current;
    if (!el) return;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: rm ? 'auto' : 'smooth', block: 'center' });
  };

  return (
    <aside
      aria-label="Trình phát thu gọn"
      aria-hidden={!isDocked}
      className={`ux u218-dock ${isDocked ? 'is-dock' : ''} ${
        isPlaying ? 'is-play' : ''
      }`}
    >
      <div className="u218-bar">
        <button
          type="button"
          tabIndex={isDocked ? 0 : -1}
          onClick={handleOpenOrScroll}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left h-full py-1.5 rounded-xl focus-visible:outline-none"
          aria-label={`Quay lại trình phát bài ${track.title}`}
        >
          <div className="relative shrink-0">
            <img
              src={`/api/image-proxy?url=${encodeURIComponent(track.thumbnail)}`}
              alt={track.title}
              loading="lazy"
              decoding="async"
              className={`w-11 h-11 rounded-xl object-cover border border-cyan-300/35 transition-transform duration-500 ${
                isPlaying ? 'scale-100' : 'scale-95 opacity-85'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="u218-eq shrink-0" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p className="text-xs font-semibold text-white truncate">
                {track.title}
              </p>
            </div>
            <p className="text-[11px] text-white/60 truncate mt-0.5">
              {track.author}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <PlayPauseMorphOrb
            size="sm"
            isPlaying={isPlaying}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePlayPause();
            }}
          />

          <button
            type="button"
            tabIndex={isDocked ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              onNextTrack();
            }}
            title="Bài tiếp theo"
            aria-label="Bài tiếp theo"
            className="liquid-btn w-9 h-9 rounded-full flex items-center justify-center text-white/85 hover:text-white"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>

        <span
          className="u218-progress"
          style={{
            transform: `scaleX(${(Math.max(0, Math.min(100, progressPct)) / 100).toFixed(4)})`,
          }}
          aria-hidden="true"
        />
      </div>
    </aside>
  );
});
