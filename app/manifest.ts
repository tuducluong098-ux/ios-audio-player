import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LiquidAudio — Nghe nhạc nền iOS',
    short_name: 'LiquidAudio',
    description:
      'Trình phát âm thanh nền phong cách Apple Liquid Glass cho TikTok, YouTube, SoundCloud & Spotify.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05070e',
    theme_color: '#05070e',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
