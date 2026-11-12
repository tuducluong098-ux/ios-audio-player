'use client';

import React from 'react';

export type WallpaperTheme = 'aurora' | 'cosmos' | 'ocean' | 'sunset' | 'minimal';

export interface WallpaperPreset {
  id: WallpaperTheme;
  label: string;
  swatch: string;
  baseColor: string;
  meshBackground: string;
  ribbonOne: string;
  ribbonTwo: string;
  orbTopLeft: string;
  orbRight: string;
  orbBottom: string;
  starColor: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'aurora',
    label: 'Cực quang',
    swatch: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 52%, #ec4899 100%)',
    baseColor: '#060a1e',
    meshBackground:
      'radial-gradient(125% 85% at 12% 10%, rgba(34,211,238,0.42) 0%, transparent 58%), radial-gradient(115% 80% at 90% 22%, rgba(236,72,153,0.38) 0%, transparent 56%), radial-gradient(130% 90% at 50% 96%, rgba(99,102,241,0.46) 0%, transparent 64%)',
    ribbonOne:
      'linear-gradient(118deg, transparent 10%, rgba(34,211,238,0.38) 36%, rgba(129,140,248,0.42) 55%, rgba(236,72,153,0.34) 76%, transparent 92%)',
    ribbonTwo:
      'linear-gradient(245deg, transparent 14%, rgba(56,189,248,0.3) 40%, rgba(168,85,247,0.34) 62%, transparent 88%)',
    orbTopLeft:
      'radial-gradient(circle, rgba(34,211,238,0.46) 0%, rgba(56,189,248,0.18) 46%, transparent 74%)',
    orbRight:
      'radial-gradient(circle, rgba(236,72,153,0.42) 0%, rgba(192,132,252,0.15) 46%, transparent 74%)',
    orbBottom:
      'radial-gradient(circle, rgba(129,140,248,0.44) 0%, rgba(79,70,229,0.16) 46%, transparent 74%)',
    starColor: 'rgba(186, 230, 253, 0.92)',
  },
  {
    id: 'cosmos',
    label: 'Ngân hà',
    swatch: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 55%, #38bdf8 100%)',
    baseColor: '#0c0720',
    meshBackground:
      'radial-gradient(125% 85% at 18% 10%, rgba(168,85,247,0.46) 0%, transparent 58%), radial-gradient(115% 80% at 88% 26%, rgba(232,121,249,0.38) 0%, transparent 58%), radial-gradient(130% 90% at 45% 94%, rgba(59,130,246,0.4) 0%, transparent 64%)',
    ribbonOne:
      'linear-gradient(124deg, transparent 12%, rgba(168,85,247,0.4) 38%, rgba(236,72,153,0.36) 58%, rgba(56,189,248,0.28) 78%, transparent 92%)',
    ribbonTwo:
      'linear-gradient(238deg, transparent 14%, rgba(192,132,252,0.32) 44%, rgba(99,102,241,0.34) 66%, transparent 88%)',
    orbTopLeft:
      'radial-gradient(circle, rgba(168,85,247,0.48) 0%, rgba(139,92,246,0.18) 46%, transparent 74%)',
    orbRight:
      'radial-gradient(circle, rgba(244,114,182,0.42) 0%, rgba(217,70,239,0.16) 46%, transparent 74%)',
    orbBottom:
      'radial-gradient(circle, rgba(56,189,248,0.38) 0%, rgba(99,102,241,0.15) 46%, transparent 74%)',
    starColor: 'rgba(245, 208, 254, 0.94)',
  },
  {
    id: 'ocean',
    label: 'Biển đêm',
    swatch: 'linear-gradient(135deg, #0ea5e9 0%, #14b8a6 55%, #1d4ed8 100%)',
    baseColor: '#040e1f',
    meshBackground:
      'radial-gradient(125% 85% at 16% 10%, rgba(14,165,233,0.44) 0%, transparent 58%), radial-gradient(115% 80% at 88% 26%, rgba(20,184,166,0.38) 0%, transparent 58%), radial-gradient(130% 90% at 50% 95%, rgba(37,99,235,0.44) 0%, transparent 64%)',
    ribbonOne:
      'linear-gradient(116deg, transparent 12%, rgba(45,212,191,0.36) 38%, rgba(56,189,248,0.4) 60%, rgba(59,130,246,0.3) 78%, transparent 92%)',
    ribbonTwo:
      'linear-gradient(242deg, transparent 16%, rgba(34,211,238,0.32) 44%, rgba(16,185,129,0.3) 64%, transparent 88%)',
    orbTopLeft:
      'radial-gradient(circle, rgba(34,211,238,0.46) 0%, rgba(14,165,233,0.18) 46%, transparent 74%)',
    orbRight:
      'radial-gradient(circle, rgba(45,212,191,0.42) 0%, rgba(20,184,166,0.16) 46%, transparent 74%)',
    orbBottom:
      'radial-gradient(circle, rgba(59,130,246,0.46) 0%, rgba(37,99,235,0.18) 46%, transparent 74%)',
    starColor: 'rgba(165, 243, 252, 0.92)',
  },
  {
    id: 'sunset',
    label: 'Hoàng hôn',
    swatch: 'linear-gradient(135deg, #f97316 0%, #ec4899 52%, #7c3aed 100%)',
    baseColor: '#160819',
    meshBackground:
      'radial-gradient(125% 85% at 16% 12%, rgba(251,146,60,0.38) 0%, transparent 58%), radial-gradient(115% 80% at 88% 24%, rgba(236,72,153,0.42) 0%, transparent 58%), radial-gradient(130% 90% at 48% 95%, rgba(139,92,246,0.42) 0%, transparent 64%)',
    ribbonOne:
      'linear-gradient(120deg, transparent 12%, rgba(251,146,60,0.34) 38%, rgba(244,63,94,0.38) 58%, rgba(168,85,247,0.32) 78%, transparent 92%)',
    ribbonTwo:
      'linear-gradient(246deg, transparent 14%, rgba(251,191,36,0.26) 42%, rgba(236,72,153,0.32) 64%, transparent 88%)',
    orbTopLeft:
      'radial-gradient(circle, rgba(251,146,60,0.42) 0%, rgba(244,63,94,0.16) 46%, transparent 74%)',
    orbRight:
      'radial-gradient(circle, rgba(236,72,153,0.46) 0%, rgba(217,70,239,0.16) 46%, transparent 74%)',
    orbBottom:
      'radial-gradient(circle, rgba(139,92,246,0.42) 0%, rgba(124,58,237,0.16) 46%, transparent 74%)',
    starColor: 'rgba(254, 215, 170, 0.92)',
  },
  {
    id: 'minimal',
    label: 'OLED Đen',
    swatch: 'linear-gradient(135deg, #1e293b 0%, #0f172a 55%, #020617 100%)',
    baseColor: '#04060c',
    meshBackground:
      'radial-gradient(100% 70% at 50% 0%, rgba(56,189,248,0.12) 0%, transparent 55%), radial-gradient(100% 70% at 50% 100%, rgba(99,102,241,0.12) 0%, transparent 60%)',
    ribbonOne:
      'linear-gradient(120deg, transparent 25%, rgba(56,189,248,0.09) 50%, transparent 75%)',
    ribbonTwo: 'none',
    orbTopLeft:
      'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 68%)',
    orbRight:
      'radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 68%)',
    orbBottom:
      'radial-gradient(circle, rgba(129,140,248,0.12) 0%, transparent 68%)',
    starColor: 'rgba(226, 232, 240, 0.5)',
  },
];

