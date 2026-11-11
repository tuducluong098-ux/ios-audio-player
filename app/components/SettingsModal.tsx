'use client';

import React, { useRef, useState } from 'react';
import {
  Settings,
  X,
  Smartphone,
  Volume2,
  Download,
  Upload,
  SkipForward,
  RotateCw,
  Cloud,
  RefreshCw,
  LogOut,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  User,
  Sparkles,
} from 'lucide-react';

interface SyncSession {
  username: string;
  syncKey: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lockScreenControlMode: 'track' | 'seek';
  onChangeLockScreenMode: (mode: 'track' | 'seek') => void;
  volume: number;
  onChangeVolume: (val: number) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  savedCount: { playlists: number; history: number };
  // Đồng bộ Cloud (Upstash Redis + Tên & PIN 4 số)
  syncSession: SyncSession | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: number | null;
  onLoginSync: (username: string, pin: string) => Promise<void>;
  onManualSync: () => Promise<void>;
  onLogoutSync: () => void;
  // Bật / tắt tính năng Gợi ý bài hát liên quan
  suggestionsEnabled: boolean;
  onToggleSuggestions: (enabled: boolean) => void;
}

/**
 * Popup Cài đặt mở từ nút bánh răng góc phải trên cùng:
 * - Đồng bộ Cloud bằng Tên (<=10 ký tự không dấu) + PIN 4 số (Upstash Redis)
 * - Chuyển nút Dynamic Island (Đổi bài vs Tua ±5s)
 * - Thanh Âm lượng
 * - Sao lưu / Khôi phục file Backup (.json)
 */
