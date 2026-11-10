import { NextRequest, NextResponse } from 'next/server';
import { Ytdl, chooseFormat, Quality } from '@distube/ytdl-core';

// Ép chạy trên Node.js runtime của Vercel Serverless
export const runtime = 'nodejs';
export const maxDuration = 10; // Giới hạn gói miễn phí Vercel (10 giây)

// Tái sử dụng 1 phiên Ytdl để cache visitorData & giải mã nhanh hơn cho các lần gọi sau
const ytdl = new Ytdl({ timeoutMs: 8000 });

export interface ExtractedAudio {
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

/**
 * 1. Xử lý link TikTok qua TikWM Public API (Nhanh, ổn định, lấy trực tiếp MP3/M4A)
 */
async function extractTikTok(url: string): Promise<ExtractedAudio> {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error('Không thể kết nối tới máy chủ giải mã TikTok.');
  }

  const json = await res.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'Link TikTok không hợp lệ hoặc ở chế độ riêng tư.');
  }

  const data = json.data;
  const audioUrl = data.music_info?.play || data.music || data.play;

  if (!audioUrl) {
    throw new Error('Không tìm thấy luồng âm thanh từ video TikTok này.');
  }

  const rawThumb =
    data.origin_cover ||
    data.cover ||
    data.author?.avatar ||
    'https://placehold.co/512x512/18181b/ffffff.jpg?text=TikTok';

  return {
    id: `tt_${data.id || Date.now()}`,
    originalUrl: url,
    audioUrl,
    title: data.title || data.music_info?.title || 'TikTok Audio',
    author: data.author?.nickname || data.music_info?.author || 'TikTok Creator',
    thumbnail: rawThumb,
    source: 'tiktok',
    mimeType: 'audio/mp4',
    extractedAt: Date.now(),
  };
}

/**
 * 2. Xử lý link YouTube bằng @distube/ytdl-core v5 (ưu tiên M4A/MP4 cho iOS Safari)
 * và fallback qua Piped API công cộng nếu cần.
 */
async function extractYouTube(url: string): Promise<ExtractedAudio> {
  const videoIdMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/|.*shorts\/))([^&?/]+)/
  );
  const videoId = videoIdMatch ? videoIdMatch[1] : `${Date.now()}`;

  try {
    const info = await ytdl.getInfo(url, {
      signal: AbortSignal.timeout(8000),
    });

    // Chỉ lọc các định dạng có sẵn direct URL (bỏ qua SABR-only không có url)
    const directFormats = info.formats.filter((f) => Boolean(f.url) && !f.isDrm && !f.isOtf);

    let chosenFormat = null;
    try {
      // Ưu tiên 1: Audio-only container mp4 (M4A/AAC) — chuẩn tốt nhất cho iOS Safari Background Audio
      chosenFormat = chooseFormat(directFormats, {
        quality: Quality.HighestAudio,
        filter: [
          { hasAudio: true, hasVideo: false, container: 'mp4' },
          { hasAudio: true, hasVideo: false },
          { hasAudio: true, container: 'mp4' },
          { hasAudio: true },
        ],
      });
    } catch {
      chosenFormat =
        directFormats.find((f) => f.hasAudio && !f.hasVideo && f.container === 'mp4') ||
        directFormats.find((f) => f.hasAudio && !f.hasVideo) ||
        directFormats.find((f) => f.hasAudio) ||
        null;
    }

    if (chosenFormat?.url) {
      const thumbnails = info.videoDetails.thumbnails;
      const bestThumb =
        thumbnails.find((t) => t.url.includes('.jpg'))?.url ||
        thumbnails[thumbnails.length - 1]?.url ||
        `https://i.ytimg.com/vi/${info.videoDetails.id || videoId}/hqdefault.jpg`;

      return {
        id: `yt_${info.videoDetails.id || videoId}`,
        originalUrl: url,
        audioUrl: chosenFormat.url,
        title: info.videoDetails.title || 'YouTube Audio',
        author: info.videoDetails.author?.name || 'YouTube Channel',
        thumbnail: bestThumb,
        source: 'youtube',
        mimeType: chosenFormat.mimeType?.split(';')[0] || 'audio/mp4',
        extractedAt: Date.now(),
      };
    }
  } catch (ytdlError) {
    console.warn('ytdl-core v5 gặp sự cố, thử Piped API fallback...', ytdlError);
  }

  // Fallback qua Piped API công cộng
  if (!videoIdMatch) {
    throw new Error('Không nhận diện được Video ID của YouTube.');
  }

  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
  ];

  for (const instance of pipedInstances) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const audioStreams: Array<{ url: string; mimeType: string; bitrate: number }> =
        data.audioStreams || [];

      const m4aStream =
        audioStreams.find((s) => s.mimeType?.includes('audio/mp4')) || audioStreams[0];

      if (m4aStream?.url) {
        return {
          id: `yt_${videoId}`,
          originalUrl: url,
          audioUrl: m4aStream.url,
          title: data.title || 'YouTube Audio',
          author: data.uploader || 'YouTube',
          thumbnail:
            data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          source: 'youtube',
          mimeType: m4aStream.mimeType || 'audio/mp4',
          extractedAt: Date.now(),
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    'Không thể trích xuất âm thanh YouTube lúc này. Vui lòng thử link khác hoặc link TikTok.'
  );
}

/**
 * Handler chính cho POST /api/extract
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUrl = (body?.url || '').trim();

    if (!rawUrl) {
      return NextResponse.json({ error: 'Vui lòng nhập đường dẫn (URL).' }, { status: 400 });
    }

    const isTikTok = /tiktok\.com/i.test(rawUrl);
    const isYouTube = /(youtube\.com|youtu\.be)/i.test(rawUrl);

    if (!isTikTok && !isYouTube) {
      return NextResponse.json(
        { error: 'Chỉ hỗ trợ đường dẫn từ TikTok hoặc YouTube.' },
        { status: 400 }
      );
    }

    const result = isTikTok
      ? await extractTikTok(rawUrl)
      : await extractYouTube(rawUrl);

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định khi trích xuất.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
