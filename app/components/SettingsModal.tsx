'use client';

import React, { useRef } from 'react';
import {
  Settings,
  X,
  Smartphone,
  Volume2,
  Download,
  Upload,
  SkipForward,
  RotateCw,
} from 'lucide-react';

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
}

/**
 * Popup Cài đặt mở từ nút bánh răng góc phải trên cùng:
 * - Chuyển nút Dynamic Island (Tiến/Lùi bài vs Tua ±5s)
 * - Thanh Âm lượng
 * - Sao lưu / Khôi phục danh sách bài hát (.json) để đổi trình duyệt không bị mất
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
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const volumePct = Math.round(volume * 100);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
      <div className="liquid-glass w-full max-w-sm rounded-[34px] p-5 space-y-5 max-h-[88vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-cyan-400/15 border border-cyan-300/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Cài đặt</h3>
              <p className="text-xs text-white/60">Dynamic Island &amp; Dữ liệu</p>
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

        {/* 1. Chức năng Dynamic Island: Tiến/Lùi bài vs Tua ±5s */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              Nút trên Dynamic Island
            </span>
            <span className="text-[11px] text-cyan-300 font-medium">Màn hình khóa</span>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            iOS chỉ hiển thị 1 cặp nút trên Dynamic Island &amp; Khóa màn hình. Chọn chức năng bạn muốn dùng nhanh:
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeLockScreenMode('track')}
              className={`py-3 px-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
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
              className={`py-3 px-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
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

        {/* 2. Thanh Âm lượng */}
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
            Trên iPhone, hãy dùng thêm nút âm lượng cứng ở cạnh máy (iOS khóa chỉnh âm lượng bằng web).
          </p>
        </div>

        {/* 3. Sao lưu & Khôi phục bài hát khi đổi trình duyệt */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-white">
              Sao lưu &amp; Chuyển trình duyệt
            </h4>
            <p className="text-xs text-white/60 mt-0.5">
              Hiện có {savedCount.playlists} playlist và {savedCount.history} bài đã nghe. Xuất file để không mất khi đổi trình duyệt/máy.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="liquid-btn py-2.5 px-3 rounded-xl text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Backup</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="liquid-btn py-2.5 px-3 rounded-xl text-xs font-semibold text-pink-300 flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>Nhập Backup</span>
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

        {/* 4. Mẹo chạy nền iOS */}
        <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-start gap-2.5 text-xs leading-relaxed text-white/75">
          <Smartphone className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <span>
            Mở bằng <b className="text-white">Safari</b> (hoặc Thêm vào Màn hình chính) để nhạc chạy nền mượt trên <b className="text-white">Dynamic Island</b> kể cả khi khóa máy.
          </span>
        </div>
      </div>
    </div>
  );
}
