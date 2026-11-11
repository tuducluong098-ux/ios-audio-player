import { NextRequest, NextResponse } from 'next/server';
import { Ytdl, chooseFormat, Quality } from '@distube/ytdl-core';

// Ép chạy trên Node.js runtime của Vercel Serverless
export const runtime = 'nodejs';
export const maxDuration = 10; // Giới hạn gói miễn phí Vercel (10 giây)

const ytdl = new Ytdl({ timeoutMs: 8000 });

let cachedScClientId: string | null = null;
let cachedScClientIdAt = 0;
const SC_CLIENT_ID_TTL = 12 * 60 * 60 * 1000;

export interface ExtractedAudio {
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

/**
 * 1. Xử lý link TikTok qua TikWM Public API
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
 * 2. Lấy SoundCloud client_id tự động từ trang chủ SoundCloud
 */
async function getSoundCloudClientId(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    cachedScClientId &&
    Date.now() - cachedScClientIdAt < SC_CLIENT_ID_TTL
  ) {
    return cachedScClientId;
  }

  const pageRes = await fetch('https://soundcloud.com', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!pageRes.ok) {
    throw new Error('Không thể kết nối tới SoundCloud.');
  }

  const html = await pageRes.text();
  const scriptUrls = Array.from(
    html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)
  ).map((m) => m[1]);

  for (const scriptUrl of scriptUrls.slice(-6).reverse()) {
    try {
      const jsRes = await fetch(scriptUrl, { signal: AbortSignal.timeout(4000) });
      if (!jsRes.ok) continue;
      const jsText = await jsRes.text();
      const match = jsText.match(/client_id[:=]"?([a-zA-Z0-9]{32})"?/);
      if (match?.[1]) {
        cachedScClientId = match[1];
        cachedScClientIdAt = Date.now();
        return match[1];
      }
    } catch {
      continue;
    }
  }

  throw new Error('Không tìm thấy mã truy cập công khai của SoundCloud.');
}

/**
 * Chuẩn hóa link SoundCloud mobile (m.soundcloud.com) -> soundcloud.com
 */
function normalizeSoundCloudUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    if (u.hostname === 'm.soundcloud.com' || u.hostname === 'www.soundcloud.com') {
      u.hostname = 'soundcloud.com';
    }
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return raw.trim().split('?')[0].replace('://m.soundcloud.com/', '://soundcloud.com/');
  }
}

/**
 * 3. Xử lý link SoundCloud (hỗ trợ soundcloud.com, m.soundcloud.com, on.soundcloud.com)
 */