// 10 ngôi sao lấp lánh cố định vị trí (0 layout reflow, pure GPU opacity + scale)
const TWINKLE_STARS = [
  { x: '11%', y: '14%', size: 2.5, dur: '3.8s', delay: '-0.4s' },
  { x: '28%', y: '8%', size: 2, dur: '4.6s', delay: '-1.7s' },
  { x: '52%', y: '16%', size: 3, dur: '3.4s', delay: '-2.2s' },
  { x: '76%', y: '11%', size: 2.2, dur: '4.9s', delay: '-0.9s' },
  { x: '91%', y: '22%', size: 2.5, dur: '4.1s', delay: '-3.1s' },
  { x: '16%', y: '46%', size: 2, dur: '5.2s', delay: '-1.2s' },
  { x: '84%', y: '48%', size: 2.8, dur: '3.9s', delay: '-2.6s' },
  { x: '23%', y: '76%', size: 2.2, dur: '4.5s', delay: '-0.6s' },
  { x: '68%', y: '72%', size: 2.6, dur: '3.6s', delay: '-2.8s' },
  { x: '89%', y: '84%', size: 2, dur: '5.0s', delay: '-1.9s' },
];

interface AmbientWallpaperProps {
  theme: WallpaperTheme;
  thumbnailUrl?: string;
  isPlaying: boolean;
}

