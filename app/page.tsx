'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Repeat,
  Repeat1,
  Music2,
  Link2,
  AlertCircle,
  Plus,
  ListMusic,
  History,
  FolderPlus,
  Trash2,
  Timer,
  Sparkles,
  ListPlus,
  PlayCircle,
  X,
  ClipboardPaste,
  AudioLines,
  Clock,
  Settings,
  Repeat2,
  Compass,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Hls from 'hls.js';
import { AppleSpinner } from './components/AppleSpinner';
import { CircularTimerModal } from './components/CircularTimerModal';
import { Snowfall } from './components/Snowfall';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { SettingsModal } from './components/SettingsModal';
import { PlayPauseMorphOrb } from './components/PlayPauseMorphOrb';
import { CursorGlowCard } from './components/CursorGlowCard';
import { SlidingPillTabs } from './components/SlidingPillTabs';
import { LiquidGlassButton } from './components/LiquidGlassButton';
import { DockedMiniPlayer } from './components/DockedMiniPlayer';
import { MacBookAppDock } from './components/MacBookAppDock';
import { HoldToDeleteButton, HoldToDeleteUndoBar } from './components/HoldToDeleteButton';
import { CopyLinkButton } from './components/CopyLinkButton';
import { HeartBurstButton } from './components/HeartBurstButton';
import { TiltingSeekSlider } from './components/TiltingSeekSlider';
import { SwipeToDeleteRow, UndoDeleteSnackbar } from './components/SwipeToDeleteRow';
import { SuggestionSkeleton } from './components/SuggestionSkeleton';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import {
  DynamicIslandToasts,
  type IslandToastItem,
} from './components/DynamicIslandToasts';

// File WAV câm siêu nhẹ (44 bytes) dùng mở khóa thẻ <audio> trên iOS Safari trước khi fetch()
const SILENT_AUDIO_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Thời gian tối đa coi link stream cũ còn dùng tốt
const STREAM_TTL_MS = 45 * 60 * 1000;
const SOUNDCLOUD_TTL_MS = 4 * 60 * 1000; // SoundCloud signed CloudFront URL hết hạn sau ~6 phút

export type RepeatMode = 'off' | 'once' | 'infinite';

export type AudioSource = 'youtube' | 'tiktok' | 'soundcloud' | 'spotify';

export interface TrackData {
  id: string;
  originalUrl: string;
  audioUrl: string;
  title: string;
  author: string;
  thumbnail: string;
  source: AudioSource;
  mimeType: string;
  extractedAt: number;
}

export interface SuggestedTrack {
  id: string;
  url: string;
  title: string;
  author: string;
  thumbnail: string;
  source: AudioSource;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  tracks: TrackData[];
}

const STORAGE_KEYS = {
  HISTORY: 'ios_audio_history_v1',
  PLAYLISTS: 'ios_audio_playlists_v1',
  QUEUE: 'ios_audio_queue_v1',
  LOCK_MODE: 'ios_audio_lock_mode_v1',
  SYNC_AUTH: 'ios_audio_sync_auth_v1',
  SUGGESTIONS_ENABLED: 'ios_audio_suggestions_v1',
};

interface SyncSession {
  username: string;
  syncKey: string;
}