async function extractSoundCloud(url: string): Promise<ExtractedAudio> {
  let targetUrl = url.trim();

  // Mở rộng link rút gọn on.soundcloud.com / soundcloud.app.goo.gl bằng Desktop UA
  if (/on\.soundcloud\.com|soundcloud\.app\.goo\.gl/i.test(targetUrl)) {
    const redirectRes = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (redirectRes.url && /soundcloud\.com\//i.test(redirectRes.url) && !/on\.soundcloud\.com/i.test(redirectRes.url)) {
      targetUrl = redirectRes.url;
    } else {
      const html = await redirectRes.text().catch(() => '');
      const canonical =
        html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ||
        html.match(/property="og:url"[^>]+content="([^"]+)"/i)?.[1] ||
        html.match(/https:\/\/(?:m\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/i)?.[0];
      if (canonical) targetUrl = canonical;
    }
  }

  const cleanUrl = normalizeSoundCloudUrl(targetUrl);
  let clientId = await getSoundCloudClientId();

  interface ScTrack {
    id?: number;
    kind?: string;
    title?: string;
    artwork_url?: string;
    track_authorization?: string;
    user?: { username?: string; avatar_url?: string };
    media?: {
      transcodings?: Array<{
        url: string;
        format?: { protocol?: string; mime_type?: string };
      }>;
    };
    tracks?: ScTrack[];
  }

  let data: ScTrack | null = null;

  // Thử api-v2.soundcloud.com/resolve
  let resolveRes = await fetch(
    `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
      cleanUrl
    )}&client_id=${clientId}`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    }
  );

  if (resolveRes.status === 401 || resolveRes.status === 403) {
    clientId = await getSoundCloudClientId(true);
    resolveRes = await fetch(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
        cleanUrl
      )}&client_id=${clientId}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      }
    );
  }

  if (resolveRes.ok) {
    data = (await resolveRes.json()) as ScTrack;
  } else {
    // Fallback: đọc trực tiếp hydration JSON từ trang web SoundCloud
    const pageRes = await fetch(cleanUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const hydMatch = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);<\/script>/);
      if (hydMatch?.[1]) {
        const hyd = JSON.parse(hydMatch[1]) as Array<{ hydratable?: string; data?: ScTrack }>;
        data = hyd.find((x) => x.hydratable === 'sound')?.data || null;
      }
    }
  }

  if (!data) {
    throw new Error('Không tìm thấy bài hát SoundCloud này (link sai hoặc riêng tư).');
  }

  const track =
    data.kind === 'playlist' && Array.isArray(data.tracks)
      ? data.tracks.find((t) => (t?.media?.transcodings?.length || 0) > 0)
      : data;

  const transcodings = track?.media?.transcodings || [];
  if (!track || transcodings.length === 0) {
    throw new Error('Bài SoundCloud này không có luồng phát công khai.');
  }

  // Sắp xếp thứ tự ưu tiên: 1. Progressive MP3 -> 2. HLS MP4/AAC -> 3. Các HLS còn lại
  const sortedTranscodings = [...transcodings].sort((a, b) => {
    const score = (t: typeof a) => {
      if (t.format?.protocol === 'progressive') return 0;
      if (t.format?.protocol === 'hls' && t.format?.mime_type?.includes('audio/mp4')) return 1;
      return 2;
    };
    return score(a) - score(b);
  });

  let finalStreamUrl = '';
  let finalMime = 'audio/mpeg';

  // Thử từng transcoding kèm client_id và track_authorization đến khi lấy được URL hợp lệ
  for (const candidate of sortedTranscodings) {
    try {
      const endpoint = new URL(candidate.url);
      endpoint.searchParams.set('client_id', clientId);
      if (track.track_authorization) {
        endpoint.searchParams.set('track_authorization', track.track_authorization);
      }

      const streamRes = await fetch(endpoint.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
      });
      if (!streamRes.ok) continue;

      const streamJson = await streamRes.json();
      if (streamJson?.url) {
        finalStreamUrl = streamJson.url;
        finalMime =
          candidate.format?.protocol === 'hls' && finalStreamUrl.includes('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : candidate.format?.mime_type?.split(';')[0] || 'audio/mpeg';
        break;
      }
    } catch {
      continue;
    }
  }

  if (!finalStreamUrl) {
    throw new Error('Bài SoundCloud này bị giới hạn bản quyền (Go+/Preview).');
  }

  const rawThumb =
    track.artwork_url ||
    track.user?.avatar_url ||
    'https://placehold.co/512x512/18181b/ffffff.jpg?text=SoundCloud';
  const hdThumb = rawThumb.replace('-large', '-t500x500');

  return {
    id: `sc_${track.id || Date.now()}`,
    originalUrl: cleanUrl,
    audioUrl: finalStreamUrl,
    title: track.title || 'SoundCloud Track',
    author: track.user?.username || 'SoundCloud Artist',
    thumbnail: hdThumb,
    source: 'soundcloud',
    mimeType: finalMime,
    extractedAt: Date.now(),
  };
}

/**
 * 4. Xử lý link YouTube bằng @distube/ytdl-core v5 (ưu tiên M4A/MP4 cho iOS Safari)
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

    const directFormats = info.formats.filter((f) => Boolean(f.url) && !f.isDrm && !f.isOtf);

    let chosenFormat = null;
    try {
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
    'Không thể trích xuất âm thanh YouTube lúc này. Vui lòng thử link khác hoặc link TikTok/SoundCloud.'
  );
}

/**
 * Handler chính cho POST /api/extract
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInput = String(body?.url || '').trim();

    if (!rawInput) {
      return NextResponse.json({ error: 'Vui lòng nhập đường dẫn (URL).' }, { status: 400 });
    }

    // Tự tách URL hợp lệ nếu người dùng copy cả câu mô tả từ app TikTok / SoundCloud
    const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
    const rawUrl = (urlMatch ? urlMatch[0] : rawInput).trim();

    const isTikTok = /tiktok\.com/i.test(rawUrl);
    const isYouTube = /(youtube\.com|youtu\.be)/i.test(rawUrl);
    const isSoundCloud = /(soundcloud\.com|soundcloud\.app\.goo\.gl)/i.test(rawUrl);

    if (!isTikTok && !isYouTube && !isSoundCloud) {
      return NextResponse.json(
        { error: 'Chỉ hỗ trợ đường dẫn từ TikTok, YouTube hoặc SoundCloud.' },
        { status: 400 }
      );
    }

    const result = isTikTok
      ? await extractTikTok(rawUrl)
      : isSoundCloud
      ? await extractSoundCloud(rawUrl)
      : await extractYouTube(rawUrl);

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định khi trích xuất.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