export function SettingsModal({
  isOpen,
  onClose,
  lockScreenControlMode,
  onChangeLockScreenMode,
  volume,
  onChangeVolume,
  onExportBackup,
  onImportBackup,
  savedCount,
  syncSession,
  syncStatus,
  lastSyncedAt,
  onLoginSync,
  onManualSync,
  onLogoutSync,
  suggestionsEnabled,
  onToggleSuggestions,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSubmittingSync, setIsSubmittingSync] = useState(false);

  if (!isOpen) return null;

  const volumePct = Math.round(volume * 100);

  const handleSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncError(null);

    const cleanName = usernameInput.trim().toLowerCase();
    const cleanPin = pinInput.trim();

    if (!/^[a-z0-9]{1,10}$/.test(cleanName)) {
      setSyncError('Tên chỉ dùng chữ thường không dấu hoặc số (tối đa 10 ký tự).');
      return;
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      setSyncError('Mã PIN phải gồm đúng 4 chữ số.');
      return;
    }

    setIsSubmittingSync(true);
    try {
      await onLoginSync(cleanName, cleanPin);
      setUsernameInput('');
      setPinInput('');
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Không thể kết nối đồng bộ.');
    } finally {
      setIsSubmittingSync(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
      <div className="liquid-glass w-full max-w-sm rounded-[34px] p-5 space-y-4 max-h-[88vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-cyan-400/15 border border-cyan-300/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Cài đặt</h3>
              <p className="text-xs text-white/60">Đồng bộ Cloud &amp; Dynamic Island</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="liquid-btn w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. ĐỒNG BỘ CLOUD BẰNG TÊN + PIN 4 SỐ (UPSTASH REDIS) */}
        <div className="p-4 rounded-2xl bg-white/5 border border-cyan-300/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-cyan-300" />
              <span className="text-sm font-semibold text-white">
                Đồng bộ bài hát Cloud
              </span>
            </div>
            {syncSession && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-[10px] font-semibold text-emerald-300">
                Đang bật
              </span>
            )}
          </div>

          {syncSession ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full neon-orb-primary flex items-center justify-center text-xs font-bold text-white uppercase">
                    {syncSession.username.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      @{syncSession.username}
                    </p>
                    <p className="text-[11px] text-white/60 flex items-center gap-1">
                      {syncStatus === 'syncing' ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-cyan-300" />
                          <span>Đang đồng bộ...</span>
                        </>
                      ) : syncStatus === 'error' ? (
                        <span className="text-rose-300">Lỗi đồng bộ gần nhất</span>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                          <span>
                            {lastSyncedAt
                              ? `Đã lưu lúc ${new Date(lastSyncedAt).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : 'Tự động lưu khi nghe'}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={syncStatus === 'syncing'}
                  onClick={onManualSync}
                  className="liquid-btn py-2.5 px-3 rounded-xl text-xs font-semibold text-cyan-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                  />
                  <span>Đồng bộ ngay</span>
                </button>

                <button
                  type="button"
                  onClick={onLogoutSync}
                  className="liquid-btn py-2.5 px-3 rounded-xl text-xs font-semibold text-rose-200 flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSyncSubmit} className="space-y-2.5">
              <p className="text-xs text-white/65 leading-relaxed">
                Nhập Tên (≤10 ký tự không dấu) &amp; PIN 4 số để lưu kho nhạc trên Cloud. Nếu tên chưa có sẽ tự tạo mới ngay!
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="relative flex items-center">
                  <User className="w-3.5 h-3.5 text-white/45 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    maxLength={10}
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={usernameInput}
                    onChange={(e) =>
                      setUsernameInput(
                        e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
                      )
                    }
                    placeholder="Tên (vd: luong)"
                    className="w-full pl-8 pr-2.5 py-2.5 text-sm bg-black/35 border border-white/15 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-cyan-400/60"
                  />
                </div>

                <div className="relative flex items-center">
                  <Lock className="w-3.5 h-3.5 text-white/45 absolute left-3 pointer-events-none" />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) =>
                      setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="PIN 4 số"
                    className="w-full pl-8 pr-2.5 py-2.5 text-sm bg-black/35 border border-white/15 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-cyan-400/60 tracking-widest"
                  />
                </div>
              </div>

              {syncError && (
                <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-300/30 text-rose-100 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
                  <span>{syncError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingSync || !usernameInput || pinInput.length !== 4}
                className="neon-orb-primary w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
              >
                {isSubmittingSync ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang kết nối...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4" />
                    <span>Đăng nhập / Tạo mới</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* 2. Chức năng Dynamic Island: Đổi bài vs Tua ±5s */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              Nút trên Dynamic Island
            </span>
            <span className="text-[11px] text-cyan-300 font-medium">Màn hình khóa</span>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            Chọn cặp nút hiển thị trên Dynamic Island &amp; Khóa màn hình iPhone:
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeLockScreenMode('track')}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
                lockScreenControlMode === 'track'
                  ? 'neon-orb-primary text-white border-transparent'
                  : 'bg-white/5 border-white/15 text-white/75 hover:text-white'
              }`}
            >
              <SkipForward className="w-4 h-4" />
              <span>Đổi bài</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeLockScreenMode('seek')}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
                lockScreenControlMode === 'seek'
                  ? 'neon-orb-primary text-white border-transparent'
                  : 'bg-white/5 border-white/15 text-white/75 hover:text-white'
              }`}
            >
              <RotateCw className="w-4 h-4" />
              <span>Tua ±5 giây</span>
            </button>
          </div>
        </div>

        {/* 2B. Bật / Tắt tính năng Gợi ý bài hát */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-pink-300 shrink-0" />
              <span className="text-sm font-semibold text-white">
                Gợi ý &amp; Tự phát tiếp
              </span>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              Hiện tab Gợi ý (YouTube, SoundCloud, TikTok, Spotify) và tự nối bài khi hết danh sách.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={suggestionsEnabled}
            onClick={() => onToggleSuggestions(!suggestionsEnabled)}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 p-1 ${
              suggestionsEnabled
                ? 'bg-gradient-to-r from-cyan-400 to-pink-500 shadow-[0_0_14px_rgba(34,211,238,0.4)]'
                : 'bg-white/15 border border-white/20'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                suggestionsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 3. Thanh Âm lượng */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-300" />
              <span className="text-sm font-semibold text-white">Âm lượng phát</span>
            </div>
            <span className="text-xs font-semibold text-white/75 tabular-nums">
              {volumePct}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, #22d3ee 0%, #ec4899 ${volumePct}%, rgba(255,255,255,0.18) ${volumePct}%)`,
            }}
            className="apple-slider w-full"
          />
          <p className="text-[11px] text-white/50">
            Trên iPhone hãy dùng nút âm lượng cứng ở cạnh máy (iOS khóa web chỉnh âm lượng).
          </p>
        </div>

        {/* 4. Sao lưu & Khôi phục thủ công (.json) */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
          <div>
            <h4 className="text-sm font-semibold text-white">
              Backup thủ công (.json)
            </h4>
            <p className="text-xs text-white/60 mt-0.5">
              Đang lưu {savedCount.playlists} playlist &amp; {savedCount.history} bài đã nghe.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="liquid-btn py-2.5 px-3 rounded-xl text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Xuất file</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="liquid-btn py-2.5 px-3 rounded-xl text-xs font-semibold text-pink-300 flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>Nhập file</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportBackup(file);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        {/* 5. Mẹo chạy nền iOS */}
        <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-start gap-2.5 text-xs leading-relaxed text-white/75">
          <Smartphone className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <span>
            Mở bằng <b className="text-white">Safari</b> (hoặc Thêm vào Màn hình chính) để nhạc chạy nền mượt trên <b className="text-white">Dynamic Island</b> khi tắt màn hình.
          </span>
        </div>
      </div>
    </div>
  );
}