/**
 * Nền Neon Liquid Glass đa tầng (Cực quang / Ngân hà / Biển đêm / Hoàng hôn / OLED),
 * tối ưu hoàn toàn trên GPU iOS Safari để không giật khung hình và không tốn RAM.
 */
export const AmbientWallpaper = React.memo(function AmbientWallpaper({
  theme,
  thumbnailUrl,
  isPlaying,
}: AmbientWallpaperProps) {
  const preset =
    WALLPAPER_PRESETS.find((item) => item.id === theme) || WALLPAPER_PRESETS[0];

  return (
    <div
      aria-hidden="true"
      style={{ backgroundColor: preset.baseColor, contain: 'strict' }}
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none transition-colors duration-700"
    >
      {/* Lưới ánh sáng nền tĩnh (zero repaint) */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ backgroundImage: preset.meshBackground }}
      />

      {/* Dải cực quang uốn lượn mượt bằng transform3d */}
      <div
        className="la-aurora-ribbon is-primary"
        style={{ background: preset.ribbonOne }}
      />
      {preset.ribbonTwo !== 'none' && (
        <div
          className="la-aurora-ribbon is-secondary"
          style={{ background: preset.ribbonTwo }}
        />
      )}

      {/* Các khối hào quang trôi chậm đa chiều */}
      <div
        className="animate-orb-slow absolute -top-28 -left-24 w-[28rem] h-[28rem] rounded-full will-change-transform"
        style={{ background: preset.orbTopLeft }}
      />
      <div
        className="animate-orb-reverse absolute top-[22%] -right-28 w-[28rem] h-[28rem] rounded-full will-change-transform"
        style={{ background: preset.orbRight }}
      />
      <div
        className="animate-orb-slow absolute -bottom-36 left-[18%] w-[29rem] h-[29rem] rounded-full will-change-transform"
        style={{ background: preset.orbBottom }}
      />

      {/* Lưới ánh sáng chân trời cực mảnh giúp Liquid Glass nổi khối rõ nét */}
      {theme !== 'minimal' && <div className="la-horizon-grid" />}

      {/* Bìa album phóng mờ hòa quyện vào nền khi phát nhạc */}
      {thumbnailUrl && (
        <img
          src={`/api/image-proxy?url=${encodeURIComponent(thumbnailUrl)}`}
          alt=""
          loading="lazy"
          decoding="async"
          className={`la-ambient-backdrop ${isPlaying ? 'is-playing' : ''}`}
        />
      )}

      {/* Sao lấp lánh vi mô tăng chiều sâu không gian */}
      {theme !== 'minimal' &&
        TWINKLE_STARS.map((star, idx) => (
          <span
            key={idx}
            className="la-star-dot"
            style={
              {
                left: star.x,
                top: star.y,
                width: `${star.size}px`,
                height: `${star.size}px`,
                backgroundColor: preset.starColor,
                animationDuration: star.dur,
                animationDelay: star.delay,
              } as React.CSSProperties
            }
          />
        ))}

      {/* Lớp phủ tương phản dịu mắt giúp chữ trắng sắc nét mọi góc nhìn */}
      <div
        className="absolute inset-0"
        style={{
          background:
            theme === 'minimal'
              ? 'linear-gradient(180deg, rgba(4,6,12,0.45) 0%, rgba(4,6,12,0.58) 50%, rgba(4,6,12,0.92) 100%)'
              : 'linear-gradient(180deg, rgba(5,8,20,0.22) 0%, rgba(5,8,20,0.12) 45%, rgba(5,8,20,0.58) 100%)',
        }}
      />
    </div>
  );
});
