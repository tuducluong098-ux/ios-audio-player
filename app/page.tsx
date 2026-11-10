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
  Smartphone,
  Plus,
  ListMusic,
  History,
  FolderPlus,
  Trash2,
  Timer,
  Volume2,
  Check,
  Sparkles,
  ListPlus,
  PlayCircle,
  X,
  ClipboardPaste,
  AudioLines,
  Clock,
} from 'lucide-react';
import { AppleSpinner } from './components/AppleSpinner';
import { CircularTimerModal } from './components/CircularTimerModal';

// File WAV câm siêu nhẹ (44 bytes) dạng Base64 dùng để "Mở khóa" (Unlock) thẻ <audio>
// ngay tại thời điểm người dùng chạm nút trên iOS Safari trước khi await fetch() hoàn tất.
const SILENT_AUDIO_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Thời gian tối đa coi link stream cũ còn dùng tốt (45 phút)
const STREAM_TTL_MS = 45 * 60 * 1000;

export type RepeatMode = 'off' | 'once' | 'infinite';

export interface TrackData {
  id: string;
  originalUrl: string;
  audioUrl: string;
  title: string;
  author: string;
  thumbnail: string;
  source: 'youtube' | 'tiktok';
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
};

export default function AudioPlayerPage() {
  // Input & popup dán nhanh + Loading
  const [inputUrl, setInputUrl] = useState('');
  const [pendingUrl, setPendingUrl] = useState('');
  const [showLinkActionModal, setShowLinkActionModal] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'play' | 'queue' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Popup đồng hồ đếm ngược 1-60 phút
  const [showClockModal, setShowClockModal] = useState(false);

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

  // Trạng thái trình phát nhạc
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Chế độ nút trên Dynamic Island / Lock Screen ('track' = Tiến/Lùi bài | 'seek' = Tua ±5s)
  const [lockScreenControlMode, setLockScreenControlMode] = useState<'track' | 'seek'>('track');

  // Hẹn giờ tắt nhạc (Sleep Timer) & Fade-out
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const popupInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<TrackData[]>(queue);
  const currentIndexRef = useRef<number>(currentIndex);
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  const repeatOnceCountRef = useRef<number>(0);
  const sleepEndTimeRef = useRef<number | null>(null);
  const userBaseVolumeRef = useRef<number>(1);
  const prefetchingTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  // Khởi tạo dữ liệu từ localStorage
  useEffect(() => {
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
    } catch (e) {
      console.error('Lỗi đọc localStorage:', e);
    }
  }, []);

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
      const isExpired =
        !track.audioUrl ||
        !track.extractedAt ||
        Date.now() - track.extractedAt > STREAM_TTL_MS;

      if (!isExpired) return track;

      const refreshed = await fetchFreshTrack(track.originalUrl);
      setQueue((prev) =>
        prev.map((item) => (item.id === track.id ? { ...refreshed, id: track.id } : item))
      );
      return { ...refreshed, id: track.id };
    },
    [fetchFreshTrack]
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
      repeatOnceCountRef.current = 0;

      let targetTrack = targetQueue[index];

      try {
        targetTrack = await ensureValidAudioUrl(targetTrack);

        if (!sleepEndTimeRef.current) {
          audio.volume = userBaseVolumeRef.current;
        }

        audio.src = targetTrack.audioUrl;
        audio.load();
        await audio.play();

        setIsPlaying(true);
        addToHistory(targetTrack);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch {
        try {
          const refreshed = await fetchFreshTrack(targetTrack.originalUrl);
          setQueue((prev) => prev.map((t, idx) => (idx === index ? refreshed : t)));
          audio.src = refreshed.audioUrl;
          audio.load();
          await audio.play();
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
    [addToHistory, ensureValidAudioUrl, fetchFreshTrack]
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

  const handleAudioEnded = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const mode = repeatModeRef.current;

    if (mode === 'infinite') {
      audio.currentTime = 0;
      await audio.play().catch(() => {});
      return;
    }

    if (mode === 'once' && repeatOnceCountRef.current < 1) {
      repeatOnceCountRef.current += 1;
      audio.currentTime = 0;
      await audio.play().catch(() => {});
      return;
    }

    repeatOnceCountRef.current = 0;

    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (idx + 1 < q.length) {
      playTrackAtIndex(idx + 1);
    } else {
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  }, [playTrackAtIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = repeatMode === 'infinite';
    }
  }, [repeatMode]);

  const cycleRepeatMode = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') {
        repeatOnceCountRef.current = 0;
        showToast('Phát lặp 1 lần');
        return 'once';
      }
      if (prev === 'once') {
        showToast('Phát lặp vĩnh viễn ∞');
        return 'infinite';
      }
      showToast('Đã tắt phát lặp');
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
    const isExpired =
      !nextTrack.audioUrl ||
      !nextTrack.extractedAt ||
      Date.now() - nextTrack.extractedAt > STREAM_TTL_MS;

    if (isExpired && prefetchingTrackIdRef.current !== nextTrack.id) {
      prefetchingTrackIdRef.current = nextTrack.id;
      ensureValidAudioUrl(nextTrack).finally(() => {
        prefetchingTrackIdRef.current = null;
      });
    }
  }, [ensureValidAudioUrl]);

  /**
   * NÚT DÁN NHANH LIQUID GLASS CỠ LỚN:
   * Bấm 1 cái -> tự đọc Clipboard dán vào + mở ngay Popup 2 lựa chọn (Phát ngay | Tiếp theo).
   * Nếu Safari chưa có link trong clipboard -> vẫn mở Popup với ô nhập focus sẵn để dán tay.
   */
  const handleBigPasteTap = async () => {
    setError(null);
    let pasted = '';
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        pasted = text.trim();
      }
    } catch {
      // Nếu Safari từ chối hoặc chưa hỗ trợ, mở popup để người dùng dán tay
    }

    if (pasted) {
      setPendingUrl(pasted);
      setInputUrl(pasted);
      setShowLinkActionModal(true);
    } else if (inputUrl.trim()) {
      setPendingUrl(inputUrl.trim());
      setShowLinkActionModal(true);
    } else {
      setPendingUrl('');
      setShowLinkActionModal(true);
      setTimeout(() => {
        popupInputRef.current?.focus();
      }, 80);
    }
  };

  // Khi dán trực tiếp vào ô nhập thủ công, tự mở luôn popup 2 nút Phát ngay / Tiếp theo
  const handleManualInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')?.trim();
    if (pasted) {
      e.preventDefault();
      setInputUrl(pasted);
      setPendingUrl(pasted);
      setShowLinkActionModal(true);
    }
  };

  const handleExtractUrl = async (mode: 'play' | 'queue', targetUrl?: string) => {
    const finalUrl = (targetUrl ?? pendingUrl ?? inputUrl).trim();
    setError(null);

    if (!finalUrl) {
      setError('Vui lòng dán link TikTok hoặc YouTube vào ô bên trên.');
      return;
    }

    // Đóng popup chọn & mở khóa AudioContext iOS ngay trong luồng chạm đồng bộ
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

  const handleVolumeSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
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
    setQueue(playlist.tracks);
    queueRef.current = playlist.tracks;
    setActiveTab('queue');
    await playTrackAtIndex(startIndex, playlist.tracks);
    showToast(`Phát playlist: ${playlist.name}`);
  };

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumePct = Math.round(volume * 100);
  const isCustomSleepTime =
    sleepTimerMinutes !== null && ![15, 30, 45].includes(sleepTimerMinutes);
  const detectedLinkSource = /tiktok\.com/i.test(pendingUrl)
    ? 'TikTok'
    : /(youtube\.com|youtu\.be)/i.test(pendingUrl)
    ? 'YouTube'
    : null;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden flex flex-col items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* NỀN ĐỘNG APPLE LIQUID GLASS */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-[#030306]">
        <div className="animate-orb-slow absolute -top-24 -left-20 w-80 h-80 rounded-full bg-indigo-500/30 blur-[95px]" />
        <div className="animate-orb-reverse absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-sky-400/20 blur-[110px]" />
        <div className="animate-orb-slow absolute -bottom-28 left-1/4 w-96 h-96 rounded-full bg-fuchsia-500/20 blur-[115px]" />

        {currentTrack && (
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(currentTrack.thumbnail)}`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-[90px] opacity-35 saturate-150 transition-all duration-1000"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/80" />
      </div>

      {/* TOAST NỔI KIỂU DYNAMIC ISLAND */}
      {toast && (
        <div className="fixed top-[max(1rem,env(safe-area-inset-top))] z-50 px-4 py-2.5 rounded-full bg-black/85 backdrop-blur-2xl border border-white/20 shadow-[0_12px_36px_rgba(0,0,0,0.65)] text-white text-xs font-medium flex items-center gap-2 transition-all">
          <span className="w-4 h-4 rounded-full bg-white/15 flex items-center justify-center">
            <Check className="w-3 h-3 text-emerald-300" />
          </span>
          <span>{toast}</span>
        </div>
      )}

      {/* POPUP LOADING QUAY VÒNG KIỂU APPLE HUD (GIỐNG ẢNH THAM CHIẾU) */}
      {loadingMode !== null && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-6">
          <div className="liquid-glass rounded-[34px] px-10 py-8 flex flex-col items-center justify-center gap-4 min-w-[200px] shadow-[0_24px_70px_rgba(0,0,0,0.7)]">
            <AppleSpinner size={52} className="text-white" />
            <span className="text-sm font-semibold tracking-tight text-white/95">
              Loading...
            </span>
          </div>
        </div>
      )}

      {/* POPUP 2 Ô TRÁI / PHẢI SAU KHI DÁN LINK (PHÁT NGAY | TIẾP THEO) */}
      {showLinkActionModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass w-full max-w-sm rounded-[34px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/15 border border-white/20 flex items-center justify-center">
                  <ClipboardPaste className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {detectedLinkSource
                      ? `Đã nhận link ${detectedLinkSource}`
                      : 'Dán link & Chọn phát'}
                  </h3>
                  <p className="text-[11px] text-white/60">
                    Chọn Phát ngay hoặc thêm vào Tiếp theo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkActionModal(false)}
                className="liquid-btn w-8 h-8 rounded-full flex items-center justify-center text-white/75 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ô link (cho phép dán trực tiếp nếu Safari chưa đọc tự động) */}
            <div className="relative flex items-center">
              <Link2 className="w-4 h-4 text-white/45 absolute left-3.5 pointer-events-none" />
              <input
                ref={popupInputRef}
                type="url"
                value={pendingUrl}
                onChange={(e) => {
                  setPendingUrl(e.target.value);
                  setInputUrl(e.target.value);
                }}
                placeholder="Chạm giữ để Dán link TikTok / YouTube..."
                className="w-full pl-9 pr-9 py-3 text-xs bg-black/35 border border-white/20 rounded-2xl text-white placeholder-white/45 focus:outline-none focus:border-white/50"
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
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 2 Ô TRÁI VÀ PHẢI: PHÁT NGAY | TIẾP THEO */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={!pendingUrl.trim()}
                onClick={() => handleExtractUrl('play', pendingUrl)}
                className="liquid-orb-primary py-4 px-3 rounded-2xl font-semibold text-xs text-zinc-950 flex flex-col items-center justify-center gap-1.5 disabled:opacity-45 active:scale-[0.96] transition"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Phát ngay</span>
              </button>

              <button
                type="button"
                disabled={!pendingUrl.trim()}
                onClick={() => handleExtractUrl('queue', pendingUrl)}
                className="liquid-btn py-4 px-3 rounded-2xl font-semibold text-xs text-white flex flex-col items-center justify-center gap-1.5 disabled:opacity-45"
              >
                <ListPlus className="w-5 h-5 text-white" />
                <span>Tiếp theo</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* MODAL KÍNH LỎNG CHỌN PLAYLIST */}
      {trackToAddPlaylist && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="liquid-glass w-full max-w-sm rounded-[32px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight text-white">
                Thêm vào Playlist
              </h3>
              <button
                onClick={() => setTrackToAddPlaylist(null)}
                className="liquid-btn w-8 h-8 rounded-full flex items-center justify-center text-white/75 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/65 truncate">{trackToAddPlaylist.title}</p>
            <div className="space-y-2 max-h-52 overflow-y-auto no-scrollbar">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => addTrackToPlaylist(pl.id, trackToAddPlaylist)}
                  className="liquid-btn w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left hover:bg-white/15"
                >
                  <span className="text-xs font-medium text-white">{pl.name}</span>
                  <span className="text-[11px] text-white/55 tabular-nums">
                    {pl.tracks.length} bài
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md space-y-4 my-2">
        {/* THANH TIÊU ĐỀ DYNAMIC PILL */}
        <header className="flex items-center justify-between px-1">
          <div className="liquid-pill px-3.5 py-2 rounded-full flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              {isPlaying ? (
                <AudioLines className="w-3.5 h-3.5 text-white animate-pulse" />
              ) : (
                <Music2 className="w-3.5 h-3.5 text-white" />
              )}
            </div>
            <span className="text-xs font-semibold tracking-tight text-white">
              LiquidAudio
            </span>
          </div>

          <div className="liquid-pill px-3 py-1.5 rounded-full flex items-center gap-1.5 text-[11px] text-white/80">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isPlaying ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-white/40'
              }`}
            />
            <span>{isPlaying ? 'Đang chạy nền' : 'iOS Safari Ready'}</span>
          </div>
        </header>

        {/* KHỐI 1: NÚT DÁN NHANH LIQUID GLASS + INPUT THỦ CÔNG */}
        <section className="liquid-glass rounded-[32px] p-4 space-y-3">
          {/* Nút Dán Nhanh Liquid Glass cỡ lớn (bấm là dán & mở popup chọn Phát ngay / Tiếp theo) */}
          <button
            type="button"
            onClick={handleBigPasteTap}
            className="liquid-paste-hero w-full py-5 px-5 rounded-[24px] flex items-center justify-center gap-3.5 text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-white text-zinc-950 flex items-center justify-center shadow-[0_8px_20px_rgba(255,255,255,0.28)] shrink-0">
              <ClipboardPaste className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold tracking-tight text-white">
                Dán nhanh Link TikTok / YouTube
              </div>
              <div className="text-[11px] text-white/70 mt-0.5">
                Chạm 1 lần để tự dán &amp; mở chọn Phát ngay hoặc Tiếp theo
              </div>
            </div>
          </button>

          {/* Ô nhập / sửa link thủ công gọn bên dưới */}
          <div className="relative flex items-center">
            <Link2 className="w-3.5 h-3.5 text-white/45 absolute left-3.5 pointer-events-none" />
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onPaste={handleManualInputPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputUrl.trim()) {
                  e.preventDefault();
                  setPendingUrl(inputUrl.trim());
                  setShowLinkActionModal(true);
                }
              }}
              placeholder="Hoặc dán/nhập link trực tiếp vào đây..."
              className="w-full pl-9 pr-20 py-2.5 text-xs bg-black/25 border border-white/12 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:border-white/40 transition"
            />
            {inputUrl.trim() && (
              <button
                type="button"
                onClick={() => {
                  setPendingUrl(inputUrl.trim());
                  setShowLinkActionModal(true);
                }}
                className="absolute right-1.5 px-3 py-1 rounded-xl bg-white text-zinc-950 text-[11px] font-semibold transition active:scale-95"
              >
                Chọn
              </button>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-300/30 text-rose-100 text-xs flex items-start gap-2 backdrop-blur-xl">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* KHỐI 2: TRÌNH PHÁT NHẠC APPLE LIQUID GLASS (NOW PLAYING) */}
        {currentTrack && (
          <section className="liquid-glass rounded-[34px] p-5 space-y-5">
            {/* Ảnh bìa + Tên bài phong cách Apple Music */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <img
                  src={`/api/image-proxy?url=${encodeURIComponent(currentTrack.thumbnail)}`}
                  alt={currentTrack.title}
                  className={`w-20 h-20 rounded-[22px] object-cover bg-white/10 border border-white/25 shadow-[0_14px_30px_rgba(0,0,0,0.45)] transition-transform duration-500 ${
                    isPlaying ? 'scale-100' : 'scale-[0.92] opacity-85'
                  }`}
                />
                <span className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/25 text-[9px] font-bold uppercase tracking-wider text-white">
                  {currentTrack.source === 'tiktok' ? 'TikTok' : 'YouTube'}
                </span>
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-white/12 border border-white/15 text-[10px] font-medium text-white/85 tabular-nums">
                    {currentIndex + 1} / {queue.length}
                  </span>
                  {repeatMode !== 'off' && (
                    <span className="px-2 py-0.5 rounded-full bg-white/22 border border-white/30 text-[10px] font-semibold text-white">
                      {repeatMode === 'once' ? 'Lặp 1 lần' : 'Lặp vô tận ∞'}
                    </span>
                  )}
                </div>

                <h2 className="text-[15px] font-semibold tracking-tight text-white truncate">
                  {currentTrack.title}
                </h2>
                <p className="text-xs text-white/65 truncate">{currentTrack.author}</p>
              </div>

              <button
                type="button"
                onClick={() => setTrackToAddPlaylist(currentTrack)}
                title="Lưu bài này vào Playlist"
                className="liquid-btn w-10 h-10 rounded-full flex items-center justify-center text-white/85 hover:text-white shrink-0"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>

            {/* Thanh tiến trình kiểu Apple Music */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeekSlider}
                style={{
                  background: `linear-gradient(to right, rgba(255,255,255,0.95) ${progressPct}%, rgba(255,255,255,0.2) ${progressPct}%)`,
                }}
                className="apple-slider w-full"
              />
              <div className="flex justify-between text-[11px] font-medium text-white/60 tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(Math.max(0, (duration || 0) - currentTime))}</span>
              </div>
            </div>

            {/* Bộ nút điều khiển chính: Lùi bài | -5s | Play/Pause | +5s | Tiến bài */}
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={handlePrevTrack}
                className="liquid-btn w-10 h-10 rounded-full flex items-center justify-center text-white/90"
                title="Bài trước"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>

              <button
                type="button"
                onClick={() => seekRelative(-5)}
                className="liquid-btn px-3 h-10 rounded-full flex items-center gap-1 text-white/90"
                title="Tua lùi 5 giây"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold tabular-nums">-5s</span>
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                className="liquid-orb-primary w-16 h-16 rounded-full text-zinc-950 flex items-center justify-center transition active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => seekRelative(5)}
                className="liquid-btn px-3 h-10 rounded-full flex items-center gap-1 text-white/90"
                title="Tua tiến 5 giây"
              >
                <span className="text-[11px] font-semibold tabular-nums">+5s</span>
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleNextTrack}
                className="liquid-btn w-10 h-10 rounded-full flex items-center justify-center text-white/90"
                title="Bài tiếp theo"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
            </div>

            {/* Thanh phụ: Lặp bài + Dynamic Island + Hẹn giờ (15/30/45p + Đồng hồ kéo tay) + Âm lượng */}
            <div className="pt-3 border-t border-white/12 space-y-3">
              {/* Hàng 1: Chế độ lặp & Nút Dynamic Island */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={cycleRepeatMode}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition active:scale-95 ${
                    repeatMode !== 'off'
                      ? 'bg-white text-zinc-950 border-white shadow-[0_4px_16px_rgba(255,255,255,0.28)]'
                      : 'liquid-btn text-white/80'
                  }`}
                >
                  {repeatMode === 'once' ? (
                    <Repeat1 className="w-3.5 h-3.5" />
                  ) : (
                    <Repeat className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {repeatMode === 'off'
                      ? 'Tắt lặp'
                      : repeatMode === 'once'
                      ? 'Lặp 1 lần'
                      : 'Lặp vĩnh viễn ∞'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setLockScreenControlMode((prev) =>
                      prev === 'track' ? 'seek' : 'track'
                    )
                  }
                  className="liquid-btn px-3 py-1.5 rounded-full text-[11px] font-medium text-white/85"
                  title="Chọn cặp nút hiển thị trên Dynamic Island"
                >
                  Dynamic Island:{' '}
                  <b className="text-white">
                    {lockScreenControlMode === 'track' ? 'Tiến/Lùi bài' : 'Tua ±5s'}
                  </b>
                </button>
              </div>

              {/* Hàng 2: Hẹn giờ 15 / 30 / 45 phút + Nút Đồng hồ kéo tay 1-60p */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-white/80">
                  <Timer className="w-3.5 h-3.5 text-white/75" />
                  <span className="text-[11px] font-medium">Hẹn giờ:</span>
                  {sleepRemainingSec !== null && (
                    <span className="text-[11px] font-semibold text-emerald-300 tabular-nums">
                      {formatTime(sleepRemainingSec)}
                      {isFadingOut ? ' • Fade-out' : ''}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {[15, 30, 45].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() =>
                        startSleepTimer(sleepTimerMinutes === mins ? null : mins)
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition active:scale-95 ${
                        sleepTimerMinutes === mins
                          ? 'bg-white text-zinc-950 shadow'
                          : 'bg-white/10 hover:bg-white/20 border border-white/12 text-white/80'
                      }`}
                    >
                      {mins}p
                    </button>
                  ))}

                  {/* Nút Đồng hồ mở popup vòng quay đếm ngược 1-60 phút */}
                  <button
                    type="button"
                    onClick={() => setShowClockModal(true)}
                    title="Tùy chỉnh đồng hồ đếm ngược 1–60 phút"
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition active:scale-95 ${
                      isCustomSleepTime
                        ? 'bg-white text-zinc-950 shadow'
                        : 'bg-white/14 hover:bg-white/25 border border-white/20 text-white'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {isCustomSleepTime && <span>{sleepTimerMinutes}p</span>}
                  </button>

                  {sleepTimerMinutes !== null && (
                    <button
                      type="button"
                      onClick={() => startSleepTimer(null)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/25 border border-rose-300/30 text-rose-100"
                    >
                      Tắt
                    </button>
                  )}
                </div>
              </div>

              {/* Hàng 3: Thanh Âm lượng */}
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-4 h-4 text-white/60 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={handleVolumeSlider}
                  style={{
                    background: `linear-gradient(to right, rgba(255,255,255,0.9) ${volumePct}%, rgba(255,255,255,0.2) ${volumePct}%)`,
                  }}
                  className="apple-slider w-full"
                />
                <span className="text-[10px] font-medium text-white/50 w-7 text-right tabular-nums">
                  {volumePct}%
                </span>
              </div>
            </div>
          </section>
        )}

        {/* KHỐI 3: THƯ VIỆN KÍNH LỎNG (TIẾP THEO • PLAYLIST • ĐÃ NGHE) */}
        <section className="liquid-glass rounded-[32px] p-4 space-y-3.5">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/30 border border-white/12">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`py-2 px-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'queue'
                  ? 'bg-white text-zinc-950 shadow-[0_4px_16px_rgba(255,255,255,0.2)]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Tiếp ({queue.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('playlists')}
              className={`py-2 px-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'playlists'
                  ? 'bg-white text-zinc-950 shadow-[0_4px_16px_rgba(255,255,255,0.2)]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Playlist ({playlists.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-2 px-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'history'
                  ? 'bg-white text-zinc-950 shadow-[0_4px_16px_rgba(255,255,255,0.2)]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Đã nghe ({history.length})</span>
            </button>
          </div>

          {/* TAB 1: HÀNG ĐỢI TIẾP THEO */}
          {activeTab === 'queue' && (
            <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
              {queue.length === 0 ? (
                <p className="text-center text-xs text-white/50 py-8">
                  Danh sách phát trống. Hãy bấm nút Dán nhanh ở trên hoặc chọn bài từ Lịch sử!
                </p>
              ) : (
                queue.map((item, idx) => {
                  const isCurrent = idx === currentIndex;
                  return (
                    <div
                      key={`${item.id}_${idx}`}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl border transition ${
                        isCurrent
                          ? 'bg-white/16 border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]'
                          : 'bg-black/20 border-white/10 hover:bg-white/8'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => playTrackAtIndex(idx)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <img
                          src={`/api/image-proxy?url=${encodeURIComponent(item.thumbnail)}`}
                          alt={item.title}
                          className="w-10 h-10 rounded-xl object-cover bg-white/10 border border-white/15 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {isCurrent ? '▶ ' : `${idx + 1}. `}
                            {item.title}
                          </p>
                          <p className="text-[11px] text-white/60 truncate">
                            {item.author}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrackToAddPlaylist(item)}
                        title="Lưu vào Playlist"
                        className="p-1.5 text-white/55 hover:text-white transition"
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
                        className="p-1.5 text-white/45 hover:text-rose-300 transition"
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
                  className="flex-1 px-3.5 py-2.5 text-xs bg-black/30 border border-white/15 rounded-2xl text-white placeholder-white/45 focus:outline-none focus:border-white/40"
                />
                <button
                  type="submit"
                  className="liquid-orb-primary px-3.5 py-2 rounded-2xl text-zinc-950 text-xs font-semibold flex items-center gap-1 shrink-0 active:scale-95 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo</span>
                </button>
              </form>

              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium shrink-0 border transition ${
                      selectedPlaylist?.id === pl.id
                        ? 'bg-white text-zinc-950 border-white shadow'
                        : 'bg-white/10 border-white/12 text-white/75 hover:text-white'
                    }`}
                  >
                    {pl.name} ({pl.tracks.length})
                  </button>
                ))}
              </div>

              {selectedPlaylist && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-black/25 border border-white/12">
                    <div>
                      <h3 className="text-xs font-semibold text-white">
                        {selectedPlaylist.name}
                      </h3>
                      <p className="text-[10px] text-white/55">
                        {selectedPlaylist.tracks.length} bài • Tự động phát liên tục
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => playEntirePlaylist(selectedPlaylist, 0)}
                        className="liquid-orb-primary px-3 py-1.5 rounded-full text-zinc-950 text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Phát tất cả</span>
                      </button>
                      {playlists.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                          className="p-1.5 rounded-full bg-rose-500/20 border border-rose-300/25 text-rose-200 hover:bg-rose-500/30"
                          title="Xóa Playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                    {selectedPlaylist.tracks.length === 0 ? (
                      <p className="text-center text-xs text-white/50 py-6">
                        Playlist trống. Bấm biểu tượng thư mục (+) trên bài hát để thêm vào đây!
                      </p>
                    ) : (
                      selectedPlaylist.tracks.map((item, idx) => (
                        <div
                          key={`${item.id}_${idx}`}
                          className="flex items-center gap-3 p-2 rounded-2xl bg-black/20 border border-white/10 hover:bg-white/8 transition"
                        >
                          <button
                            type="button"
                            onClick={() => playEntirePlaylist(selectedPlaylist, idx)}
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                          >
                            <img
                              src={`/api/image-proxy?url=${encodeURIComponent(
                                item.thumbnail
                              )}`}
                              alt={item.title}
                              className="w-9 h-9 rounded-xl object-cover bg-white/10 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-white truncate">
                                {idx + 1}. {item.title}
                              </p>
                              <p className="text-[10px] text-white/55 truncate">
                                {item.author}
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              removeTrackFromPlaylist(selectedPlaylist.id, item.id)
                            }
                            className="p-1.5 text-white/45 hover:text-rose-300"
                            title="Xóa khỏi Playlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
                <p className="text-center text-xs text-white/50 py-8">
                  Lịch sử trống. Các bài từng nghe sẽ lưu lại tại đây để lần sau ấn vô là phát ngay!
                </p>
              ) : (
                <>
                  <div className="flex justify-between items-center px-1 mb-1">
                    <span className="text-[11px] text-white/55">
                      Ấn vào bài để phát ngay
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setHistory([]);
                        localStorage.removeItem(STORAGE_KEYS.HISTORY);
                        showToast('Đã xóa lịch sử');
                      }}
                      className="text-[11px] text-white/50 hover:text-rose-300"
                    >
                      Xóa tất cả
                    </button>
                  </div>
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 rounded-2xl bg-black/20 border border-white/10 hover:bg-white/10 transition"
                    >
                      <button
                        type="button"
                        onClick={() => playFromSavedTrack(item, true)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <img
                          src={`/api/image-proxy?url=${encodeURIComponent(item.thumbnail)}`}
                          alt={item.title}
                          className="w-10 h-10 rounded-xl object-cover bg-white/10 border border-white/15 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-white/60 truncate">
                            {item.author} •{' '}
                            <span className="uppercase text-[9px] text-white/80">
                              {item.source}
                            </span>
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => playFromSavedTrack(item, false)}
                        title="Thêm vào Tiếp theo"
                        className="liquid-btn p-2 rounded-xl text-white/85"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrackToAddPlaylist(item)}
                        title="Lưu vào Playlist"
                        className="liquid-btn p-2 rounded-xl text-white/85"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>

        {/* GHI CHÚ DYNAMIC ISLAND */}
        <footer className="liquid-pill px-4 py-3 rounded-[24px] flex items-center gap-2.5 text-[11px] text-white/75">
          <Smartphone className="w-4 h-4 text-white shrink-0" />
          <span>
            <b className="text-white">Dynamic Island &amp; Khóa màn hình:</b> Hiển thị ảnh đại diện,
            tiến/lùi bài hát và chạy nền liên tục khi tắt màn hình hoặc thoát Safari.
          </span>
        </footer>

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
