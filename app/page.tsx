'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
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
  Check,
  Sparkles,
  ListPlus,
  PlayCircle,
  X,
  ClipboardPaste,
  AudioLines,
  Clock,
  Settings,
  Repeat2,
} from 'lucide-react';
import Hls from 'hls.js';
import { AppleSpinner } from './components/AppleSpinner';
import { CircularTimerModal } from './components/CircularTimerModal';
import { Snowfall } from './components/Snowfall';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { SettingsModal } from './components/SettingsModal';

// File WAV câm siêu nhẹ (44 bytes) dùng mở khóa thẻ <audio> trên iOS Safari trước khi fetch()
const SILENT_AUDIO_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Thời gian tối đa coi link stream cũ còn dùng tốt
const STREAM_TTL_MS = 45 * 60 * 1000;
const SOUNDCLOUD_TTL_MS = 4 * 60 * 1000; // SoundCloud signed CloudFront URL hết hạn sau ~6 phút

export type RepeatMode = 'off' | 'once' | 'infinite';

export interface TrackData {
  id: string;
  originalUrl: string;
  audioUrl: string;
  title: string;
  author: string;
  thumbnail: string;
  source: 'youtube' | 'tiktok' | 'soundcloud';
  mimeType: string;
  extractedAt: number;
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
  const [loadingMode, setLoadingMode] = useState<'play' | 'queue' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Danh sách hàng đợi (Queue) & bài hiện tại
  const [queue, setQueue] = useState<TrackData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const currentTrack =
    currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  // Lịch sử & Playlists (lưu localStorage)
  const [history, setHistory] = useState<TrackData[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'playlists' | 'history'>('queue');

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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3000);
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
    }, 1200);

    return () => clearTimeout(timer);
  }, [playlists, history, queue, syncSession]);

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
   * MỞ KHÓA AUDIO TRÊN iOS SAFARI NGAY TRONG LUỒNG CHẠM ĐỒNG BỘ
   */
  const unlockAudioOnUserGesture = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) {
        audio.src = SILENT_AUDIO_URI;
        const p = audio.play();
        if (p !== undefined) await p.catch(() => {});
        audio.pause();
      }
    } catch {}
  }, []);

  const fetchFreshTrack = useCallback(async (url: string): Promise<TrackData> => {
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Không thể lấy được link âm thanh.');
    }
    return data as TrackData;
  }, []);

  const ensureValidAudioUrl = useCallback(
    async (track: TrackData): Promise<TrackData> => {
      const ttl = track.source === 'soundcloud' ? SOUNDCLOUD_TTL_MS : STREAM_TTL_MS;
      const isExpired =
        !track.audioUrl ||
        !track.extractedAt ||
        Date.now() - track.extractedAt > ttl;

      if (!isExpired) return track;

      const refreshed = await fetchFreshTrack(track.originalUrl);
      setQueue((prev) =>
        prev.map((item) => (item.id === track.id ? { ...refreshed, id: track.id } : item))
      );
      return { ...refreshed, id: track.id };
    },
    [fetchFreshTrack]
  );

  // Dọn dẹp Hls.js khi unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Nạp nguồn phát chuẩn (dùng native <audio> trên Safari iOS và Hls.js cho Chrome/Edge/Android khi gặp SoundCloud .m3u8)
  const attachAndPlayAudio = useCallback(
    async (audio: HTMLAudioElement, track: TrackData) => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

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
      audio.load();
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

      setError(null);
      setCurrentIndex(index);
      currentIndexRef.current = index;
      trackRepeatOnceCountRef.current = 0;

      let targetTrack = targetQueue[index];

      try {
        targetTrack = await ensureValidAudioUrl(targetTrack);

        if (!sleepEndTimeRef.current) {
          audio.volume = userBaseVolumeRef.current;
        }

        await attachAndPlayAudio(audio, targetTrack);

        setIsPlaying(true);
        addToHistory(targetTrack);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch {
        try {
          const refreshed = await fetchFreshTrack(targetTrack.originalUrl);
          setQueue((prev) => prev.map((t, idx) => (idx === index ? refreshed : t)));
          await attachAndPlayAudio(audio, refreshed);
          setIsPlaying(true);
          addToHistory(refreshed);
        } catch (retryErr) {
          const msg =
            retryErr instanceof Error ? retryErr.message : 'Không thể phát bài hát này.';
          setError(msg);
          setIsPlaying(false);
        }
      }
    },
    [addToHistory, attachAndPlayAudio, ensureValidAudioUrl, fetchFreshTrack]
  );

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
      audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), maxDur);
      setCurrentTime(audio.currentTime);
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
          : 'YouTube Background Audio',
      artwork: [
        { src: proxiedArtworkUrl, sizes: '96x96' },
        { src: proxiedArtworkUrl, sizes: '128x128' },
        { src: proxiedArtworkUrl, sizes: '192x192' },
        { src: proxiedArtworkUrl, sizes: '256x256' },
        { src: proxiedArtworkUrl, sizes: '384x384' },
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
    setIsPlaying(false);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }, [playTrackAtIndex]);

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

  // Pre-fetch bài tiếp theo trước khi hết bài 20s
  const maybePrefetchNextTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !isFinite(audio.duration)) return;

    const timeLeft = audio.duration - audio.currentTime;
    if (timeLeft > 20) return;

    const q = queueRef.current;
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx >= q.length) return;

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
  }, [ensureValidAudioUrl]);

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

  const handleExtractUrl = async (mode: 'play' | 'queue', targetUrl?: string) => {
    const finalUrl = (targetUrl ?? pendingUrl ?? inputUrl).trim();
    setError(null);

    if (!finalUrl) {
      setError('Vui lòng dán link TikTok, YouTube hoặc SoundCloud vào ô bên trên.');
      return;
    }

    setShowLinkActionModal(false);
    await unlockAudioOnUserGesture();
    setLoadingMode(mode);

    try {
      const trackInfo = await fetchFreshTrack(finalUrl);
      setInputUrl('');
      setPendingUrl('');
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

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack && queue.length > 0) {
      await unlockAudioOnUserGesture();
      await playTrackAtIndex(0);
      return;
    }
    if (!currentTrack) return;

    if (audio.paused) {
      if (!audio.src || audio.src === SILENT_AUDIO_URI) {
        await unlockAudioOnUserGesture();
        await playTrackAtIndex(currentIndex);
        return;
      }
      try {
        await audio.play();
        setIsPlaying(true);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch {
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

  const handleSeekSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
    updateMediaSessionPosition();
  };

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
    await unlockAudioOnUserGesture();

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

  const handleDeletePlaylist = (plId: string) => {
    const updated = playlists.filter((p) => p.id !== plId);
    savePlaylists(updated);
    if (selectedPlaylistId === plId) {
      setSelectedPlaylistId(updated[0]?.id || null);
    }
    showToast('Đã xóa playlist');
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

  const removeTrackFromPlaylist = (playlistId: string, trackId: string) => {
    const updated = playlists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      return { ...pl, tracks: pl.tracks.filter((t) => t.id !== trackId) };
    });
    savePlaylists(updated);
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
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const isCustomSleepTime =
    sleepTimerMinutes !== null && ![15, 30, 45].includes(sleepTimerMinutes);

  const detectedLinkSource = /tiktok\.com/i.test(pendingUrl || inputUrl)
    ? 'TikTok'
    : /(soundcloud\.com|soundcloud\.app\.goo\.gl)/i.test(pendingUrl || inputUrl)
    ? 'SoundCloud'
    : /(youtube\.com|youtu\.be)/i.test(pendingUrl || inputUrl)
    ? 'YouTube'
    : null;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden flex flex-col items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(7.5rem,calc(env(safe-area-inset-bottom)+5.5rem))]">
      {/* NỀN NEON LIQUID GLASS (CYAN & MAGENTA GLOW + BLURRED ARTWORK) */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-[#05070e]">
        <div className="animate-orb-slow absolute -top-24 -left-24 w-96 h-96 rounded-full bg-cyan-500/20 blur-[110px]" />
        <div className="animate-orb-reverse absolute top-1/4 -right-24 w-96 h-96 rounded-full bg-pink-500/20 blur-[115px]" />
        <div className="animate-orb-slow absolute -bottom-28 left-1/4 w-96 h-96 rounded-full bg-indigo-500/20 blur-[120px]" />

        {currentTrack && (
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(currentTrack.thumbnail)}`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-[95px] opacity-25 saturate-150 transition-all duration-1000"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070e]/55 via-[#05070e]/45 to-[#05070e]/90" />
      </div>

      {/* HIỆU ỨNG TUYẾT RƠI NHÈ NHẸ */}
      <Snowfall />

      {/* TOAST NỔI KIỂU DYNAMIC ISLAND */}
      {toast && (
        <div className="fixed top-[max(1rem,env(safe-area-inset-top))] z-50 px-4 py-2.5 rounded-full bg-black/85 backdrop-blur-2xl border border-cyan-300/30 shadow-[0_12px_36px_rgba(0,0,0,0.65)] text-white text-sm font-medium flex items-center gap-2 transition-all">
          <span className="w-4 h-4 rounded-full bg-cyan-400/20 flex items-center justify-center">
            <Check className="w-3 h-3 text-cyan-300" />
          </span>
          <span>{toast}</span>
        </div>
      )}

      {/* POPUP LOADING QUAY VÒNG KIỂU APPLE HUD */}
      {loadingMode !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="liquid-glass rounded-[34px] px-10 py-8 flex flex-col items-center justify-center gap-4 min-w-[210px] shadow-[0_24px_70px_rgba(0,0,0,0.75)]">
            <AppleSpinner size={54} className="text-white" />
            <span className="text-base font-semibold tracking-tight text-white/95">
              Loading...
            </span>
          </div>
        </div>
      )}

      {/* POPUP 2 Ô TRÁI / PHẢI SAU KHI DÁN LINK (PHÁT NGAY | TIẾP THEO) */}
      {showLinkActionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass w-full max-w-sm rounded-[34px] p-5 space-y-4">
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
                placeholder="Chạm giữ để Dán link TikTok / YouTube / SoundCloud..."
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
              <button
                type="button"
                disabled={!pendingUrl.trim()}
                onClick={() => handleExtractUrl('play', pendingUrl)}
                className="neon-orb-primary py-4 px-3 rounded-2xl font-semibold text-sm text-white flex flex-col items-center justify-center gap-1.5 disabled:opacity-45 active:scale-[0.96] transition"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Phát ngay</span>
              </button>

              <button
                type="button"
                disabled={!pendingUrl.trim()}
                onClick={() => handleExtractUrl('queue', pendingUrl)}
                className="liquid-btn py-4 px-3 rounded-2xl font-semibold text-sm text-white flex flex-col items-center justify-center gap-1.5 disabled:opacity-45"
              >
                <ListPlus className="w-5 h-5 text-cyan-300" />
                <span>Tiếp theo</span>
              </button>
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
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="liquid-glass w-full max-w-sm rounded-[32px] p-5 space-y-4">
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

      <div className="relative z-10 w-full max-w-md space-y-4 my-1">
        {/* THANH TIÊU ĐỀ + NÚT BÁNH RĂNG CÀI ĐẶT GÓC PHẢI TRÊN CÙNG */}
        <header className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full neon-orb-primary flex items-center justify-center">
              {isPlaying ? (
                <AudioLines className="w-4 h-4 text-white animate-pulse" />
              ) : (
                <Music2 className="w-4 h-4 text-white" />
              )}
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              LiquidAudio
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="liquid-pill px-3.5 py-2 rounded-full flex items-center gap-2 text-xs font-semibold text-white/90 hover:text-white active:scale-95 transition"
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
        </header>

        {/* KHỐI 1: Ô DÁN LINK KIỂU VIBECONVERT + NÚT GRADIENT CYAN->PINK */}
        <section className="liquid-glass rounded-3xl p-3.5 space-y-3">
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
              placeholder="Dán link TikTok, YouTube, SoundCloud..."
              className="w-full py-2 text-[15px] bg-transparent text-white placeholder-white/45 focus:outline-none"
            />
            {inputUrl && (
              <button
                type="button"
                onClick={() => setInputUrl('')}
                className="px-2.5 py-1.5 rounded-xl bg-white/10 text-cyan-300 text-xs font-medium hover:bg-white/15 shrink-0"
                title="Xóa"
              >
                Xóa
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={loadingMode !== null}
              onClick={() => handleExtractUrl('play', inputUrl)}
              className="neon-orb-primary py-3 px-4 rounded-2xl font-semibold text-sm text-white transition flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.97]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Phát ngay</span>
            </button>

            <button
              type="button"
              disabled={loadingMode !== null}
              onClick={() => handleExtractUrl('queue', inputUrl)}
              className="liquid-btn py-3 px-4 rounded-2xl font-semibold text-sm text-cyan-200 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <ListPlus className="w-4 h-4 text-cyan-300" />
              <span>+ Tiếp theo</span>
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-300/30 text-rose-100 text-sm flex items-start gap-2 backdrop-blur-xl">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* KHỐI 2: NOW PLAYING CARD (SÓNG ÂM + ẢNH TRÒN Ở GIỮA + ĐIỀU KHIỂN NEON) */}
        {currentTrack && (
          <section className="liquid-glass rounded-3xl p-5 space-y-4">
            {/* Header Now Playing */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300/90">
                    NOW PLAYING
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-medium text-white/80 tabular-nums">
                    {currentIndex + 1}/{queue.length}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-400/15 border border-cyan-300/25 text-[10px] font-bold uppercase text-cyan-200">
                    {currentTrack.source === 'tiktok'
                      ? 'TikTok'
                      : currentTrack.source === 'soundcloud'
                      ? 'SoundCloud'
                      : 'YouTube'}
                  </span>
                </div>

                <h2 className="text-lg font-bold tracking-tight text-white truncate pt-0.5">
                  {currentTrack.title}
                </h2>
                <p className="text-sm text-white/65 truncate">{currentTrack.author}</p>
              </div>

              <button
                type="button"
                onClick={() => setTrackToAddPlaylist(currentTrack)}
                title="Lưu bài vào Playlist"
                className="liquid-btn w-10 h-10 rounded-full flex items-center justify-center text-white/85 hover:text-cyan-300 shrink-0"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>

            {/* Sóng âm Cyan -> Pink + Ảnh đại diện tròn ở giữa giống ảnh gợi ý */}
            <div className="flex flex-col items-center justify-center gap-3 py-1">
              <WaveformVisualizer isPlaying={isPlaying} />

              <div className="relative">
                <div
                  className={`absolute -inset-2 rounded-full bg-gradient-to-tr from-cyan-400/35 via-indigo-400/25 to-pink-500/35 blur-md transition-opacity duration-500 ${
                    isPlaying ? 'opacity-100' : 'opacity-40'
                  }`}
                />
                <img
                  src={`/api/image-proxy?url=${encodeURIComponent(currentTrack.thumbnail)}`}
                  alt={currentTrack.title}
                  className={`relative w-24 h-24 rounded-full object-cover border-[3px] border-cyan-400/60 shadow-inner transition-transform duration-500 ${
                    isPlaying ? 'scale-100' : 'scale-95 opacity-90'
                  }`}
                />
              </div>
            </div>

            {/* Bộ nút điều khiển trung tâm: -5s | << | Play/Pause Orb | >> | +5s */}
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                type="button"
                onClick={() => seekRelative(-5)}
                className="liquid-btn px-3 h-10 rounded-full flex items-center gap-1 text-white/85 hover:text-cyan-300"
                title="Tua lùi 5 giây"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-xs font-semibold tabular-nums">-5s</span>
              </button>

              <button
                type="button"
                onClick={handlePrevTrack}
                className="liquid-btn w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:text-white"
                title="Bài trước"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                className="neon-orb-primary w-16 h-16 rounded-full text-white flex items-center justify-center transition active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-0.5" />
                )}
              </button>

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
                className="liquid-btn px-3 h-10 rounded-full flex items-center gap-1 text-white/85 hover:text-pink-300"
                title="Tua tiến 5 giây"
              >
                <span className="text-xs font-semibold tabular-nums">+5s</span>
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Thanh tiến trình Gradient Cyan -> Pink */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeekSlider}
                style={{
                  background: `linear-gradient(to right, #22d3ee 0%, #ec4899 ${progressPct}%, rgba(255,255,255,0.18) ${progressPct}%)`,
                }}
                className="apple-slider w-full"
              />
              <div className="flex justify-between text-xs font-medium text-white/65 tabular-nums">
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
                  className={`py-2 px-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition active:scale-95 ${
                    trackRepeatMode !== 'off'
                      ? 'bg-cyan-400/20 border-cyan-300/50 text-cyan-200'
                      : 'bg-white/5 border-white/10 text-white/75 hover:text-white'
                  }`}
                >
                  {trackRepeatMode === 'once' ? (
                    <Repeat1 className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
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
                  className={`py-2 px-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition active:scale-95 ${
                    playlistRepeatMode !== 'off'
                      ? 'bg-pink-500/20 border-pink-400/50 text-pink-200'
                      : 'bg-white/5 border-white/10 text-white/75 hover:text-white'
                  }`}
                >
                  <Repeat2 className="w-4 h-4" />
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
                <div className="flex items-center gap-1.5 text-xs text-white/80">
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
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 ${
                        sleepTimerMinutes === mins
                          ? 'neon-orb-primary text-white shadow'
                          : 'bg-white/8 hover:bg-white/15 border border-white/12 text-white/80'
                      }`}
                    >
                      {mins}p
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setShowClockModal(true)}
                    title="Đồng hồ đếm ngược 1–60 phút"
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 transition active:scale-95 ${
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
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-rose-500/20 border border-rose-300/30 text-rose-200"
                    >
                      Tắt
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* KHỐI 3: DANH SÁCH TIẾP THEO • PLAYLIST • ĐÃ NGHE (STYLE RECENTLY TRACKS) */}
        <section className="liquid-glass rounded-3xl p-4 space-y-3.5">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/35 border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`py-2.5 px-2 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'queue'
                  ? 'neon-orb-primary text-white shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <ListMusic className="w-4 h-4" />
              <span>Tiếp ({queue.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('playlists')}
              className={`py-2.5 px-2 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'playlists'
                  ? 'neon-orb-primary text-white shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Playlist ({playlists.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-2.5 px-2 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'history'
                  ? 'neon-orb-primary text-white shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Đã nghe ({history.length})</span>
            </button>
          </div>

          {/* TAB 1: HÀNG ĐỢI TIẾP THEO */}
          {activeTab === 'queue' && (
            <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
              {queue.length === 0 ? (
                <p className="text-center text-sm text-white/50 py-8">
                  Danh sách phát trống. Hãy dán link ở trên hoặc chọn bài từ Đã nghe!
                </p>
              ) : (
                queue.map((item, idx) => {
                  const isCurrent = idx === currentIndex;
                  return (
                    <div
                      key={`${item.id}_${idx}`}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl border transition ${
                        isCurrent
                          ? 'bg-cyan-400/12 border-cyan-300/35'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <span className="w-5 text-center text-xs font-semibold text-white/50 tabular-nums shrink-0">
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
                          className="w-11 h-11 rounded-xl object-cover bg-white/10 border border-white/15 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isCurrent ? 'text-cyan-300' : 'text-white'
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="text-xs text-white/60 truncate">{item.author}</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrackToAddPlaylist(item)}
                        title="Lưu vào Playlist"
                        className="p-2 text-white/55 hover:text-cyan-300 transition"
                      >
                        <FolderPlus className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const newQ = queue.filter((_, i) => i !== idx);
                          setQueue(newQ);
                          if (idx < currentIndex) {
                            setCurrentIndex((c) => c - 1);
                          } else if (idx === currentIndex && newQ.length > 0) {
                            playTrackAtIndex(Math.min(idx, newQ.length - 1), newQ);
                          } else if (newQ.length === 0) {
                            setCurrentIndex(-1);
                            audioRef.current?.pause();
                            setIsPlaying(false);
                          }
                        }}
                        title="Xóa khỏi hàng đợi"
                        className="p-2 text-white/45 hover:text-rose-300 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
                  className="flex-1 px-4 py-2.5 text-sm bg-black/35 border border-white/12 rounded-2xl text-white placeholder-white/45 focus:outline-none focus:border-cyan-400/50"
                />
                <button
                  type="submit"
                  className="neon-orb-primary px-4 py-2.5 rounded-2xl text-white text-sm font-semibold flex items-center gap-1 shrink-0 active:scale-95 transition"
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
                    className={`px-3.5 py-2 rounded-full text-xs font-medium shrink-0 border transition ${
                      selectedPlaylist?.id === pl.id
                        ? 'bg-cyan-400/20 border-cyan-300/50 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-white/75 hover:text-white'
                    }`}
                  >
                    {pl.name} ({pl.tracks.length})
                  </button>
                ))}
              </div>

              {selectedPlaylist && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {selectedPlaylist.name}
                      </h3>
                      <p className="text-xs text-white/60">
                        {selectedPlaylist.tracks.length} bài • Phát tự động liên tục
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => playEntirePlaylist(selectedPlaylist, 0)}
                        className="neon-orb-primary px-3.5 py-2 rounded-full text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>Phát tất cả</span>
                      </button>
                      {playlists.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                          className="p-2 rounded-full bg-rose-500/20 border border-rose-300/25 text-rose-200 hover:bg-rose-500/30"
                          title="Xóa Playlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                    {selectedPlaylist.tracks.length === 0 ? (
                      <p className="text-center text-sm text-white/50 py-6">
                        Playlist trống. Bấm biểu tượng thư mục (+) trên bài hát để thêm vào đây!
                      </p>
                    ) : (
                      selectedPlaylist.tracks.map((item, idx) => (
                        <div
                          key={`${item.id}_${idx}`}
                          className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                        >
                          <span className="w-5 text-center text-xs font-semibold text-white/50 tabular-nums shrink-0">
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
                              className="w-10 h-10 rounded-xl object-cover bg-white/10 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white truncate">
                                {item.title}
                              </p>
                              <p className="text-xs text-white/60 truncate">
                                {item.author}
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              removeTrackFromPlaylist(selectedPlaylist.id, item.id)
                            }
                            className="p-2 text-white/45 hover:text-rose-300"
                            title="Xóa khỏi Playlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LỊCH SỬ BÀI TỪNG NGHE */}
          {activeTab === 'history' && (
            <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
              {history.length === 0 ? (
                <p className="text-center text-sm text-white/50 py-8">
                  Lịch sử trống. Các bài từng nghe sẽ lưu lại tại đây để lần sau ấn vô là phát ngay!
                </p>
              ) : (
                <>
                  <div className="flex justify-between items-center px-1 mb-1">
                    <span className="text-xs text-white/60">
                      Ấn vào bài để phát ngay
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setHistory([]);
                        localStorage.removeItem(STORAGE_KEYS.HISTORY);
                        showToast('Đã xóa lịch sử');
                      }}
                      className="text-xs text-white/50 hover:text-rose-300"
                    >
                      Xóa tất cả
                    </button>
                  </div>
                  {history.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                    >
                      <span className="w-5 text-center text-xs font-semibold text-white/50 tabular-nums shrink-0">
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => playFromSavedTrack(item, true)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <img
                          src={`/api/image-proxy?url=${encodeURIComponent(item.thumbnail)}`}
                          alt={item.title}
                          className="w-11 h-11 rounded-xl object-cover bg-white/10 border border-white/15 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-white/60 truncate">
                            {item.author} •{' '}
                            <span className="uppercase text-[10px] text-cyan-300">
                              {item.source}
                            </span>
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => playFromSavedTrack(item, false)}
                        title="Thêm vào Tiếp theo"
                        className="liquid-btn p-2 rounded-full text-cyan-300"
                      >
                        <ListPlus className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrackToAddPlaylist(item)}
                        title="Lưu vào Playlist"
                        className="liquid-btn p-2 rounded-full text-pink-300"
                      >
                        <FolderPlus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>

        {/* THẺ <audio> DUY NHẤT CHUẨN iOS SAFARI BACKGROUND PLAYBACK */}
        <audio
          ref={audioRef}
          playsInline
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              updateMediaSessionPosition();
              checkSleepTimerAndFadeOut();
              maybePrefetchNextTrack();
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration);
              updateMediaSessionPosition();
            }
          }}
          onEnded={handleAudioEnded}
          className="hidden"
        />
      </div>
    </main>
  );
}