export default function AudioPlayerPage() {
  // Input & modals
  const [inputUrl, setInputUrl] = useState('');
  const [pendingUrl, setPendingUrl] = useState('');
  const [showLinkActionModal, setShowLinkActionModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showClockModal, setShowClockModal] = useState(false);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [loadingMode, setLoadingMode] = useState<'play' | 'queue' | null>(null);
  const [successMode, setSuccessMode] = useState<'play' | 'queue' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<IslandToastItem[]>([]);
  const toastSeqRef = useRef(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nowPlayingCardRef = useRef<HTMLElement | null>(null);

  // Undo states cho #003 (Giữ để xóa Playlist / Lịch sử) & #071 (Vuốt xóa bài hát)
  const [deletedHistoryBackup, setDeletedHistoryBackup] = useState<TrackData[] | null>(null);
  const [deletedPlaylistBackup, setDeletedPlaylistBackup] = useState<{
    playlist: Playlist;
    index: number;
  } | null>(null);
  const [swipeUndo, setSwipeUndo] = useState<
    | { type: 'queue'; item: TrackData; index: number; resetKey: number }
    | { type: 'playlistTrack'; playlistId: string; item: TrackData; index: number; resetKey: number }
    | { type: 'historyTrack'; item: TrackData; index: number; resetKey: number }
    | null
  >(null);
  const undoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeResetSeqRef = useRef(0);

  // Danh sách hàng đợi (Queue) & bài hiện tại
  const [queue, setQueue] = useState<TrackData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const currentTrack =
    currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  // Lịch sử, Gợi ý, Tìm kiếm YT/TikTok & Playlists
  const [history, setHistory] = useState<TrackData[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState<boolean>(true);
  const [suggestions, setSuggestions] = useState<SuggestedTrack[]>([]);
  const [suggestOffset, setSuggestOffset] = useState(0);
  const [suggestHasMore, setSuggestHasMore] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);
  const [loadingMoreSuggest, setLoadingMoreSuggest] = useState<boolean>(false);

  // Tìm kiếm YouTube & TikTok ngay trong tab Gợi ý (có kéo xuống tải thêm)
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [searchPlatform, setSearchPlatform] = useState<'all' | 'youtube' | 'tiktok'>('all');
  const [searchResults, setSearchResults] = useState<SuggestedTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchTtCursor, setSearchTtCursor] = useState(0);
  const [searchTtChallengeId, setSearchTtChallengeId] = useState<string | undefined>(undefined);
  const [searchHasMore, setSearchHasMore] = useState(false);

  const [activePage, setActivePage] = useState<'player' | 'discover'>('player');
  const [activeTab, setActiveTab] = useState<'queue' | 'playlists' | 'history'>('queue');
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);

  // Quản lý tạo/chọn Playlist
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [trackToAddPlaylist, setTrackToAddPlaylist] = useState<TrackData | null>(null);

  // Trạng thái trình phát nhạc + Chế độ lặp Bài & lặp Playlist
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackRepeatMode, setTrackRepeatMode] = useState<RepeatMode>('off');
  const [playlistRepeatMode, setPlaylistRepeatMode] = useState<RepeatMode>('off');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Chế độ nút trên Dynamic Island / Lock Screen (nằm trong Cài đặt)
  const [lockScreenControlMode, setLockScreenControlMode] = useState<'track' | 'seek'>('track');

  // Trạng thái Đồng bộ Cloud (Upstash Redis + Tên & PIN 4 số)
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Hẹn giờ tắt nhạc (Sleep Timer) & Fade-out
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Refs tránh stale closure cho sự kiện <audio> & MediaSession
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const popupInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<TrackData[]>(queue);
  const historyRef = useRef<TrackData[]>(history);
  const playlistsRef = useRef<Playlist[]>(playlists);
  const syncSessionRef = useRef<SyncSession | null>(syncSession);
  const isHydratedRef = useRef<boolean>(false);
  const lastSyncedPayloadRef = useRef<string>('');
  const currentIndexRef = useRef<number>(currentIndex);
  const trackRepeatModeRef = useRef<RepeatMode>(trackRepeatMode);
  const playlistRepeatModeRef = useRef<RepeatMode>(playlistRepeatMode);
  const trackRepeatOnceCountRef = useRef<number>(0);
  const playlistRepeatOnceCountRef = useRef<number>(0);
  const sleepEndTimeRef = useRef<number | null>(null);
  const userBaseVolumeRef = useRef<number>(1);
  const prefetchingTrackIdRef = useRef<string | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const recoveryAttemptsRef = useRef<number>(0);
  const isRecoveringRef = useRef<boolean>(false);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsEnabledRef = useRef<boolean>(suggestionsEnabled);
  const suggestionsRef = useRef<SuggestedTrack[]>(suggestions);
  const audioUnlockedRef = useRef<boolean>(false);
  const prefetchedSuggestCacheRef = useRef<Map<string, TrackData>>(new Map());
  const prefetchingSuggestUrlRef = useRef<string | null>(null);
  const playRequestIdRef = useRef<number>(0);
  const isSwitchingTrackRef = useRef<boolean>(false);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const libraryCardRef = useRef<HTMLElement | null>(null);
  const suggestScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreFnRef = useRef<() => void>(() => {});
  const discoverSeedTrackRef = useRef<SuggestedTrack | null>(null);
  const usedChainSeedsRef = useRef<Set<string>>(new Set());
  const coldDiscoveryOffsetRef = useRef<number>(0);
  const relatedCacheRef = useRef<
    Map<string, { list: SuggestedTrack[]; nextOffset: number; hasMore: boolean }>
  >(new Map());
  const relatedFetchingForRef = useRef<string | null>(null);
  const lastUiSecondRef = useRef<number>(-1);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    playlistsRef.current = playlists;
  }, [playlists]);

  useEffect(() => {
    syncSessionRef.current = syncSession;
  }, [syncSession]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    trackRepeatModeRef.current = trackRepeatMode;
  }, [trackRepeatMode]);

  useEffect(() => {
    playlistRepeatModeRef.current = playlistRepeatMode;
  }, [playlistRepeatMode]);

  useEffect(() => {
    suggestionsEnabledRef.current = suggestionsEnabled;
  }, [suggestionsEnabled]);

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  const showToast = useCallback((msg: string) => {
    const id = ++toastSeqRef.current;
    setToasts((prev) => [{ id, message: msg }, ...prev.slice(0, 4)]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Áp dụng dữ liệu đồng bộ từ Cloud về máy
  const applyCloudLibrary = useCallback(
    (data: { playlists?: Playlist[]; history?: TrackData[]; queue?: TrackData[] }) => {
      const nextPlaylists =
        Array.isArray(data.playlists) && data.playlists.length > 0
          ? data.playlists
          : playlistsRef.current;

      const nextHistory = Array.isArray(data.history)
        ? data.history
        : historyRef.current;

      const shouldUpdateQueue =
        Array.isArray(data.queue) &&
        data.queue.length > 0 &&
        (!audioRef.current || audioRef.current.paused);
      const nextQueue = shouldUpdateQueue ? data.queue! : queueRef.current;

      lastSyncedPayloadRef.current = JSON.stringify({
        playlists: nextPlaylists,
        history: nextHistory,
        queue: nextQueue,
      });

      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        setPlaylists(nextPlaylists);
        try {
          localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(nextPlaylists));
        } catch {}
        setSelectedPlaylistId((prev) =>
          prev && nextPlaylists.some((p) => p.id === prev) ? prev : nextPlaylists[0].id
        );
      }

      if (Array.isArray(data.history)) {
        setHistory(nextHistory);
        try {
          localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(nextHistory));
        } catch {}
      }

      if (shouldUpdateQueue) {
        setQueue(nextQueue);
        setCurrentIndex((idx) => (idx >= 0 && idx < nextQueue.length ? idx : 0));
      }
    },
    []
  );

  // Giả lập loading nhẹ kiểu Apple HUD khi mới mở web + cleanup timers Undo/Success
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsBootLoading(false);
    }, 250);
    return () => {
      clearTimeout(timer);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (undoResetTimerRef.current) clearTimeout(undoResetTimerRef.current);
    };
  }, []);

  // Giải phóng bộ nhớ đệm & layer GPU khi iPhone khóa màn hình hoặc chuyển app khác
  useEffect(() => {
    const syncVisibility = () => {
      const isHidden = document.visibilityState === 'hidden' || document.hidden;
      document.documentElement.dataset.bgHidden = isHidden ? 'true' : 'false';

      if (isHidden) {
        while (relatedCacheRef.current.size > 6) {
          const oldest = relatedCacheRef.current.keys().next().value;
          if (!oldest) break;
          relatedCacheRef.current.delete(oldest);
        }
        while (prefetchedSuggestCacheRef.current.size > 4) {
          const oldest = prefetchedSuggestCacheRef.current.keys().next().value;
          if (!oldest) break;
          prefetchedSuggestCacheRef.current.delete(oldest);
        }
      }
    };

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      delete document.documentElement.dataset.bgHidden;
    };
  }, []);

  const cachePrefetchedSuggestion = useCallback((url: string, track: TrackData) => {
    if (!url) return;
    if (prefetchedSuggestCacheRef.current.has(url)) {
      prefetchedSuggestCacheRef.current.delete(url);
    }
    while (prefetchedSuggestCacheRef.current.size >= 10) {
      const oldest = prefetchedSuggestCacheRef.current.keys().next().value;
      if (!oldest) break;
      prefetchedSuggestCacheRef.current.delete(oldest);
    }
    prefetchedSuggestCacheRef.current.set(url, track);
  }, []);

  // Khởi tạo dữ liệu từ localStorage + tự động kéo Cloud nếu đã đăng nhập Sync
  useEffect(() => {
    let loadedSync: SyncSession | null = null;
    try {
      const savedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (savedHistory) setHistory(JSON.parse(savedHistory));

      const savedPlaylists = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      if (savedPlaylists) {
        const parsed: Playlist[] = JSON.parse(savedPlaylists);
        setPlaylists(parsed);
        if (parsed.length > 0) setSelectedPlaylistId(parsed[0].id);
      } else {
        const defaultPl: Playlist = {
          id: 'pl_default',
          name: 'Nhạc Yêu Thích',
          createdAt: Date.now(),
          tracks: [],
        };
        setPlaylists([defaultPl]);
        setSelectedPlaylistId(defaultPl.id);
        localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify([defaultPl]));
      }

      const savedQueue = localStorage.getItem(STORAGE_KEYS.QUEUE);
      if (savedQueue) {
        const parsedQueue: TrackData[] = JSON.parse(savedQueue);
        if (parsedQueue.length > 0) {
          setQueue(parsedQueue);
          setCurrentIndex(0);
        }
      }

      const savedLockMode = localStorage.getItem(STORAGE_KEYS.LOCK_MODE);
      if (savedLockMode === 'track' || savedLockMode === 'seek') {
        setLockScreenControlMode(savedLockMode);
      }

      const savedSuggestionsEnabled = localStorage.getItem(STORAGE_KEYS.SUGGESTIONS_ENABLED);
      if (savedSuggestionsEnabled !== null) {
        setSuggestionsEnabled(savedSuggestionsEnabled !== 'false');
      }

      const savedSync = localStorage.getItem(STORAGE_KEYS.SYNC_AUTH);
      if (savedSync) {
        loadedSync = JSON.parse(savedSync);
        if (loadedSync?.username && loadedSync?.syncKey) {
          setSyncSession(loadedSync);
        }
      }
    } catch (e) {
      console.error('Lỗi đọc localStorage:', e);
    } finally {
      setTimeout(() => {
        isHydratedRef.current = true;
      }, 200);
    }

    if (loadedSync?.username && loadedSync?.syncKey) {
      setSyncStatus('syncing');
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pull',
          username: loadedSync.username,
          syncKey: loadedSync.syncKey,
        }),
      })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Sync error');
          applyCloudLibrary(json);
          setLastSyncedAt(json.updatedAt || Date.now());
          setSyncStatus('synced');
        })
        .catch(() => {
          setSyncStatus('error');
        });
    }
  }, [applyCloudLibrary]);

  // Tự động đẩy thay đổi lên Upstash Redis sau 1.2 giây khi đã bật Sync
  useEffect(() => {
    if (!isHydratedRef.current || !syncSession) return;
    const currentPayload = JSON.stringify({ playlists, history, queue });
    if (currentPayload === lastSyncedPayloadRef.current) return;

    const timer = setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'push',
            username: syncSession.username,
            syncKey: syncSession.syncKey,
            data: {
              playlists,
              history,
              queue,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Push error');
        lastSyncedPayloadRef.current = currentPayload;
        setLastSyncedAt(json.updatedAt || Date.now());
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [playlists, history, queue, syncSession]);

  const goToPage = useCallback((page: 'player' | 'discover') => {
    setActivePage(page);
    const el = pagerRef.current;
    if (!el) return;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      left: page === 'discover' ? el.clientWidth : 0,
      behavior: rm ? 'auto' : 'smooth',
    });
  }, []);

  const handlePagerScroll = useCallback(() => {
    const el = pagerRef.current;
    if (!el || el.clientWidth <= 0) return;
    const nextPage: 'player' | 'discover' =
      el.scrollLeft > el.clientWidth * 0.45 ? 'discover' : 'player';
    setActivePage((prev) => (prev === nextPage ? prev : nextPage));
  }, []);

  const handleToggleSuggestions = (enabled: boolean) => {
    setSuggestionsEnabled(enabled);
    try {
      localStorage.setItem(STORAGE_KEYS.SUGGESTIONS_ENABLED, String(enabled));
    } catch {}
    if (!enabled) {
      setSuggestions([]);
      setSuggestOffset(0);
      setSuggestHasMore(false);
    }
    showToast(enabled ? 'Đã bật Gợi ý & Tự phát tiếp' : 'Đã tắt tính năng Gợi ý');
  };

  // Hàm lấy danh sách Gợi ý (có cache tại client để tránh tốn 5G khi lướt qua lại)
  const ensureRelatedForTrack = useCallback(
    async (track: TrackData, signal?: AbortSignal): Promise<SuggestedTrack[]> => {
      if (!suggestionsEnabledRef.current || !track?.originalUrl) return [];

      const cacheKey = `${track.id}|${track.originalUrl}`;
      const cached = relatedCacheRef.current.get(cacheKey);
      if (cached) {
        setSuggestions(cached.list);
        suggestionsRef.current = cached.list;
        setSuggestHasMore(cached.hasMore);
        setSuggestOffset(cached.nextOffset);
        return cached.list;
      }

      if (relatedFetchingForRef.current === cacheKey) {
        return suggestionsRef.current;
      }

      relatedFetchingForRef.current = cacheKey;
      setLoadingSuggestions(true);

      try {
        const res = await fetch('/api/related', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset: 0,
            limit: 12,
            track: {
              id: track.id,
              originalUrl: track.originalUrl,
              title: track.title,
              author: track.author,
              source: track.source,
            },
          }),
          signal,
        });
        const json = await res.json();
        if (signal?.aborted) return [];

        if (Array.isArray(json?.suggestions)) {
          const list = json.suggestions as SuggestedTrack[];
          const hasMore = Boolean(json?.hasMore) || list.length >= 4;
          const nextOffset = Number(json?.nextOffset ?? list.length);

          if (relatedCacheRef.current.size >= 20) {
            const oldestKey = relatedCacheRef.current.keys().next().value;
            if (oldestKey) relatedCacheRef.current.delete(oldestKey);
          }
          relatedCacheRef.current.set(cacheKey, { list, hasMore, nextOffset });

          setSuggestions(list);
          suggestionsRef.current = list;
          setSuggestHasMore(hasMore);
          setSuggestOffset(nextOffset);
          return list;
        }
      } catch {
      } finally {
        if (relatedFetchingForRef.current === cacheKey) {
          relatedFetchingForRef.current = null;
        }
        if (!signal?.aborted) {
          setLoadingSuggestions(false);
        }
      }

      return [];
    },
    []
  );

  // Chỉ tải Gợi ý khi người dùng mở trang Tìm & Gợi ý (không tự chạy nền + extract ngầm khi đang nghe trên trang chủ -> tiết kiệm 5G)
  useEffect(() => {
    if (!suggestionsEnabled || !currentTrack) {
      if (!suggestionsEnabled) {
        setSuggestions([]);
        suggestionsRef.current = [];
        setSuggestOffset(0);
        setSuggestHasMore(false);
      }
      return;
    }

    discoverSeedTrackRef.current = null;
    usedChainSeedsRef.current.clear();
    if (currentTrack.originalUrl) {
      usedChainSeedsRef.current.add(currentTrack.originalUrl);
    }

    const cacheKey = `${currentTrack.id}|${currentTrack.originalUrl}`;
    const cached = relatedCacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached.list);
      suggestionsRef.current = cached.list;
      setSuggestHasMore(cached.hasMore);
      setSuggestOffset(cached.nextOffset);
      return;
    }

    // Chưa sang trang Tìm & Gợi ý -> không tự tải nền để tránh tốn 5G & CPU
    if (activePage !== 'discover') {
      setSuggestions([]);
      suggestionsRef.current = [];
      setSuggestOffset(0);
      setSuggestHasMore(false);
      return;
    }

    const controller = new AbortController();
    setSuggestOffset(0);
    setSuggestHasMore(false);
    void ensureRelatedForTrack(currentTrack, controller.signal);

    return () => {
      controller.abort();
    };
  }, [activePage, currentTrack, ensureRelatedForTrack, suggestionsEnabled]);

  // Nếu chưa phát bài nào mà người dùng vuốt sang trang Tìm & Gợi ý -> tự nạp bảng gợi ý nhạc hot kiểu YouTube
  useEffect(() => {
    if (
      activePage !== 'discover' ||
      !suggestionsEnabled ||
      currentTrack ||
      submittedSearch ||
      suggestions.length > 0 ||
      loadingSuggestions
    ) {
      return;
    }

    const controller = new AbortController();
    setLoadingSuggestions(true);
    coldDiscoveryOffsetRef.current = 0;

    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'nhạc trẻ việt nam hot chill remix',
        platform: 'all',
        offset: 0,
        limit: 12,
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        const items = Array.isArray(data?.results) ? (data.results as SuggestedTrack[]) : [];
        setSuggestions(items);
        coldDiscoveryOffsetRef.current = Number(data?.nextOffset ?? items.length);
        setSuggestHasMore(Boolean(data?.hasMore));
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSuggestions(false);
      });

    return () => controller.abort();
  }, [activePage, currentTrack, loadingSuggestions, submittedSearch, suggestions.length, suggestionsEnabled]);

  const executeTrackSearch = useCallback(
    async (
      rawQ: string,
      platform: 'all' | 'youtube' | 'tiktok',
      append = false,
      opts?: { offset: number; ttCursor: number; ttChallengeId?: string }
    ) => {
      const q = rawQ.trim();
      if (!q) {
        setSubmittedSearch('');
        setSearchResults([]);
        setSearchHasMore(false);
        return;
      }

      if (append) {
        setLoadingMoreSuggest(true);
      } else {
        setSubmittedSearch(q);
        setIsSearching(true);
        setSearchResults([]);
        setSearchOffset(0);
        setSearchTtCursor(0);
        setSearchTtChallengeId(undefined);
        setSearchHasMore(false);
      }

      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            platform,
            offset: append ? opts?.offset || 0 : 0,
            limit: 10,
            ttCursor: append ? opts?.ttCursor || 0 : 0,
            ttChallengeId: append ? opts?.ttChallengeId : undefined,
          }),
        });
        const data = await res.json();
        const items = Array.isArray(data?.results) ? (data.results as SuggestedTrack[]) : [];
        if (append) {
          setSearchResults((prev) => {
            const seen = new Set(prev.map((x) => `${x.source}:${x.id}`));
            const fresh = items.filter((x) => !seen.has(`${x.source}:${x.id}`));
            return [...prev, ...fresh].slice(-48);
          });
        } else {
          setSearchResults(items);
        }
        setSearchHasMore(Boolean(data?.hasMore));
        setSearchOffset(Number(data?.nextOffset ?? 0));
        setSearchTtCursor(Number(data?.nextTtCursor ?? 0));
        if (data?.ttChallengeId) {
          setSearchTtChallengeId(String(data.ttChallengeId));
        }
      } catch {
        if (!append) showToast('Không thể tìm kiếm lúc này, thử lại sau!');
      } finally {
        setIsSearching(false);
        setLoadingMoreSuggest(false);
      }
    },
    []
  );

  const loadMoreRelatedOrSearch = useCallback(async () => {
    if (loadingMoreSuggest || isSearching || loadingSuggestions) return;

    if (submittedSearch) {
      if (!searchHasMore) return;
      await executeTrackSearch(submittedSearch, searchPlatform, true, {
        offset: searchOffset,
        ttCursor: searchTtCursor,
        ttChallengeId: searchTtChallengeId,
      });
      return;
    }

    if (!currentTrack) {
      if (!suggestHasMore) return;
      setLoadingMoreSuggest(true);
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'nhạc trẻ việt nam hot chill remix',
            platform: 'all',
            offset: coldDiscoveryOffsetRef.current,
            limit: 10,
          }),
        });
        const data = await res.json();
        const extra = Array.isArray(data?.results) ? (data.results as SuggestedTrack[]) : [];
        if (extra.length > 0) {
          setSuggestions((prev) => {
            const seen = new Set(prev.map((x) => `${x.source}:${x.id}`));
            const fresh = extra.filter((x) => !seen.has(`${x.source}:${x.id}`));
            return [...prev, ...fresh].slice(-48);
          });
        }
        coldDiscoveryOffsetRef.current = Number(
          data?.nextOffset ?? coldDiscoveryOffsetRef.current + extra.length
        );
        setSuggestHasMore(Boolean(data?.hasMore));
      } catch {
      } finally {
        setLoadingMoreSuggest(false);
      }
      return;
    }

    if (!suggestHasMore) return;
    setLoadingMoreSuggest(true);
    try {
      const activeSeed = discoverSeedTrackRef.current;
      const res = await fetch('/api/related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: suggestOffset,
          limit: 10,
          track: activeSeed
            ? {
                id: activeSeed.id,
                originalUrl: activeSeed.url,
                title: activeSeed.title,
                author: activeSeed.author,
                source: activeSeed.source,
              }
            : {
                id: currentTrack.id,
                originalUrl: currentTrack.originalUrl,
                title: currentTrack.title,
                author: currentTrack.author,
                source: currentTrack.source,
              },
        }),
      });
      const json = await res.json();
      const extra = Array.isArray(json?.suggestions)
        ? (json.suggestions as SuggestedTrack[])
        : [];
      if (extra.length > 0) {
        setSuggestions((prev) => {
          const seen = new Set(prev.map((x) => `${x.source}:${x.id}`));
          const fresh = extra.filter((x) => !seen.has(`${x.source}:${x.id}`));
          return [...prev, ...fresh].slice(-48);
        });
      }

      if (Boolean(json?.hasMore)) {
        setSuggestOffset(Number(json?.nextOffset ?? suggestOffset + extra.length));
        setSuggestHasMore(true);
      } else {
        // Khi hết pool của bài hiện tại -> nối tiếp sang bài gợi ý chưa dùng (gợi ý liên tục như YouTube)
        const pool = [...suggestionsRef.current, ...extra];
        const nextSeed = pool.find((s) => s.url && !usedChainSeedsRef.current.has(s.url));
        if (nextSeed) {
          usedChainSeedsRef.current.add(nextSeed.url);
          discoverSeedTrackRef.current = nextSeed;
          setSuggestOffset(0);
          setSuggestHasMore(true);
        } else {
          setSuggestHasMore(false);
        }
      }
    } catch {
    } finally {
      setLoadingMoreSuggest(false);
    }
  }, [
    currentTrack,
    executeTrackSearch,
    isSearching,
    loadingMoreSuggest,
    loadingSuggestions,
    searchHasMore,
    searchOffset,
    searchPlatform,
    searchTtChallengeId,
    searchTtCursor,
    submittedSearch,
    suggestHasMore,
    suggestOffset,
  ]);

  useEffect(() => {
    loadMoreFnRef.current = loadMoreRelatedOrSearch;
  }, [loadMoreRelatedOrSearch]);

  useEffect(() => {
    if (activePage !== 'discover') return;
    const rootEl = suggestScrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!rootEl || !sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreFnRef.current();
        }
      },
      { root: rootEl, rootMargin: '140px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activePage, submittedSearch, suggestions.length, searchResults.length]);

  const handleChangeLockScreenMode = (mode: 'track' | 'seek') => {
    setLockScreenControlMode(mode);
    try {
      localStorage.setItem(STORAGE_KEYS.LOCK_MODE, mode);
    } catch {}
    showToast(
      mode === 'track'
        ? 'Dynamic Island: Tiến / Lùi bài hát'
        : 'Dynamic Island: Tua ±5 giây'
    );
  };

  const addToHistory = useCallback((track: TrackData) => {
    setHistory((prev) => {
      const filtered = prev.filter(
        (item) => item.id !== track.id && item.originalUrl !== track.originalUrl
      );
      const updated = [track, ...filtered].slice(0, 100);
      try {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    } catch {}
  }, [queue]);

  const savePlaylists = useCallback((updated: Playlist[]) => {
    setPlaylists(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(updated));
    } catch {}
  }, []);

  const formatTime = (sec: number) => {
    if (!sec || !isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  /**
   * MỞ KHÓA AUDIO TRÊN iOS SAFARI NGAY TRONG LUỒNG CHẠM ĐỒNG BỘ (chỉ chạy 1 lần, không chặn fetch)
   */
  const unlockAudioOnUserGesture = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    try {
      if (audio.paused && (!audio.src || audio.src === SILENT_AUDIO_URI)) {
        audio.src = SILENT_AUDIO_URI;
        const p = audio.play();
        if (p !== undefined) await p.catch(() => {});
        audio.pause();
      }
    } catch {}
  }, []);

  type ExtractApiResult =
    | TrackData
    | { isBatch: true; playlistName: string; tracks: TrackData[] };

  const fetchExtractRaw = useCallback(
    async (
      url: string,
      fallbackMeta?: { title?: string; author?: string; thumbnail?: string },
      forceRefresh = false
    ): Promise<ExtractApiResult> => {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), fallbackMeta, forceRefresh }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Không thể lấy được link âm thanh.');
      }
      return data as ExtractApiResult;
    },
    []
  );

  const fetchFreshTrack = useCallback(
    async (
      url: string,
      fallbackMeta?: { title?: string; author?: string; thumbnail?: string },
      forceRefresh = false
    ): Promise<TrackData> => {
      const result = await fetchExtractRaw(url, fallbackMeta, forceRefresh);
      if ('isBatch' in result && result.isBatch) {
        return result.tracks[0];
      }
      return result as TrackData;
    },
    [fetchExtractRaw]
  );

  const ensureValidAudioUrl = useCallback(
    async (track: TrackData): Promise<TrackData> => {
      const ttl = track.source === 'soundcloud' ? SOUNDCLOUD_TTL_MS : STREAM_TTL_MS;
      const isExpired =
        !track.audioUrl ||
        !track.extractedAt ||
        Date.now() - track.extractedAt > ttl;

      if (!isExpired) return track;

      const refreshed = await fetchFreshTrack(
        track.originalUrl,
        {
          title: track.title,
          author: track.author,
          thumbnail: track.thumbnail,
        },
        Boolean(track.audioUrl)
      );
      const merged: TrackData = {
        ...refreshed,
        id: track.id,
        title: track.title && !track.title.startsWith('Track ') ? track.title : refreshed.title,
        author: track.author && track.author !== 'Artist' ? track.author : refreshed.author,
        thumbnail:
          track.thumbnail && !track.thumbnail.includes('placehold.co')
            ? track.thumbnail
            : refreshed.thumbnail,
        source: refreshed.source || track.source,
      };
      queueRef.current = queueRef.current.map((item) =>
        item.id === track.id ? merged : item
      );
      setQueue((prev) =>
        prev.map((item) => (item.id === track.id ? merged : item))
      );
      return merged;
    },
    [fetchFreshTrack]
  );

  const clearStallWatchdog = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  // Dọn dẹp Hls.js & bộ đếm chống lag khi unmount
  useEffect(() => {
    return () => {
      clearStallWatchdog();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [clearStallWatchdog]);

  // Nạp nguồn phát chuẩn (dùng native <audio> trên Safari iOS và Hls.js cho Chrome/Edge/Android khi gặp SoundCloud .m3u8)
  const attachAndPlayAudio = useCallback(
    async (audio: HTMLAudioElement, track: TrackData) => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Khôi phục đúng chế độ lặp bài thật (tránh dính vòng lặp im lặng giữ AudioSession)
      audio.loop = trackRepeatModeRef.current === 'infinite';

      const isHls =
        track.audioUrl.includes('.m3u8') ||
        track.mimeType.toLowerCase().includes('mpegurl');

      if (
        isHls &&
        !audio.canPlayType('application/vnd.apple.mpegurl') &&
        Hls.isSupported()
      ) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Tải luồng HLS SoundCloud quá lâu.'));
          }, 8000);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            clearTimeout(timeout);
            resolve();
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              clearTimeout(timeout);
              reject(new Error(`Lỗi phát HLS (${data.details})`));
            }
          });

          hls.loadSource(track.audioUrl);
          hls.attachMedia(audio);
        });

        await audio.play();
        return;
      }

      audio.src = track.audioUrl;
      await audio.play();
    },
    []
  );

  const updateMediaSessionPosition = useCallback(() => {
    const audio = audioRef.current;
    if (
      !audio ||
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !('setPositionState' in navigator.mediaSession)
    ) {
      return;
    }

    if (audio.duration && isFinite(audio.duration) && audio.currentTime <= audio.duration) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: audio.currentTime,
        });
      } catch {}
    }
  }, []);

  const playTrackAtIndex = useCallback(
    async (index: number, customQueue?: TrackData[]) => {
      const targetQueue = customQueue || queueRef.current;
      if (index < 0 || index >= targetQueue.length) return;

      const audio = audioRef.current;
      if (!audio) return;

      const reqId = ++playRequestIdRef.current;
      isSwitchingTrackRef.current = true;
      clearStallWatchdog();
      setError(null);
      setCurrentIndex(index);
      currentIndexRef.current = index;
      trackRepeatOnceCountRef.current = 0;
      recoveryAttemptsRef.current = 0;
      lastPlayTimeRef.current = 0;
      lastUiSecondRef.current = -1;
      setCurrentTime(0);
      setDuration(0);

      let targetTrack = targetQueue[index];
      const trackTtl =
        targetTrack.source === 'soundcloud' ? SOUNDCLOUD_TTL_MS : STREAM_TTL_MS;
      const needsNetworkExtract =
        !targetTrack.audioUrl ||
        !targetTrack.extractedAt ||
        Date.now() - targetTrack.extractedAt > trackTtl;

      // Chỉ phá luồng đang phát khi cần chờ fetch URL mới ở màn hình sáng;
      // nếu đang tắt màn hình (document.hidden) mà cần fetch -> giữ AudioSession bằng WAV câm 44B thay vì pause hẳn để iOS không ngủm nhạc
      if (needsNetworkExtract) {
        if (typeof document !== 'undefined' && document.hidden) {
          try {
            if (hlsRef.current) {
              hlsRef.current.destroy();
              hlsRef.current = null;
            }
            audio.src = SILENT_AUDIO_URI;
            audio.loop = true;
            void audio.play().catch(() => {});
          } catch {}
        } else {
          try {
            audio.pause();
          } catch {}
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
        }
      } else if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      try {
        targetTrack = await ensureValidAudioUrl(targetTrack);
        if (playRequestIdRef.current !== reqId) return;

        if (!sleepEndTimeRef.current) {
          audio.volume = userBaseVolumeRef.current;
        }

        isSwitchingTrackRef.current = false;
        await attachAndPlayAudio(audio, targetTrack);
        if (playRequestIdRef.current !== reqId) return;

        setIsPlaying(true);
        addToHistory(targetTrack);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch {
        if (playRequestIdRef.current !== reqId) return;
        try {
          const refreshed = await fetchFreshTrack(
            targetTrack.originalUrl,
            {
              title: targetTrack.title,
              author: targetTrack.author,
              thumbnail: targetTrack.thumbnail,
            },
            true
          );
          if (playRequestIdRef.current !== reqId) return;

          const merged: TrackData = {
            ...refreshed,
            id: targetTrack.id,
            title: targetTrack.title || refreshed.title,
            author: targetTrack.author || refreshed.author,
            thumbnail: targetTrack.thumbnail || refreshed.thumbnail,
            source: refreshed.source || targetTrack.source,
          };
          queueRef.current = queueRef.current.map((t) =>
            t.id === targetTrack.id ? merged : t
          );
          setQueue((prev) => prev.map((t) => (t.id === targetTrack.id ? merged : t)));
          isSwitchingTrackRef.current = false;
          await attachAndPlayAudio(audio, merged);
          if (playRequestIdRef.current !== reqId) return;

          setIsPlaying(true);
          addToHistory(merged);
        } catch (retryErr) {
          if (playRequestIdRef.current !== reqId) return;
          isSwitchingTrackRef.current = false;
          const msg =
            retryErr instanceof Error ? retryErr.message : 'Không thể phát bài hát này.';
          setError(msg);
          setIsPlaying(false);
        }
      } finally {
        if (playRequestIdRef.current === reqId) {
          isSwitchingTrackRef.current = false;
        }
      }
    },
    [addToHistory, attachAndPlayAudio, clearStallWatchdog, ensureValidAudioUrl, fetchFreshTrack]
  );

  const recoverSelfRef = useRef<(() => Promise<void>) | null>(null);

  // Tự động phục hồi khi mạng chập chờn hoặc link stream bị đứng/lỗi giữa chừng
  const recoverCurrentTrack = useCallback(async () => {
    const audio = audioRef.current;
    const idx = currentIndexRef.current;
    const q = queueRef.current;
    const track = q[idx];

    if (
      !audio ||
      !track ||
      isSwitchingTrackRef.current ||
      isRecoveringRef.current ||
      audio.src === SILENT_AUDIO_URI
    ) {
      return;
    }

    if (recoveryAttemptsRef.current >= 2) {
      if (recoveryAttemptsRef.current === 2) {
        recoveryAttemptsRef.current = 3;
        clearStallWatchdog();
        if (q.length > 1) {
          showToast('Nguồn phát bài này đang lỗi, chuyển sang bài tiếp...');
          void playTrackAtIndex((idx + 1) % q.length);
        } else {
          setError('Không thể phát âm thanh lúc này. Vui lòng thử lại hoặc chọn bài khác.');
          setIsPlaying(false);
        }
      }
      return;
    }

    isRecoveringRef.current = true;
    const attemptNo = recoveryAttemptsRef.current + 1;
    recoveryAttemptsRef.current = attemptNo;
    clearStallWatchdog();

    const resumeAt = lastPlayTimeRef.current > 1 ? lastPlayTimeRef.current : 0;

    try {
      showToast(
        attemptNo === 1
          ? 'Đang tự làm mới kết nối âm thanh...'
          : 'Đang thử kết nối lại nguồn âm thanh (lần 2)...'
      );
      const refreshed = await fetchFreshTrack(
        track.originalUrl,
        {
          title: track.title,
          author: track.author,
          thumbnail: track.thumbnail,
        },
        true
      );
      if (queueRef.current[currentIndexRef.current]?.id !== track.id) {
        return;
      }

      const merged: TrackData = {
        ...refreshed,
        id: track.id,
        title: track.title || refreshed.title,
        author: track.author || refreshed.author,
        thumbnail: track.thumbnail || refreshed.thumbnail,
        source: refreshed.source || track.source,
      };
      queueRef.current = queueRef.current.map((t) =>
        t.id === track.id ? merged : t
      );
      setQueue((prev) => prev.map((t) => (t.id === track.id ? merged : t)));

      await attachAndPlayAudio(audio, merged);

      if (resumeAt > 1 && audio.duration && isFinite(audio.duration) && resumeAt < audio.duration) {
        try {
          audio.currentTime = resumeAt;
        } catch {}
      } else if (resumeAt > 1) {
        const seekOnce = () => {
          try {
            if (audio.duration && resumeAt < audio.duration) {
              audio.currentTime = resumeAt;
            }
          } catch {}
          audio.removeEventListener('loadedmetadata', seekOnce);
        };
        audio.addEventListener('loadedmetadata', seekOnce);
      }

      setIsPlaying(true);
    } catch {
      const latestQ = queueRef.current;
      const latestIdx = currentIndexRef.current;
      if (latestQ[latestIdx]?.id !== track.id) return;

      if (attemptNo < 2) {
        const failedTrackId = track.id;
        setTimeout(() => {
          if (
            queueRef.current[currentIndexRef.current]?.id === failedTrackId &&
            !isSwitchingTrackRef.current
          ) {
            void recoverSelfRef.current?.();
          }
        }, 700);
      } else if (latestQ.length > 1) {
        recoveryAttemptsRef.current = 3;
        showToast('Không thể phục hồi bài này, chuyển sang bài tiếp...');
        setTimeout(() => {
          if (
            queueRef.current[currentIndexRef.current]?.id === track.id &&
            !isSwitchingTrackRef.current
          ) {
            void playTrackAtIndex((latestIdx + 1) % latestQ.length);
          }
        }, 350);
      } else {
        recoveryAttemptsRef.current = 3;
        setError('Mất kết nối nguồn âm thanh. Vui lòng thử phát lại hoặc đổi bài.');
        setIsPlaying(false);
      }
    } finally {
      isRecoveringRef.current = false;
    }
  }, [attachAndPlayAudio, clearStallWatchdog, fetchFreshTrack, playTrackAtIndex, showToast]);

  useEffect(() => {
    recoverSelfRef.current = recoverCurrentTrack;
  }, [recoverCurrentTrack]);

  const startStallWatchdog = useCallback(() => {
    clearStallWatchdog();
    const audio = audioRef.current;
    if (
      isSwitchingTrackRef.current ||
      !audio ||
      audio.paused ||
      !audio.src ||
      audio.src === SILENT_AUDIO_URI
    ) {
      return;
    }

    stallTimerRef.current = setTimeout(() => {
      const currentAudio = audioRef.current;
      if (
        !isSwitchingTrackRef.current &&
        currentAudio &&
        !currentAudio.paused &&
        currentAudio.readyState < 3
      ) {
        recoverCurrentTrack();
      }
    }, 6500);
  }, [clearStallWatchdog, recoverCurrentTrack]);

  const handleNextTrack = useCallback(() => {
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (q.length === 0) return;

    const nextIdx = idx + 1 < q.length ? idx + 1 : 0;
    playTrackAtIndex(nextIdx);
  }, [playTrackAtIndex]);

  const handlePrevTrack = useCallback(() => {
    const audio = audioRef.current;
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (q.length === 0) return;

    if (audio && audio.currentTime > 5) {
      audio.currentTime = 0;
      lastUiSecondRef.current = 0;
      setCurrentTime(0);
      updateMediaSessionPosition();
      return;
    }

    const prevIdx = idx - 1 >= 0 ? idx - 1 : q.length - 1;
    playTrackAtIndex(prevIdx);
  }, [playTrackAtIndex, updateMediaSessionPosition]);

  const seekRelative = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio || !audio.src) return;
      const maxDur = audio.duration && isFinite(audio.duration) ? audio.duration : 999999;
      const nextTime = Math.min(Math.max(audio.currentTime + seconds, 0), maxDur);
      audio.currentTime = nextTime;
      lastUiSecondRef.current = Math.floor(nextTime);
      setCurrentTime(nextTime);
      updateMediaSessionPosition();
    },
    [updateMediaSessionPosition]
  );

  // Cấu hình Media Session API cho Dynamic Island & Lock Screen iOS
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !currentTrack) {
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    const proxiedArtworkUrl = `${window.location.origin}/api/image-proxy?url=${encodeURIComponent(
      currentTrack.thumbnail
    )}`;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.author,
      album:
        currentTrack.source === 'tiktok'
          ? 'TikTok Background Audio'
          : currentTrack.source === 'soundcloud'
          ? 'SoundCloud Background Audio'
          : currentTrack.source === 'spotify'
          ? 'Spotify Background Audio'
          : 'YouTube Background Audio',
      artwork: [
        { src: proxiedArtworkUrl, sizes: '256x256' },
        { src: proxiedArtworkUrl, sizes: '512x512' },
      ],
    });

    navigator.mediaSession.setActionHandler('play', async () => {
      try {
        await audio.play();
        navigator.mediaSession.playbackState = 'playing';
      } catch {}
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
      navigator.mediaSession.playbackState = 'paused';
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && isFinite(details.seekTime)) {
        audio.currentTime = details.seekTime;
        updateMediaSessionPosition();
      }
    });

    if (lockScreenControlMode === 'track') {
      try {
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      } catch {}
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        handlePrevTrack();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        handleNextTrack();
      });
    } else {
      try {
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch {}
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        seekRelative(-5);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        seekRelative(5);
      });
    }
  }, [
    currentTrack,
    lockScreenControlMode,
    handleNextTrack,
    handlePrevTrack,
    seekRelative,
    updateMediaSessionPosition,
  ]);

  /**
   * Xử lý khi hết 1 bài:
   * 1. Lặp bài đơn (1 lần / vô tận)
   * 2. Chuyển bài tiếp theo trong hàng đợi / playlist
   * 3. Khi hết bài cuối cùng -> Kiểm tra Lặp Playlist (1 lần / vĩnh viễn / tắt)
   */
  const handleAudioEnded = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const tMode = trackRepeatModeRef.current;
    if (tMode === 'infinite') {
      audio.currentTime = 0;
      await audio.play().catch(() => {});
      return;
    }

    if (tMode === 'once' && trackRepeatOnceCountRef.current < 1) {
      trackRepeatOnceCountRef.current += 1;
      audio.currentTime = 0;
      await audio.play().catch(() => {});
      return;
    }

    trackRepeatOnceCountRef.current = 0;

    const q = queueRef.current;
    const idx = currentIndexRef.current;

    if (idx + 1 < q.length) {
      playTrackAtIndex(idx + 1);
      return;
    }

    // Đã tới cuối danh sách / playlist -> kiểm tra chế độ lặp Playlist
    const pMode = playlistRepeatModeRef.current;
    if (pMode === 'infinite' && q.length > 0) {
      playTrackAtIndex(0);
      return;
    }

    if (pMode === 'once' && playlistRepeatOnceCountRef.current < 1 && q.length > 0) {
      playlistRepeatOnceCountRef.current += 1;
      playTrackAtIndex(0);
      return;
    }

    playlistRepeatOnceCountRef.current = 0;

    // Nếu đang bật Gợi ý trong Cài đặt -> tự động nối & phát bài gợi ý tiếp theo (lấy on-demand nếu chưa tải)
    if (suggestionsEnabledRef.current) {
      let pool = suggestionsRef.current;
      if (pool.length === 0 && q[idx]) {
        pool = await ensureRelatedForTrack(q[idx]);
      }

      if (pool.length > 0) {
        const recentUrls = new Set(q.slice(-6).map((t) => t.originalUrl));
        const nextSuggestion =
          pool.find((s) => !recentUrls.has(s.url)) || pool[0];

        if (nextSuggestion) {
          const cachedSuggest = prefetchedSuggestCacheRef.current.get(nextSuggestion.url);
          const suggestTtl =
            nextSuggestion.source === 'soundcloud' ? SOUNDCLOUD_TTL_MS : STREAM_TTL_MS;
          const isCachedFresh =
            cachedSuggest &&
            cachedSuggest.audioUrl &&
            cachedSuggest.extractedAt &&
            Date.now() - cachedSuggest.extractedAt <= suggestTtl;

          const queuedTrack: TrackData = isCachedFresh
            ? {
                ...cachedSuggest,
                id: nextSuggestion.id,
                title: nextSuggestion.title || cachedSuggest.title,
                author: nextSuggestion.author || cachedSuggest.author,
                thumbnail: nextSuggestion.thumbnail || cachedSuggest.thumbnail,
                source: cachedSuggest.source || nextSuggestion.source,
              }
            : {
                id: nextSuggestion.id,
                originalUrl: nextSuggestion.url,
                audioUrl: '',
                title: nextSuggestion.title,
                author: nextSuggestion.author,
                thumbnail: nextSuggestion.thumbnail,
                source: nextSuggestion.source,
                mimeType: 'audio/mp4',
                extractedAt: 0,
              };
          const newQueue = [...q, queuedTrack];
          setQueue(newQueue);
          queueRef.current = newQueue;
          playTrackAtIndex(q.length, newQueue);
          return;
        }
      }
    }

    setIsPlaying(false);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }, [ensureRelatedForTrack, playTrackAtIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = trackRepeatMode === 'infinite';
    }
  }, [trackRepeatMode]);

  const cycleTrackRepeatMode = () => {
    setTrackRepeatMode((prev) => {
      if (prev === 'off') {
        trackRepeatOnceCountRef.current = 0;
        showToast('Lặp bài: 1 lần');
        return 'once';
      }
      if (prev === 'once') {
        showToast('Lặp bài: Vĩnh viễn ∞');
        return 'infinite';
      }
      showToast('Lặp bài: Tắt');
      return 'off';
    });
  };

  const cyclePlaylistRepeatMode = () => {
    setPlaylistRepeatMode((prev) => {
      playlistRepeatOnceCountRef.current = 0;
      if (prev === 'off') {
        showToast('Lặp Playlist: 1 lần');
        return 'once';
      }
      if (prev === 'once') {
        showToast('Lặp Playlist: Vĩnh viễn ∞');
        return 'infinite';
      }
      showToast('Lặp Playlist: Tắt');
      return 'off';
    });
  };

  // Hẹn giờ tắt nhạc + Fade-out Volume 15s cuối
  const startSleepTimer = (minutes: number | null) => {
    const audio = audioRef.current;
    if (minutes === null) {
      sleepEndTimeRef.current = null;
      setSleepTimerMinutes(null);
      setSleepRemainingSec(null);
      setIsFadingOut(false);
      if (audio) {
        audio.volume = userBaseVolumeRef.current;
        setVolume(userBaseVolumeRef.current);
      }
      showToast('Đã tắt hẹn giờ ngủ');
      return;
    }

    const endAt = Date.now() + minutes * 60 * 1000;
    sleepEndTimeRef.current = endAt;
    setSleepTimerMinutes(minutes);
    setSleepRemainingSec(minutes * 60);
    setIsFadingOut(false);
    showToast(`Hẹn giờ tắt sau ${minutes} phút (Fade-out)`);
  };

  const checkSleepTimerAndFadeOut = useCallback(() => {
    const endAt = sleepEndTimeRef.current;
    if (!endAt) return;

    const audio = audioRef.current;
    const remainingMs = endAt - Date.now();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    setSleepRemainingSec(remainingSec);

    const FADE_DURATION_MS = 15000;

    if (remainingMs <= 0) {
      sleepEndTimeRef.current = null;
      setSleepTimerMinutes(null);
      setSleepRemainingSec(null);
      setIsFadingOut(false);

      if (audio) {
        audio.pause();
        audio.volume = userBaseVolumeRef.current;
        setVolume(userBaseVolumeRef.current);
      }
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      showToast('Đã tự động tắt nhạc theo hẹn giờ');
    } else if (remainingMs <= FADE_DURATION_MS) {
      setIsFadingOut(true);
      const ratio = Math.max(0, remainingMs / FADE_DURATION_MS);
      const fadedVolume = Number((userBaseVolumeRef.current * ratio).toFixed(3));
      if (audio) {
        try {
          audio.volume = fadedVolume;
        } catch {}
      }
      setVolume(fadedVolume);
    }
  }, [showToast]);

  useEffect(() => {
    if (!sleepTimerMinutes) return;
    const timer = setInterval(checkSleepTimerAndFadeOut, 500);
    return () => clearInterval(timer);
  }, [sleepTimerMinutes, checkSleepTimerAndFadeOut]);

  // Pre-fetch bài tiếp theo trước khi hết bài 25s (hoặc gợi ý bài cuối trong 35s cuối nếu tắt lặp)
  const maybePrefetchNextTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !isFinite(audio.duration)) return;

    const timeLeft = audio.duration - audio.currentTime;
    const shouldPrefetchShortTrack = audio.duration <= 25 && audio.currentTime >= 2;
    const q = queueRef.current;
    const nextIdx = currentIndexRef.current + 1;

    // Nếu đang ở bài cuối cùng & bật Gợi ý & không lặp Playlist -> chuẩn bị danh sách gợi ý ở 35s cuối & chỉ tách sẵn link bài kế trong 15s cuối (tránh đứt quãng AudioSession trên iPhone khi tắt màn hình)
    if (nextIdx >= q.length) {
      if (
        (timeLeft <= 35 || shouldPrefetchShortTrack) &&
        suggestionsEnabledRef.current &&
        playlistRepeatModeRef.current === 'off' &&
        q[currentIndexRef.current]
      ) {
        if (suggestionsRef.current.length === 0) {
          void ensureRelatedForTrack(q[currentIndexRef.current]);
        } else if (timeLeft <= 15 || shouldPrefetchShortTrack) {
          const recentUrls = new Set(q.slice(-6).map((t) => t.originalUrl));
          const nextSuggest =
            suggestionsRef.current.find((s) => !recentUrls.has(s.url)) ||
            suggestionsRef.current[0];

          if (nextSuggest?.url) {
            const cached = prefetchedSuggestCacheRef.current.get(nextSuggest.url);
            const ttl =
              nextSuggest.source === 'soundcloud' ? SOUNDCLOUD_TTL_MS : STREAM_TTL_MS;
            const isFresh =
              cached &&
              cached.audioUrl &&
              cached.extractedAt &&
              Date.now() - cached.extractedAt <= ttl;

            if (!isFresh && prefetchingSuggestUrlRef.current !== nextSuggest.url) {
              prefetchingSuggestUrlRef.current = nextSuggest.url;
              fetchFreshTrack(nextSuggest.url, {
                title: nextSuggest.title,
                author: nextSuggest.author,
                thumbnail: nextSuggest.thumbnail,
              })
                .then((data) => {
                  if (data?.audioUrl) {
                    cachePrefetchedSuggestion(nextSuggest.url, {
                      ...data,
                      id: nextSuggest.id,
                      title: nextSuggest.title || data.title,
                      author: nextSuggest.author || data.author,
                      thumbnail: nextSuggest.thumbnail || data.thumbnail,
                      source: data.source || nextSuggest.source,
                    });
                  }
                })
                .catch(() => {})
                .finally(() => {
                  if (prefetchingSuggestUrlRef.current === nextSuggest.url) {
                    prefetchingSuggestUrlRef.current = null;
                  }
                });
            }
          }
        }
      }
      return;
    }

    if (timeLeft > 25 && !shouldPrefetchShortTrack) return;

    const nextTrack = q[nextIdx];
    const ttl = nextTrack.source === 'soundcloud' ? SOUNDCLOUD_TTL_MS : STREAM_TTL_MS;
    const isExpired =
      !nextTrack.audioUrl ||
      !nextTrack.extractedAt ||
      Date.now() - nextTrack.extractedAt > ttl;

    if (isExpired && prefetchingTrackIdRef.current !== nextTrack.id) {
      prefetchingTrackIdRef.current = nextTrack.id;
      ensureValidAudioUrl(nextTrack).finally(() => {
        prefetchingTrackIdRef.current = null;
      });
    }
  }, [cachePrefetchedSuggestion, ensureRelatedForTrack, ensureValidAudioUrl, fetchFreshTrack]);

  const handleManualInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData('text')?.trim();
    if (raw) {
      e.preventDefault();
      e.currentTarget.blur();
      const extracted = raw.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || raw;
      setInputUrl(extracted);
      setPendingUrl(extracted);
      setShowLinkActionModal(true);
    }
  };

  const triggerButtonSuccess = (mode: 'play' | 'queue') => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMode(mode);
    successTimerRef.current = setTimeout(() => {
      setSuccessMode(null);
      successTimerRef.current = null;
    }, 1350);
  };

  const handleExtractUrl = async (mode: 'play' | 'queue', targetUrl?: string) => {
    const finalUrl = (targetUrl ?? pendingUrl ?? inputUrl).trim();
    setError(null);

    if (!finalUrl) {
      setError('Vui lòng dán link TikTok, YouTube, SoundCloud hoặc Spotify.');
      return;
    }

    setShowLinkActionModal(false);
    const unlockPromise = unlockAudioOnUserGesture();
    setSuccessMode(null);
    setLoadingMode(mode);

    try {
      const [result] = await Promise.all([fetchExtractRaw(finalUrl), unlockPromise]);
      setInputUrl('');
      setPendingUrl('');
      setLoadingMode(null);
      triggerButtonSuccess(mode);

      if ('isBatch' in result && result.isBatch) {
        const batchTracks = result.tracks;
        if (batchTracks.length > 0) {
          addToHistory(batchTracks[0]);
          if (mode === 'play' || queue.length === 0) {
            const newQueue = [...queue];
            const insertIdx = currentIndex >= 0 ? currentIndex + 1 : 0;
            newQueue.splice(insertIdx, 0, ...batchTracks);
            setQueue(newQueue);
            queueRef.current = newQueue;
            await playTrackAtIndex(insertIdx, newQueue);
            showToast(`Đang phát ${batchTracks.length} bài: ${result.playlistName}`);
          } else {
            const newQueue = [...queue, ...batchTracks];
            setQueue(newQueue);
            queueRef.current = newQueue;
            showToast(`Đã thêm ${batchTracks.length} bài từ: ${result.playlistName}`);
          }
        }
        return;
      }

      const trackInfo = result as TrackData;
      addToHistory(trackInfo);

      if (mode === 'play' || queue.length === 0) {
        const newQueue = [...queue];
        const insertIdx = currentIndex >= 0 ? currentIndex + 1 : 0;
        newQueue.splice(insertIdx, 0, trackInfo);
        setQueue(newQueue);
        queueRef.current = newQueue;
        await playTrackAtIndex(insertIdx, newQueue);
        showToast(`Đang phát: ${trackInfo.title}`);
      } else {
        const newQueue = [...queue, trackInfo];
        setQueue(newQueue);
        queueRef.current = newQueue;
        showToast(`Đã thêm bài tiếp theo: ${trackInfo.title}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi trích xuất.';
      setError(msg);
    } finally {
      setLoadingMode(null);
    }
  };

  const playSuggestedTrack = async (item: SuggestedTrack, playNow: boolean) => {
    void unlockAudioOnUserGesture();
    const cached = prefetchedSuggestCacheRef.current.get(item.url);
    const ttl = item.source === 'soundcloud' ? SOUNDCLOUD_TTL_MS : STREAM_TTL_MS;
    const isFresh =
      cached &&
      cached.audioUrl &&
      cached.extractedAt &&
      Date.now() - cached.extractedAt <= ttl;

    const track: TrackData = isFresh
      ? cached
      : {
          id: item.id,
          originalUrl: item.url,
          audioUrl: '',
          title: item.title,
          author: item.author,
          thumbnail: item.thumbnail,
          source: item.source,
          mimeType: 'audio/mp4',
          extractedAt: 0,
        };
    await playFromSavedTrack(track, playNow);
  };

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack && queue.length > 0) {
      void unlockAudioOnUserGesture();
      await playTrackAtIndex(0);
      return;
    }
    if (!currentTrack) return;

    if (audio.paused) {
      if (!audio.src || audio.src === SILENT_AUDIO_URI) {
        void unlockAudioOnUserGesture();
        await playTrackAtIndex(currentIndex);
        return;
      }
      try {
        setIsPlaying(true);
        audioUnlockedRef.current = true;
        await audio.play();
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch {
        setIsPlaying(false);
        await playTrackAtIndex(currentIndex);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  };

  const seekToTime = useCallback(
    (newTime: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = newTime;
      lastPlayTimeRef.current = newTime;
      lastUiSecondRef.current = Math.floor(newTime);
      setCurrentTime(newTime);
      updateMediaSessionPosition();
    },
    [updateMediaSessionPosition]
  );

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    userBaseVolumeRef.current = val;
    if (audioRef.current) {
      try {
        audioRef.current.volume = val;
      } catch {}
    }
  };

  const playFromSavedTrack = async (track: TrackData, playNow: boolean) => {
    void unlockAudioOnUserGesture();

    if (playNow || queue.length === 0) {
      const existingIdx = queue.findIndex((t) => t.id === track.id);
      if (existingIdx !== -1) {
        await playTrackAtIndex(existingIdx);
      } else {
        const insertIdx = currentIndex >= 0 ? currentIndex + 1 : 0;
        const newQueue = [...queue];
        newQueue.splice(insertIdx, 0, track);
        setQueue(newQueue);
        queueRef.current = newQueue;
        await playTrackAtIndex(insertIdx, newQueue);
      }
    } else {
      const newQueue = [...queue, track];
      setQueue(newQueue);
      queueRef.current = newQueue;
      showToast(`Đã thêm tiếp theo: ${track.title}`);
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlaylistName.trim();
    if (!name) return;

    const newPl: Playlist = {
      id: `pl_${Date.now()}`,
      name,
      createdAt: Date.now(),
      tracks: [],
    };
    const updated = [...playlists, newPl];
    savePlaylists(updated);
    setSelectedPlaylistId(newPl.id);
    setNewPlaylistName('');
    showToast(`Đã tạo playlist "${name}"`);
  };

  const scheduleClearDeleteBackups = () => {
    if (undoResetTimerRef.current) clearTimeout(undoResetTimerRef.current);
    undoResetTimerRef.current = setTimeout(() => {
      setDeletedHistoryBackup(null);
      setDeletedPlaylistBackup(null);
      undoResetTimerRef.current = null;
    }, 7000);
  };

  const handleDeletePlaylist = (plId: string) => {
    const idx = playlists.findIndex((p) => p.id === plId);
    const target = playlists[idx];
    if (!target) return;
    setDeletedPlaylistBackup({ playlist: target, index: Math.max(0, idx) });
    scheduleClearDeleteBackups();

    const updated = playlists.filter((p) => p.id !== plId);
    savePlaylists(updated);
    if (selectedPlaylistId === plId) {
      setSelectedPlaylistId(updated[0]?.id || null);
    }
    showToast(`Đã xóa playlist "${target.name}"`);
  };

  const handleUndoPlaylistDelete = () => {
    if (!deletedPlaylistBackup) return;
    const { playlist, index } = deletedPlaylistBackup;
    const restored = [...playlists];
    restored.splice(Math.min(index, restored.length), 0, playlist);
    savePlaylists(restored);
    setSelectedPlaylistId(playlist.id);
    setDeletedPlaylistBackup(null);
    showToast(`Đã khôi phục "${playlist.name}"`);
  };

  const handleHoldClearHistory = () => {
    if (history.length === 0) return;
    setDeletedHistoryBackup(history);
    scheduleClearDeleteBackups();
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
    } catch {}
    showToast('Đã xóa toàn bộ lịch sử nghe');
  };

  const handleUndoHistoryDelete = () => {
    if (!deletedHistoryBackup) return;
    setHistory(deletedHistoryBackup);
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(deletedHistoryBackup));
    } catch {}
    setDeletedHistoryBackup(null);
    showToast('Đã khôi phục lịch sử nghe');
  };

  const addTrackToPlaylist = (playlistId: string, track: TrackData) => {
    const updated = playlists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      const exists = pl.tracks.some(
        (t) => t.id === track.id || t.originalUrl === track.originalUrl
      );
      if (exists) return pl;
      return { ...pl, tracks: [...pl.tracks, track] };
    });
    savePlaylists(updated);
    setTrackToAddPlaylist(null);
    const targetPl = playlists.find((p) => p.id === playlistId);
    showToast(`Đã lưu vào "${targetPl?.name || 'Playlist'}"`);
  };

  const toggleFavoriteCurrentTrack = () => {
    if (!currentTrack) return;
    const favPl = playlists[0];
    if (!favPl) {
      const created: Playlist = {
        id: 'pl_default',
        name: 'Nhạc Yêu Thích',
        createdAt: Date.now(),
        tracks: [currentTrack],
      };
      savePlaylists([created]);
      setSelectedPlaylistId(created.id);
      showToast('Đã lưu vào "Nhạc Yêu Thích"');
      return;
    }

    const exists = favPl.tracks.some(
      (t) => t.id === currentTrack.id || t.originalUrl === currentTrack.originalUrl
    );
    const updated = playlists.map((pl, i) => {
      if (i !== 0) return pl;
      return {
        ...pl,
        tracks: exists
          ? pl.tracks.filter(
              (t) => t.id !== currentTrack.id && t.originalUrl !== currentTrack.originalUrl
            )
          : [...pl.tracks, currentTrack],
      };
    });
    savePlaylists(updated);
    showToast(exists ? `Đã bỏ khỏi "${favPl.name}"` : `Đã thả tim vào "${favPl.name}"`);
  };

  const removeTrackFromPlaylist = (playlistId: string, trackId: string) => {
    const updated = playlists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      return { ...pl, tracks: pl.tracks.filter((t) => t.id !== trackId) };
    });
    savePlaylists(updated);
  };

  const removeQueueItemWithUndo = (idx: number) => {
    const target = queue[idx];
    if (!target) return;
    swipeResetSeqRef.current += 1;
    setSwipeUndo({
      type: 'queue',
      item: target,
      index: idx,
      resetKey: swipeResetSeqRef.current,
    });

    const newQ = queue.filter((_, i) => i !== idx);
    setQueue(newQ);
    queueRef.current = newQ;

    if (idx < currentIndex) {
      setCurrentIndex((c) => c - 1);
    } else if (idx === currentIndex && newQ.length > 0) {
      playTrackAtIndex(Math.min(idx, newQ.length - 1), newQ);
    } else if (newQ.length === 0) {
      setCurrentIndex(-1);
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  };

  const removePlaylistTrackWithUndo = (playlistId: string, track: TrackData, idx: number) => {
    swipeResetSeqRef.current += 1;
    setSwipeUndo({
      type: 'playlistTrack',
      playlistId,
      item: track,
      index: idx,
      resetKey: swipeResetSeqRef.current,
    });
    removeTrackFromPlaylist(playlistId, track.id);
  };

  const removeHistoryItemWithUndo = (idx: number) => {
    const target = history[idx];
    if (!target) return;
    swipeResetSeqRef.current += 1;
    setSwipeUndo({
      type: 'historyTrack',
      item: target,
      index: idx,
      resetKey: swipeResetSeqRef.current,
    });

    const updated = history.filter((_, i) => i !== idx);
    setHistory(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
    } catch {}
  };

  const handleUndoSwipeDelete = () => {
    if (!swipeUndo) return;
    if (swipeUndo.type === 'queue') {
      const restored = [...queueRef.current];
      const insertAt = Math.min(swipeUndo.index, restored.length);
      restored.splice(insertAt, 0, swipeUndo.item);
      setQueue(restored);
      queueRef.current = restored;
      if (currentIndexRef.current >= 0 && insertAt <= currentIndexRef.current) {
        setCurrentIndex((c) => c + 1);
      } else if (currentIndexRef.current === -1 && restored.length === 1) {
        setCurrentIndex(0);
      }
      showToast(`Đã khôi phục: ${swipeUndo.item.title}`);
    } else if (swipeUndo.type === 'historyTrack') {
      const restored = [...history];
      restored.splice(Math.min(swipeUndo.index, restored.length), 0, swipeUndo.item);
      setHistory(restored);
      try {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(restored));
      } catch {}
      showToast(`Đã đưa lại vào lịch sử: ${swipeUndo.item.title}`);
    } else {
      const updated = playlists.map((pl) => {
        if (pl.id !== swipeUndo.playlistId) return pl;
        const nextTracks = [...pl.tracks];
        nextTracks.splice(Math.min(swipeUndo.index, nextTracks.length), 0, swipeUndo.item);
        return { ...pl, tracks: nextTracks };
      });
      savePlaylists(updated);
      showToast(`Đã đưa lại vào playlist: ${swipeUndo.item.title}`);
    }
    setSwipeUndo(null);
  };

  const playEntirePlaylist = async (playlist: Playlist, startIndex = 0) => {
    if (playlist.tracks.length === 0) {
      showToast('Playlist này chưa có bài nào!');
      return;
    }
    await unlockAudioOnUserGesture();
    playlistRepeatOnceCountRef.current = 0;
    setQueue(playlist.tracks);
    queueRef.current = playlist.tracks;
    setActiveTab('queue');
    await playTrackAtIndex(startIndex, playlist.tracks);
    showToast(`Phát playlist: ${playlist.name}`);
  };

  // Xuất / Nhập Backup JSON cho tính năng chuyển trình duyệt không mất bài
  const handleExportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      playlists,
      history,
      queue,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquidaudio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất file Backup dữ liệu');
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.playlists)) {
        savePlaylists(parsed.playlists);
        if (parsed.playlists[0]) setSelectedPlaylistId(parsed.playlists[0].id);
      }
      if (Array.isArray(parsed.history)) {
        setHistory(parsed.history);
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(parsed.history));
      }
      if (Array.isArray(parsed.queue) && parsed.queue.length > 0) {
        setQueue(parsed.queue);
        setCurrentIndex(0);
      }
      showToast('Đã khôi phục toàn bộ bài hát & playlist!');
      setShowSettingsModal(false);
    } catch {
      setError('File Backup không hợp lệ.');
    }
  };

  // Đăng nhập / Tạo mới tài khoản Sync (Tên <=10 ký tự không dấu + PIN 4 số)
  const handleLoginSync = async (username: string, pin: string) => {
    setSyncStatus('syncing');
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'auth',
        username,
        pin,
        localData: {
          playlists: playlistsRef.current,
          history: historyRef.current,
          queue: queueRef.current,
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setSyncStatus('error');
      throw new Error(json.error || 'Không thể đăng nhập đồng bộ.');
    }

    const session: SyncSession = { username: json.username, syncKey: json.syncKey };
    setSyncSession(session);
    try {
      localStorage.setItem(STORAGE_KEYS.SYNC_AUTH, JSON.stringify(session));
    } catch {}

    applyCloudLibrary(json);
    setLastSyncedAt(json.updatedAt || Date.now());
    setSyncStatus('synced');
    showToast(
      json.isNew
        ? `Đã tạo @${json.username} & bật đồng bộ!`
        : `Đã đăng nhập @${json.username} & đồng bộ xong!`
    );
  };

  const handleManualSync = async () => {
    if (!syncSession) return;
    setSyncStatus('syncing');
    try {
      // Kéo dữ liệu mới nhất từ Cloud hoặc đẩy nếu vừa chỉnh sửa
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pull',
          username: syncSession.username,
          syncKey: syncSession.syncKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      applyCloudLibrary(json);
      setLastSyncedAt(json.updatedAt || Date.now());
      setSyncStatus('synced');
      showToast('Đã đồng bộ dữ liệu mới nhất!');
    } catch (err) {
      setSyncStatus('error');
      showToast(err instanceof Error ? err.message : 'Đồng bộ thất bại');
    }
  };

  const handleLogoutSync = () => {
    setSyncSession(null);
    setSyncStatus('idle');
    setLastSyncedAt(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.SYNC_AUTH);
    } catch {}
    showToast('Đã đăng xuất đồng bộ Cloud');
  };

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];
  const favoritesPlaylist = playlists[0];
  const isCurrentTrackLiked = Boolean(
    currentTrack &&
      favoritesPlaylist?.tracks.some(
        (t) => t.id === currentTrack.id || t.originalUrl === currentTrack.originalUrl
      )
  );
  const copyableTrackLink = currentTrack
    ? currentTrack.originalUrl.startsWith('spotify-search://')
      ? /^[a-zA-Z0-9]{22}$/.test(currentTrack.id.replace(/^sp_/, ''))
        ? `https://open.spotify.com/track/${currentTrack.id.replace(/^sp_/, '')}`
        : `${currentTrack.title} - ${currentTrack.author}`
      : currentTrack.originalUrl
    : '';
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const isCustomSleepTime =
    sleepTimerMinutes !== null && ![15, 30, 45].includes(sleepTimerMinutes);

  const detectedLinkSource = /tiktok\.com/i.test(pendingUrl || inputUrl)
    ? 'TikTok'
    : /(soundcloud\.com|soundcloud\.app\.goo\.gl)/i.test(pendingUrl || inputUrl)
    ? 'SoundCloud'
    : /(open\.spotify\.com|spotify\.link)/i.test(pendingUrl || inputUrl)
    ? 'Spotify'
    : /(youtube\.com|youtu\.be)/i.test(pendingUrl || inputUrl)
    ? 'YouTube'
    : null;

  const dockItems = useMemo(
    () => [
      {
        id: 'player',
        label: 'Nghe nhạc',
        isActive: activePage === 'player',
        gradFrom: '#22d3ee',
        gradTo: '#6366f1',
        iconPath: (
          <>
            <path
              d="M19 30V15l12-3v15"
              stroke="#fff"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="15.5" cy="30.5" r="3.8" fill="#fff" />
            <circle cx="27.5" cy="27.5" r="3.8" fill="#fff" />
          </>
        ),
        onSelect: () => {
          goToPage('player');
        },
      },
      {
        id: 'discover',
        label: 'Tìm & Gợi ý',
        isActive: activePage === 'discover',
        gradFrom: '#f43f5e',
        gradTo: '#ec4899',
        iconPath: (
          <>
            <circle
              cx="20.5"
              cy="20.5"
              r="8"
              stroke="#fff"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M26.5 26.5l7 7"
              stroke="#fff"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </>
        ),
        onSelect: () => {
          goToPage('discover');
        },
      },
      {
        id: 'settings',
        label: 'Cài đặt',
        isActive: showSettingsModal,
        gradFrom: '#475569',
        gradTo: '#0f172a',
        iconPath: (
          <>
            <circle
              cx="23"
              cy="23"
              r="5.5"
              stroke="#fff"
              strokeWidth="2.6"
              fill="none"
            />
            <path
              d="M23 11v3M23 32v3M11 23h3M32 23h3M14.5 14.5l2.2 2.2M29.3 29.3l2.2 2.2M31.5 14.5l-2.2 2.2M16.7 29.3l-2.2 2.2"
              stroke="#fff"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </>
        ),
        onSelect: () => {
          setShowSettingsModal(true);
        },
      },
    ],
    [activePage, showSettingsModal, goToPage]
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden flex flex-col">
      {/* NỀN NEON LIQUID GLASS (RADIAL GRADIENT THUẦN GPU, KHÔNG BLUR NẶNG GÂY LAG iOS) */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-[#05070e] pointer-events-none">
        <div
          className="animate-orb-slow absolute -top-28 -left-28 w-[26rem] h-[26rem] rounded-full will-change-transform"
          style={{
            background:
              'radial-gradient(circle, rgba(34,211,238,0.22) 0%, rgba(34,211,238,0.06) 45%, transparent 72%)',
          }}
        />
        <div
          className="animate-orb-reverse absolute top-1/4 -right-28 w-[26rem] h-[26rem] rounded-full will-change-transform"
          style={{
            background:
              'radial-gradient(circle, rgba(236,72,153,0.2) 0%, rgba(236,72,153,0.05) 45%, transparent 72%)',
          }}
        />
        <div
          className="animate-orb-slow absolute -bottom-32 left-1/4 w-[26rem] h-[26rem] rounded-full will-change-transform"
          style={{
            background:
              'radial-gradient(circle, rgba(129,140,248,0.2) 0%, rgba(129,140,248,0.05) 45%, transparent 72%)',
          }}
        />

        {currentTrack && (
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(currentTrack.thumbnail)}`}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="la-ambient-backdrop"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070e]/55 via-[#05070e]/45 to-[#05070e]/90" />
      </div>

      {/* HIỆU ỨNG TUYẾT RƠI NHÈ NHẸ */}
      <Snowfall />

      {/* TOAST NỔI KIỂU DYNAMIC ISLAND XẾP CHỒNG (#070) */}
      <DynamicIslandToasts toasts={toasts} onDismiss={dismissToast} />

      {/* POPUP LOADING QUAY VÒNG KIỂU APPLE HUD (KHI MỞ WEB HOẶC ĐANG TÁCH BÀI) */}
      {(loadingMode !== null || isBootLoading) && (
        <div className="la-modal-backdrop fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="la-modal-sheet liquid-glass rounded-[34px] px-10 py-8 flex flex-col items-center justify-center gap-4 min-w-[210px] shadow-[0_24px_70px_rgba(0,0,0,0.75)]">
            <AppleSpinner size={54} className="text-white" />
            <span className="text-base font-semibold tracking-tight text-white/95">
              Loading...
            </span>
          </div>
        </div>
      )}

      {/* POPUP 2 Ô TRÁI / PHẢI SAU KHI DÁN LINK (PHÁT NGAY | TIẾP THEO) */}
      {showLinkActionModal && (
        <div className="la-modal-backdrop fixed inset-0 z-50 bg-black/72 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="la-modal-sheet liquid-glass w-full max-w-sm rounded-[34px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-cyan-400/15 border border-cyan-300/30 flex items-center justify-center">
                  <ClipboardPaste className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {detectedLinkSource
                      ? `Đã nhận link ${detectedLinkSource}`
                      : 'Dán link & Chọn phát'}
                  </h3>
                  <p className="text-xs text-white/65">
                    Chọn Phát ngay hoặc thêm vào Tiếp theo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkActionModal(false)}
                className="liquid-btn w-9 h-9 rounded-full flex items-center justify-center text-white/75 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative flex items-center">
              <Link2 className="w-4 h-4 text-cyan-300/70 absolute left-3.5 pointer-events-none" />
              <input
                ref={popupInputRef}
                type="url"
                value={pendingUrl}
                onChange={(e) => {
                  setPendingUrl(e.target.value);
                  setInputUrl(e.target.value);
                }}
                placeholder="Chạm giữ để Dán link TikTok / YT / SoundCloud / Spotify..."
                className="w-full pl-10 pr-9 py-3 text-[15px] bg-black/40 border border-white/15 rounded-2xl text-white placeholder-white/45 focus:outline-none focus:border-cyan-400/60"
              />
              {pendingUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingUrl('');
                    setInputUrl('');
                    popupInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 p-1 rounded-full text-white/50 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <LiquidGlassButton
                type="button"
                variant="primary"
                disabled={!pendingUrl.trim()}
                isLoading={loadingMode === 'play'}
                onClick={() => handleExtractUrl('play', pendingUrl)}
                className="py-4 px-3 rounded-2xl font-semibold text-sm flex flex-col items-center justify-center gap-1.5 disabled:opacity-45"
              >
                <span className="flex flex-col items-center gap-1.5">
                  <Play className="w-5 h-5 fill-current" />
                  <span>Phát ngay</span>
                </span>
              </LiquidGlassButton>

              <LiquidGlassButton
                type="button"
                variant="glass"
                disabled={!pendingUrl.trim()}
                isLoading={loadingMode === 'queue'}
                onClick={() => handleExtractUrl('queue', pendingUrl)}
                className="py-4 px-3 rounded-2xl font-semibold text-sm text-white flex flex-col items-center justify-center gap-1.5 disabled:opacity-45"
              >
                <span className="flex flex-col items-center gap-1.5">
                  <ListPlus className="w-5 h-5 text-cyan-300" />
                  <span>Tiếp theo</span>
                </span>
              </LiquidGlassButton>
            </div>
          </div>
        </div>
      )}

      {/* POPUP CÀI ĐẶT (BÁNH RĂNG GÓC PHẢI TRÊN CÙNG) */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        lockScreenControlMode={lockScreenControlMode}
        onChangeLockScreenMode={handleChangeLockScreenMode}
        volume={volume}
        onChangeVolume={handleVolumeChange}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        savedCount={{ playlists: playlists.length, history: history.length }}
        syncSession={syncSession}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        onLoginSync={handleLoginSync}
        onManualSync={handleManualSync}
        onLogoutSync={handleLogoutSync}
        suggestionsEnabled={suggestionsEnabled}
        onToggleSuggestions={handleToggleSuggestions}
      />

      {/* POPUP ĐỒNG HỒ ĐẾM NGƯỢC 1 TIẾNG (DI TAY KÉO 1-60 PHÚT) */}
      <CircularTimerModal
        isOpen={showClockModal}
        initialMinutes={
          sleepRemainingSec
            ? Math.max(1, Math.min(60, Math.ceil(sleepRemainingSec / 60)))
            : sleepTimerMinutes || 20
        }
        onClose={() => setShowClockModal(false)}
        onConfirm={(mins) => {
          setShowClockModal(false);
          startSleepTimer(mins);
        }}
      />

      {/* MODAL CHỌN PLAYLIST */}
      {trackToAddPlaylist && (
        <div className="la-modal-backdrop fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="la-modal-sheet liquid-glass w-full max-w-sm rounded-[32px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold tracking-tight text-white">
                Thêm vào Playlist
              </h3>
              <button
                onClick={() => setTrackToAddPlaylist(null)}
                className="liquid-btn w-9 h-9 rounded-full flex items-center justify-center text-white/75 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-white/70 truncate">{trackToAddPlaylist.title}</p>
            <div className="space-y-2 max-h-52 overflow-y-auto no-scrollbar">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => addTrackToPlaylist(pl.id, trackToAddPlaylist)}
                  className="liquid-btn w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left hover:bg-white/15"
                >
                  <span className="text-sm font-medium text-white">{pl.name}</span>
                  <span className="text-xs text-cyan-300 tabular-nums">
                    {pl.tracks.length} bài
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        ref={pagerRef}
        onScroll={handlePagerScroll}
        className="la-pager no-scrollbar relative z-10"
      >
        {/* ================= TRANG 0 (MẶC ĐỊNH): NGHE NHẠC ================= */}
        <section
          aria-label="Trang Nghe nhạc"
          className="la-pager-page px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(10.5rem,calc(env(safe-area-inset-bottom)+9rem))] flex flex-col items-center"
        >
          <div className="w-full max-w-[460px] space-y-4 my-1">
            {/* THANH TIÊU ĐỀ + GỢI Ý VUỐT PHẢI & CÀI ĐẶT */}
            <header className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full neon-orb-primary flex items-center justify-center shrink-0">
                  {isPlaying ? (
                    <AudioLines className="w-4.5 h-4.5 text-white animate-pulse" />
                  ) : (
                    <Music2 className="w-4.5 h-4.5 text-white" />
                  )}
                </div>
                <span className="text-xl font-bold tracking-tight text-white truncate">
                  LiquidAudio
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => goToPage('discover')}
                  className="liquid-pill px-2.5 py-2 rounded-full flex items-center gap-1 text-[13px] font-semibold text-cyan-200 hover:text-white active:scale-95 transition"
                  title="Vuốt sang phải để tìm bài & xem gợi ý"
                >
                  <Search className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Tìm</span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/60" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="liquid-pill px-3.5 py-2 rounded-full flex items-center gap-1.5 text-[13px] font-semibold text-white/95 hover:text-white active:scale-95 transition"
                >
                  {syncSession && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        syncStatus === 'error'
                          ? 'bg-rose-400'
                          : syncStatus === 'syncing'
                          ? 'bg-amber-300 animate-pulse'
                          : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      }`}
                    />
                  )}
                  <Settings className="w-4 h-4 text-cyan-300" />
                  <span>{syncSession ? `@${syncSession.username}` : 'Cài đặt'}</span>
                </button>
              </div>
            </header>

        {/* THÔNG BÁO TRẠNG THÁI MẠNG & TỰ NỐI PHÁT NHẠC (#091) */}
        <NetworkStatusBanner
          onReconnect={() => {
            if (queueRef.current[currentIndexRef.current] && audioRef.current?.paused) {
              recoverCurrentTrack();
            }
          }}
        />

        {/* KHỐI 1: Ô DÁN LINK KIỂU VIBECONVERT + NÚT LIQUID GLASS (#001 & #228) */}
        <CursorGlowCard className="p-3.5 space-y-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 shadow-inner">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4 text-cyan-300" />
            </div>
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onPaste={handleManualInputPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputUrl.trim()) {
                  e.preventDefault();
                  e.currentTarget.blur();
                  setPendingUrl(inputUrl.trim());
                  setShowLinkActionModal(true);
                }
              }}
              placeholder="Dán link TikTok, YouTube, SoundCloud, Spotify..."
              className="w-full py-2.5 text-base bg-transparent text-white placeholder-white/50 focus:outline-none"
            />
            {inputUrl && (
              <button
                type="button"
                onClick={() => setInputUrl('')}
                className="px-3 py-1.5 rounded-xl bg-white/10 text-cyan-300 text-[13px] font-medium hover:bg-white/15 shrink-0"
                title="Xóa"
              >
                Xóa
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <LiquidGlassButton
              type="button"
              variant="primary"
              disabled={loadingMode !== null}
              isLoading={loadingMode === 'play'}
              isSuccess={successMode === 'play'}
              successLabel="Đang phát"
              onClick={() => handleExtractUrl('play', inputUrl)}
              className="py-3.5 px-4 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Phát ngay</span>
            </LiquidGlassButton>

            <LiquidGlassButton
              type="button"
              variant="glass"
              disabled={loadingMode !== null}
              isLoading={loadingMode === 'queue'}
              isSuccess={successMode === 'queue'}
              successLabel="Đã thêm"
              onClick={() => handleExtractUrl('queue', inputUrl)}
              className="py-3.5 px-4 rounded-2xl font-semibold text-[15px] text-cyan-200 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <ListPlus className="w-4 h-4 text-cyan-300" />
              <span>+ Tiếp theo</span>
            </LiquidGlassButton>
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-300/30 text-rose-100 text-[15px] leading-snug flex items-start gap-2.5 backdrop-blur-xl">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
              <span>{error}</span>
            </div>
          )}
        </CursorGlowCard>

        {/* KHỐI 2: NOW PLAYING CARD (SÓNG ÂM + HỆ HÀO QUANG + PLAY MORPH #007 + GLOW #228) */}
        {currentTrack && (
          <CursorGlowCard ref={nowPlayingCardRef} className="p-5 space-y-4">
            {/* Header Now Playing */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-300/95">
                    NOW PLAYING
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/12 text-xs font-semibold text-white/85 tabular-nums">
                    {currentIndex + 1}/{queue.length}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-400/15 border border-cyan-300/30 text-[11px] font-bold uppercase text-cyan-200">
                    {currentTrack.source === 'tiktok'
                      ? 'TikTok'
                      : currentTrack.source === 'soundcloud'
                      ? 'SoundCloud'
                      : currentTrack.source === 'spotify'
                      ? 'Spotify'
                      : 'YouTube'}
                  </span>
                </div>

                <h2 className="text-[21px] leading-snug font-bold tracking-tight text-white truncate pt-0.5">
                  {currentTrack.title}
                </h2>
                <p className="text-[15.5px] text-white/70 truncate">{currentTrack.author}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <HeartBurstButton
                  liked={isCurrentTrackLiked}
                  onToggle={toggleFavoriteCurrentTrack}
                />
                <CopyLinkButton
                  textToCopy={copyableTrackLink}
                  onCopied={() => showToast('Đã sao chép link bài hát')}
                />
                <button
                  type="button"
                  onClick={() => setTrackToAddPlaylist(currentTrack)}
                  title="Lưu bài vào Playlist"
                  className="liquid-btn w-10 h-10 rounded-full flex items-center justify-center text-white/85 hover:text-cyan-300 shrink-0"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sóng âm Cyan -> Pink đồng bộ tiến trình + Ảnh đại diện tròn với hào quang xoay */}
            <div className="flex flex-col items-center justify-center gap-3 py-1">
              <WaveformVisualizer
                isPlaying={isPlaying}
                progressPct={progressPct}
                duration={duration}
              />

              <div className={`la-art-portal ${isPlaying ? 'is-playing' : ''}`}>
                <span className="la-sonar-ring" aria-hidden="true" />
                <span className="la-sonar-ring is-second" aria-hidden="true" />
                <div className="la-art-aura" aria-hidden="true" />
                <div
                  className={`relative w-24 h-24 rounded-full overflow-hidden border-[2.5px] border-cyan-300/70 shadow-[0_0_24px_rgba(34,211,238,0.28)] transition-transform duration-500 ${
                    isPlaying ? 'scale-100' : 'scale-95 opacity-90'
                  }`}
                >
                  <img
                    src={`/api/image-proxy?url=${encodeURIComponent(currentTrack.thumbnail)}`}
                    alt={currentTrack.title}
                    decoding="async"
                    className="la-vinyl-spin w-full h-full object-cover"
                  />
                  <span className="la-art-glint" aria-hidden="true" />
                </div>
              </div>
            </div>

            {/* Bộ nút điều khiển trung tâm: -5s | << | Play/Pause Morph Orb | >> | +5s */}
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                type="button"
                onClick={() => seekRelative(-5)}
                className="liquid-btn px-3 h-10 rounded-full flex items-center gap-1 text-white/85 hover:text-cyan-300"
                title="Tua lùi 5 giây"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-[13px] font-semibold tabular-nums">-5s</span>
              </button>

              <button
                type="button"
                onClick={handlePrevTrack}
                className="liquid-btn w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:text-white"
                title="Bài trước"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              <PlayPauseMorphOrb
                isPlaying={isPlaying}
                progress={duration > 0 ? currentTime / duration : 0}
                onClick={togglePlayPause}
              />

              <button
                type="button"
                onClick={handleNextTrack}
                className="liquid-btn w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:text-white"
                title="Bài tiếp theo"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>

              <button
                type="button"
                onClick={() => seekRelative(5)}
                className="liquid-btn px-3.5 h-10 rounded-full flex items-center gap-1 text-white/90 hover:text-pink-300"
                title="Tua tiến 5 giây"
              >
                <span className="text-[13px] font-semibold tabular-nums">+5s</span>
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Thanh tiến trình có bong bóng nghiêng theo tốc độ kéo (#017) */}
            <div className="space-y-1.5">
              <TiltingSeekSlider
                value={currentTime}
                max={duration}
                formatTime={formatTime}
                onSeek={seekToTime}
              />
              <div className="flex justify-between text-[13px] font-medium text-white/75 tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* HÀNG LẶP BÀI & LẶP PLAYLIST (1 LẦN / VĨNH VIỄN / TẮT) + HẸN GIỜ */}
            <div className="pt-3 border-t border-white/10 space-y-3">
              {/* Hàng Lặp 1 bài & Lặp Playlist */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={cycleTrackRepeatMode}
                  className={`py-2.5 px-2 rounded-2xl text-[12.5px] sm:text-[13px] whitespace-nowrap font-semibold flex items-center justify-center gap-1 border transition active:scale-95 ${
                    trackRepeatMode !== 'off'
                      ? 'bg-cyan-400/20 border-cyan-300/50 text-cyan-200'
                      : 'bg-white/5 border-white/10 text-white/80 hover:text-white'
                  }`}
                >
                  {trackRepeatMode === 'once' ? (
                    <Repeat1 className="w-4 h-4 shrink-0" />
                  ) : (
                    <Repeat className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {trackRepeatMode === 'off'
                      ? 'Lặp bài: Tắt'
                      : trackRepeatMode === 'once'
                      ? 'Lặp bài: 1 lần'
                      : 'Lặp bài: ∞'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={cyclePlaylistRepeatMode}
                  className={`py-2.5 px-2 rounded-2xl text-[12.5px] sm:text-[13px] whitespace-nowrap font-semibold flex items-center justify-center gap-1 border transition active:scale-95 ${
                    playlistRepeatMode !== 'off'
                      ? 'bg-pink-500/20 border-pink-400/50 text-pink-200'
                      : 'bg-white/5 border-white/10 text-white/80 hover:text-white'
                  }`}
                >
                  <Repeat2 className="w-4 h-4 shrink-0" />
                  <span>
                    {playlistRepeatMode === 'off'
                      ? 'Lặp Playlist: Tắt'
                      : playlistRepeatMode === 'once'
                      ? 'Lặp Playlist: 1 lần'
                      : 'Lặp Playlist: ∞'}
                  </span>
                </button>
              </div>

              {/* Hàng Hẹn giờ 15 / 30 / 45 phút + Đồng hồ 1-60p */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[13px] text-white/85">
                  <Timer className="w-4 h-4 text-cyan-300" />
                  <span className="font-medium">Hẹn giờ:</span>
                  {sleepRemainingSec !== null && (
                    <span className="font-semibold text-cyan-300 tabular-nums">
                      {formatTime(sleepRemainingSec)}
                      {isFadingOut ? ' • Fade-out' : ''}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {[15, 30, 45].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() =>
                        startSleepTimer(sleepTimerMinutes === mins ? null : mins)
                      }
                      className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition active:scale-95 ${
                        sleepTimerMinutes === mins
                          ? 'neon-orb-primary text-white shadow'
                          : 'bg-white/8 hover:bg-white/15 border border-white/12 text-white/85'
                      }`}
                    >
                      {mins}p
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setShowClockModal(true)}
                    title="Đồng hồ đếm ngược 1–60 phút"
                    className={`px-3 py-1.5 rounded-full text-[13px] font-semibold flex items-center gap-1 transition active:scale-95 ${
                      isCustomSleepTime
                        ? 'neon-orb-primary text-white shadow'
                        : 'bg-white/10 hover:bg-white/20 border border-white/15 text-cyan-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {isCustomSleepTime && <span>{sleepTimerMinutes}p</span>}
                  </button>

                  {sleepTimerMinutes !== null && (
                    <button
                      type="button"
                      onClick={() => startSleepTimer(null)}
                      className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-rose-500/20 border border-rose-300/30 text-rose-200"
                    >
                      Tắt
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CursorGlowCard>
        )}

        {/* KHỐI 3: DANH SÁCH TIẾP THEO • PLAYLIST • LỊCH SỬ (#039 & #228) */}
        <CursorGlowCard ref={libraryCardRef} className="p-4 space-y-3.5">
          <SlidingPillTabs
            activeTab={activeTab}
            onChange={(nextTab, dir) => {
              setTabDirection(dir);
              setActiveTab(nextTab);
            }}
            tabs={[
              {
                id: 'queue',
                label: `Tiếp (${queue.length})`,
                icon: <ListMusic className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: 'playlists',
                label: 'Playlist',
                icon: <Sparkles className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: 'history',
                label: 'Lịch sử',
                icon: <History className="w-3.5 h-3.5 shrink-0" />,
              },
            ]}
          />

          <div
            key={activeTab}
            role="tabpanel"
            className={`u039-panel ${
              tabDirection > 0 ? 'u039-panel-right' : 'u039-panel-left'
            }`}
          >
          {/* TAB 1: HÀNG ĐỢI TIẾP THEO */}
          {activeTab === 'queue' && (
            <div className="space-y-2.5 max-h-[24rem] overflow-y-auto no-scrollbar u039-stagger">
              {queue.length === 0 ? (
                <p className="text-center text-[15px] text-white/60 py-8">
                  Danh sách phát trống. Hãy dán link ở trên, tìm trong tab Gợi ý hoặc chọn từ Đã nghe!
                </p>
              ) : (
                queue.map((item, idx) => {
                  const isCurrent = idx === currentIndex;
                  return (
                    <SwipeToDeleteRow
                      key={`${item.id}_${idx}`}
                      ariaLabel={`${item.title} - ${item.author}. Vuốt trái hoặc nhấn Delete để xóa`}
                      onDelete={() => removeQueueItemWithUndo(idx)}
                    >
                      <div
                        className={`flex items-center gap-3 p-2.5 rounded-2xl border transition ${
                          isCurrent
                            ? 'bg-cyan-400/12 border-cyan-300/35'
                            : 'bg-[#0b101d]/95 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <span className="w-5 text-center text-[13px] font-semibold text-white/55 tabular-nums shrink-0">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => playTrackAtIndex(idx)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <img
                            src={`/api/image-proxy?url=${encodeURIComponent(item.thumbnail)}`}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            className="w-12 h-12 rounded-xl object-cover bg-white/10 border border-white/15 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-[15.5px] font-semibold truncate ${
                                isCurrent ? 'text-cyan-300' : 'text-white'
                              }`}
                            >
                              {item.title}
                            </p>
                            <p className="text-[13px] text-white/70 truncate">{item.author}</p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTrackToAddPlaylist(item)}
                          title="Lưu vào Playlist"
                          className="shrink-0 p-2 text-white/60 hover:text-cyan-300 transition"
                        >
                          <FolderPlus className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeQueueItemWithUndo(idx)}
                          title="Xóa khỏi hàng đợi"
                          className="shrink-0 p-2 text-rose-300/80 hover:text-rose-200 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </SwipeToDeleteRow>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: PLAYLIST NHIỀU BÀI & PHÁT LIÊN TỤC */}
          {activeTab === 'playlists' && (
            <div className="space-y-3">
              <form onSubmit={handleCreatePlaylist} className="flex gap-2">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Tên playlist mới (VD: Chill Đêm)..."
                    className="flex-1 min-w-0 px-3.5 py-2.5 text-base bg-black/35 border border-white/12 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:border-cyan-400/50"
                  />
                  <button
                    type="submit"
                    className="neon-orb-primary px-4 py-2.5 rounded-2xl text-white text-[15px] font-semibold flex items-center gap-1 shrink-0 active:scale-95 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tạo</span>
                  </button>
                </form>

                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => setSelectedPlaylistId(pl.id)}
                      className={`px-3.5 py-2 rounded-full text-[13px] font-medium shrink-0 border transition ${
                        selectedPlaylist?.id === pl.id
                          ? 'bg-cyan-400/20 border-cyan-300/50 text-cyan-200'
                          : 'bg-white/5 border-white/10 text-white/80 hover:text-white'
                      }`}
                    >
                      {pl.name} ({pl.tracks.length})
                    </button>
                  ))}
                </div>

                {deletedPlaylistBackup && (
                  <HoldToDeleteUndoBar
                    message={`Đã xóa playlist "${deletedPlaylistBackup.playlist.name}"`}
                    onUndo={handleUndoPlaylistDelete}
                  />
                )}

                {selectedPlaylist && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10">
                      <div className="min-w-0">
                        <h3 className="text-[15.5px] font-semibold text-white truncate">
                          {selectedPlaylist.name}
                        </h3>
                        <p className="text-[13px] text-white/70">
                          {selectedPlaylist.tracks.length} bài • Phát tự động liên tục
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => playEntirePlaylist(selectedPlaylist, 0)}
                          className="neon-orb-primary px-3.5 py-2 rounded-full text-white text-[13px] font-semibold flex items-center gap-1 active:scale-95 transition"
                        >
                          <PlayCircle className="w-4 h-4" />
                          <span>Phát tất cả</span>
                        </button>
                        {playlists.length > 1 && (
                          <HoldToDeleteButton
                            label="Giữ xóa"
                            holdingLabel="Đang giữ..."
                            ariaLabel={`Nhấn giữ để xóa playlist ${selectedPlaylist.name}`}
                            onConfirm={() => handleDeletePlaylist(selectedPlaylist.id)}
                          />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar u039-stagger">
                      {selectedPlaylist.tracks.length === 0 ? (
                        <p className="text-center text-[15px] text-white/60 py-6">
                          Playlist trống. Bấm biểu tượng thư mục (+) trên bài hát để thêm vào đây!
                        </p>
                      ) : (
                        selectedPlaylist.tracks.map((item, idx) => (
                          <SwipeToDeleteRow
                            key={`${item.id}_${idx}`}
                            ariaLabel={`${item.title}. Vuốt trái hoặc nhấn Delete để xóa khỏi playlist`}
                            onDelete={() =>
                              removePlaylistTrackWithUndo(selectedPlaylist.id, item, idx)
                            }
                          >
                            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#0b101d]/95 border border-white/10 hover:bg-white/10 transition">
                              <span className="w-5 text-center text-[13px] font-semibold text-white/55 tabular-nums shrink-0">
                                {idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => playEntirePlaylist(selectedPlaylist, idx)}
                                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                              >
                                <img
                                  src={`/api/image-proxy?url=${encodeURIComponent(
                                    item.thumbnail
                                  )}`}
                                  alt={item.title}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-11 h-11 rounded-xl object-cover bg-white/10 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[15.5px] font-medium text-white truncate">
                                    {item.title}
                                  </p>
                                  <p className="text-[13px] text-white/70 truncate">
                                    {item.author}
                                  </p>
                                </div>
                              </button>
                            <button
                              type="button"
                              onClick={() =>
                                removePlaylistTrackWithUndo(selectedPlaylist.id, item, idx)
                              }
                              className="shrink-0 p-2 text-rose-300/80 hover:text-rose-200 transition"
                              title="Xóa khỏi Playlist"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </SwipeToDeleteRow>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LỊCH SỬ BÀI TỪNG NGHE */}
          {activeTab === 'history' && (
            <div className="space-y-2.5 max-h-[24rem] overflow-y-auto no-scrollbar u039-stagger">
              {deletedHistoryBackup && (
                <HoldToDeleteUndoBar
                  message={`Đã xóa ${deletedHistoryBackup.length} bài trong lịch sử`}
                  onUndo={handleUndoHistoryDelete}
                />
              )}

              {history.length === 0 ? (
                <p className="text-center text-[15px] text-white/60 py-8">
                  Lịch sử trống. Các bài từng nghe sẽ lưu lại tại đây để lần sau ấn vô là phát ngay!
                </p>
              ) : (
                <>
                  <div className="flex justify-between items-center gap-2 px-1 mb-1">
                    <span className="text-[13px] text-white/70">
                      Ấn vào bài để phát ngay
                    </span>
                    <HoldToDeleteButton
                      label="Xóa tất cả"
                      holdingLabel="Đang giữ..."
                      ariaLabel="Nhấn giữ để xóa toàn bộ lịch sử nghe"
                      onConfirm={handleHoldClearHistory}
                    />
                  </div>
                  {history.map((item, idx) => (
                    <SwipeToDeleteRow
                      key={`${item.id}_${idx}`}
                      ariaLabel={`${item.title} - ${item.author}. Vuốt trái hoặc bấm thùng rác để xóa khỏi lịch sử`}
                      onDelete={() => removeHistoryItemWithUndo(idx)}
                    >
                      <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-[#0b101d]/95 border border-white/10 hover:bg-white/10 transition">
                        <span className="w-5 text-center text-[13px] font-semibold text-white/55 tabular-nums shrink-0">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => playFromSavedTrack(item, true)}
                          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                        >
                          <img
                            src={`/api/image-proxy?url=${encodeURIComponent(item.thumbnail)}`}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            className="w-11 h-11 rounded-xl object-cover bg-white/10 border border-white/15 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-white truncate">
                              {item.title}
                            </p>
                            <p className="text-[12.5px] text-white/70 truncate">
                              {item.author} •{' '}
                              <span className="uppercase text-[11px] font-bold text-cyan-300">
                                {item.source}
                              </span>
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => playFromSavedTrack(item, false)}
                          title="Thêm vào Tiếp theo"
                          className="liquid-btn shrink-0 p-2 rounded-full text-cyan-300"
                        >
                          <ListPlus className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setTrackToAddPlaylist(item)}
                          title="Lưu vào Playlist"
                          className="liquid-btn shrink-0 p-2 rounded-full text-pink-300"
                        >
                          <FolderPlus className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeHistoryItemWithUndo(idx)}
                          title="Xóa bài này khỏi lịch sử"
                          aria-label={`Xóa ${item.title} khỏi lịch sử`}
                          className="shrink-0 p-2 rounded-full bg-rose-500/15 border border-rose-400/30 text-rose-300 hover:bg-rose-500/30 active:scale-95 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </SwipeToDeleteRow>
                  ))}
                </>
              )}
            </div>
          )}
          </div>
        </CursorGlowCard>

          </div>
        </section>

        {/* ================= TRANG 1 (VUỐT PHẢI): SEARCH & GỢI Ý LIÊN TỤC KIỂU YOUTUBE ================= */}
        <section
          ref={suggestScrollRef}
          aria-label="Trang Tìm kiếm và Gợi ý kiểu YouTube"
          onScroll={(e) => {
            const el = e.currentTarget;
            const activeHasMore = submittedSearch ? searchHasMore : suggestHasMore;
            if (
              el.scrollHeight - el.scrollTop - el.clientHeight < 140 &&
              activeHasMore &&
              !loadingMoreSuggest
            ) {
              loadMoreRelatedOrSearch();
            }
          }}
          className="la-pager-page px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(10.5rem,calc(env(safe-area-inset-bottom)+9rem))] flex flex-col items-center"
        >
          <div className="w-full max-w-[460px] space-y-4 my-1">
            {/* Header Trang Khám phá kiểu YouTube Music */}
            <header className="flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                onClick={() => goToPage('player')}
                className="liquid-pill px-3.5 py-2 rounded-full flex items-center gap-1 text-[13px] font-semibold text-white/90 hover:text-white active:scale-95 transition shrink-0"
              >
                <ChevronLeft className="w-4 h-4 text-cyan-300" />
                <span>Nghe nhạc</span>
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(244,63,94,0.45)]">
                  <Compass className="w-4 h-4 text-white" />
                </span>
                <span className="text-[17px] font-bold tracking-tight text-white truncate">
                  Khám phá YouTube / TikTok
                </span>
              </div>
            </header>

            {/* Thanh tìm kiếm & Bộ lọc kiểu YouTube */}
            <CursorGlowCard className="p-4 space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeTrackSearch(searchQuery, searchPlatform, false);
                }}
                className="space-y-2.5"
              >
                <div className="flex items-center gap-2 bg-black/45 border border-white/15 rounded-2xl px-3.5 py-1.5">
                  <Search className="w-4 h-4 text-cyan-300 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên bài hát, ca sĩ (YouTube / TikTok)..."
                    className="flex-1 min-w-0 py-2 text-base bg-transparent text-white placeholder-white/50 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSubmittedSearch('');
                        setSearchResults([]);
                        setSearchHasMore(false);
                      }}
                      className="p-1 text-white/60 hover:text-white shrink-0"
                      title="Xóa tìm kiếm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="neon-orb-primary px-4 py-2 rounded-xl text-[14px] font-semibold text-white shrink-0 active:scale-95 transition"
                  >
                    Tìm
                  </button>
                </div>

                {/* Bộ lọc nền tảng + Nút quay về Gợi ý theo bài */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'Tất cả' },
                        { id: 'youtube', label: 'YouTube' },
                        { id: 'tiktok', label: 'TikTok' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSearchPlatform(opt.id);
                          if (searchQuery.trim()) {
                            executeTrackSearch(searchQuery, opt.id, false);
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition active:scale-95 ${
                          searchPlatform === opt.id
                            ? 'bg-cyan-400/20 border-cyan-300/50 text-cyan-200'
                            : 'bg-white/5 border-white/10 text-white/80 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {submittedSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSubmittedSearch('');
                        setSearchResults([]);
                      }}
                      className="text-[13px] text-cyan-300 hover:underline font-medium"
                    >
                      Về gợi ý liên tục
                    </button>
                  )}
                </div>
              </form>

              {/* Từ khóa gợi ý nhanh kiểu YouTube */}
              {!submittedSearch && (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                  {[
                    'Nhạc Việt Hot',
                    'Rap Việt',
                    'Lofi Đêm',
                    'TikTok Viral',
                    'Sơn Tùng M-TP',
                    'Low G',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setSearchQuery(chip);
                        executeTrackSearch(chip, searchPlatform, false);
                      }}
                      className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/12 text-[13px] font-medium text-white/85 shrink-0 transition active:scale-95"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </CursorGlowCard>

            {/* Danh sách phát gợi ý liên tục / Kết quả tìm kiếm (cuộn xuống tự load thêm vô tận) */}
            {(() => {
              const isSearchMode = Boolean(submittedSearch);
              const activeList = isSearchMode ? searchResults : suggestions;
              const activeLoading = isSearchMode ? isSearching : loadingSuggestions;
              const activeHasMore = isSearchMode ? searchHasMore : suggestHasMore;

              return (
                <CursorGlowCard className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h2 className="text-[16px] font-bold text-white truncate">
                      {isSearchMode
                        ? `Kết quả cho "${submittedSearch}"`
                        : currentTrack
                        ? `Gợi ý tiếp theo · ${currentTrack.title}`
                        : 'Đề xuất thịnh hành hôm nay'}
                    </h2>
                    {activeList.length > 0 && (
                      <span className="text-xs font-semibold text-cyan-300 tabular-nums shrink-0">
                        {activeList.length} bài
                      </span>
                    )}
                  </div>

                  {!isSearchMode && !suggestionsEnabled ? (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-[15px] text-white/70">
                        Tính năng Gợi ý đang tắt trong Cài đặt. Bạn vẫn có thể tìm kiếm trực tiếp ở ô phía trên!
                      </p>
                      <button
                        type="button"
                        onClick={() => handleToggleSuggestions(true)}
                        className="neon-orb-primary px-4 py-2 rounded-full text-[13.5px] font-semibold text-white"
                      >
                        Bật lại Gợi ý tự động
                      </button>
                    </div>
                  ) : activeLoading && activeList.length === 0 ? (
                    <SuggestionSkeleton rows={5} />
                  ) : activeList.length === 0 ? (
                    <p className="text-center text-[15px] text-white/65 py-8">
                      {isSearchMode
                        ? `Không tìm thấy bài nào cho "${submittedSearch}". Thử từ khóa khác hoặc chọn Tất cả!`
                        : 'Đang chuẩn bị danh sách gợi ý nhạc cho bạn...'}
                    </p>
                  ) : (
                    <div className="space-y-2.5 u039-stagger">
                      {activeList.map((item, idx) => (
                        <div
                          key={`${item.id}_${idx}`}
                          style={{ '--d': `${(idx % 10) * 30}ms` } as React.CSSProperties}
                          className="u079-bloom flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                        >
                          <button
                            type="button"
                            onClick={() => playSuggestedTrack(item, true)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          >
                            <div className="relative shrink-0">
                              <img
                                src={`/api/image-proxy?url=${encodeURIComponent(item.thumbnail)}`}
                                alt={item.title}
                                loading="lazy"
                                decoding="async"
                                className="w-16 h-12 rounded-xl object-cover bg-white/10 border border-white/15"
                              />
                              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-bold uppercase text-cyan-200">
                                {item.source === 'tiktok' ? 'TT' : item.source === 'soundcloud' ? 'SC' : 'YT'}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[15.5px] font-semibold text-white line-clamp-2 leading-snug">
                                {item.title}
                              </p>
                              <p className="text-[13px] text-white/70 truncate mt-0.5">
                                {item.author}
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => playSuggestedTrack(item, false)}
                            title="Thêm vào Tiếp theo"
                            className="liquid-btn p-2.5 rounded-full text-cyan-300 shrink-0"
                          >
                            <ListPlus className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      <div ref={loadMoreSentinelRef} className="pt-1 pb-2">
                        {loadingMoreSuggest ? (
                          <SuggestionSkeleton rows={2} />
                        ) : activeHasMore ? (
                          <button
                            type="button"
                            onClick={() => loadMoreRelatedOrSearch()}
                            className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[13.5px] font-semibold text-cyan-300 hover:bg-white/10 transition"
                          >
                            Kéo xuống để tải thêm bài...
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </CursorGlowCard>
              );
            })()}
          </div>
        </section>
      </div>

      {/* THẺ <audio> DUY NHẤT CHUẨN iOS SAFARI + CHỐNG LAG TỰ PHỤC HỒI */}
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        onPlay={() => {
          clearStallWatchdog();
          setIsPlaying(true);
        }}
        onPlaying={() => {
          clearStallWatchdog();
          recoveryAttemptsRef.current = 0;
        }}
        onPause={() => {
          clearStallWatchdog();
          setIsPlaying(false);
        }}
        onWaiting={startStallWatchdog}
        onStalled={startStallWatchdog}
        onError={() => {
          if (isSwitchingTrackRef.current) return;
          if (
            audioRef.current &&
            audioRef.current.src &&
            audioRef.current.src !== SILENT_AUDIO_URI
          ) {
            recoverCurrentTrack();
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio) return;
          clearStallWatchdog();
          const t = audio.currentTime;
          if (t > 0) lastPlayTimeRef.current = t;
          const wholeSec = Math.floor(t);
          if (wholeSec !== lastUiSecondRef.current) {
            lastUiSecondRef.current = wholeSec;
            setCurrentTime(wholeSec);
            updateMediaSessionPosition();
          }
          checkSleepTimerAndFadeOut();
          maybePrefetchNextTrack();
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            lastUiSecondRef.current = Math.floor(audioRef.current.currentTime || 0);
            setDuration(audioRef.current.duration);
            updateMediaSessionPosition();
          }
        }}
        onEnded={() => {
          clearStallWatchdog();
          handleAudioEnded();
        }}
        className="hidden"
      />

      {/* SNACKBAR HOÀN TÁC KHI VUỐT XÓA BÀI HÁT (#071) */}
      <UndoDeleteSnackbar
        visible={swipeUndo !== null}
        message={swipeUndo ? `Đã xóa "${swipeUndo.item.title}"` : ''}
        hasBottomDock={Boolean(currentTrack)}
        resetKey={swipeUndo?.resetKey || 0}
        onUndo={handleUndoSwipeDelete}
        onExpire={() => setSwipeUndo(null)}
      />

      {/* MINI PLAYER NỔI KHI CUỘN XUỐNG HOẶC KHI Ở TRANG KHÁM PHÁ (#218) */}
      <DockedMiniPlayer
        track={currentTrack}
        targetRef={nowPlayingCardRef}
        isPlaying={isPlaying}
        progressPct={progressPct}
        forceDocked={activePage === 'discover'}
        onOpenPlayer={() => goToPage('player')}
        onTogglePlayPause={togglePlayPause}
        onNextTrack={handleNextTrack}
      />

      {/* THANH DOCK KIỂU MACBOOK LIQUID GLASS PHÓNG TO KHI RÊ / LƯỚT NGÓN TAY (#208) */}
      <MacBookAppDock items={dockItems} />
    </main>
  );
}
