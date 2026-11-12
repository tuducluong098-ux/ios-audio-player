import { Ytdl, SearchType, chooseFormat, Quality } from '@distube/ytdl-core';

export const ytdl = new Ytdl({
  timeoutMs: 8000,
  country: 'VN',
  lang: 'vi',
  utcOffsetMinutes: 420,
});

export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type AudioSource = 'youtube' | 'tiktok' | 'soundcloud' | 'spotify';

export interface ExtractedAudio {
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

let cachedScClientId: string | null = null;
let cachedScClientIdAt = 0;
const SC_CLIENT_ID_TTL = 12 * 60 * 60 * 1000;

/**
 * Lấy SoundCloud client_id công khai và cache trong process (tải song song các bundle để tránh timeout 10s)
 */
export async function getSoundCloudClientId(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    cachedScClientId &&
    Date.now() - cachedScClientIdAt < SC_CLIENT_ID_TTL
  ) {
    return cachedScClientId;
  }

  const pageRes = await fetch('https://soundcloud.com', {
    headers: { 'User-Agent': DESKTOP_UA },
    signal: AbortSignal.timeout(3800),
  });

  if (!pageRes.ok) {
    throw new Error('Không thể kết nối tới SoundCloud.');
  }

  const html = await pageRes.text();
  const scriptUrls = Array.from(
    html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)
  )
    .map((m) => m[1])
    .slice(-5)
    .reverse();

  if (scriptUrls.length > 0) {
    try {
      const foundId = await Promise.any(
        scriptUrls.map(async (scriptUrl) => {
          const jsRes = await fetch(scriptUrl, { signal: AbortSignal.timeout(2800) });
          if (!jsRes.ok) throw new Error('bad script status');
          const jsText = await jsRes.text();
          const match = jsText.match(/client_id[:=]"?([a-zA-Z0-9]{32})"?/);
          if (!match?.[1]) throw new Error('missing client_id');
          return match[1];
        })
      );
      cachedScClientId = foundId;
      cachedScClientIdAt = Date.now();
      return foundId;
    } catch {}
  }

  throw new Error('Không tìm thấy mã truy cập công khai của SoundCloud.');
}

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

interface ScTrackRaw {
  id?: number;
  kind?: string;
  title?: string;
  permalink_url?: string;
  artwork_url?: string;
  track_authorization?: string;
  snipped?: boolean;
  policy?: string;
  duration?: number;
  user?: { username?: string; avatar_url?: string };
  media?: {
    transcodings?: Array<{
      url: string;
      snipped?: boolean;
      format?: { protocol?: string; mime_type?: string };
    }>;
  };
  tracks?: ScTrackRaw[];
}

async function resolveSoundCloudStream(
  track: ScTrackRaw,
  clientId: string
): Promise<{ audioUrl: string; mimeType: string; isPreview: boolean } | null> {
  const transcodings = track?.media?.transcodings || [];
  if (transcodings.length === 0) return null;

  const sorted = [...transcodings].sort((a, b) => {
    const score = (t: typeof a) => {
      const snipPenalty = t.snipped ? 10 : 0;
      if (t.format?.protocol === 'progressive') return snipPenalty + 0;
      if (t.format?.protocol === 'hls' && t.format?.mime_type?.includes('audio/mp4')) {
        return snipPenalty + 1;
      }
      return snipPenalty + 2;
    };
    return score(a) - score(b);
  });

  let fallbackPreview: { audioUrl: string; mimeType: string; isPreview: boolean } | null = null;

  for (const candidate of sorted) {
    try {
      const endpoint = new URL(candidate.url);
      endpoint.searchParams.set('client_id', clientId);
      if (track.track_authorization) {
        endpoint.searchParams.set('track_authorization', track.track_authorization);
      }

      const streamRes = await fetch(endpoint.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      });
      if (!streamRes.ok) continue;

      const streamJson = await streamRes.json();
      if (streamJson?.url) {
        const mimeType =
          candidate.format?.protocol === 'hls' && streamJson.url.includes('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : candidate.format?.mime_type?.split(';')[0] || 'audio/mpeg';
        const isPreview =
          Boolean(track.snipped) ||
          Boolean(candidate.snipped) ||
          track.policy === 'SNIP' ||
          /\/preview\b/i.test(candidate.url) ||
          /\/preview\b/i.test(streamJson.url);

        if (!isPreview) {
          return { audioUrl: streamJson.url, mimeType, isPreview: false };
        }
        if (!fallbackPreview) {
          fallbackPreview = { audioUrl: streamJson.url, mimeType, isPreview: true };
        }
      }
    } catch {
      continue;
    }
  }

  return fallbackPreview;
}

/**
 * Trích xuất SoundCloud (hỗ trợ soundcloud.com, m.soundcloud.com, on.soundcloud.com)
 */
export async function extractSoundCloud(url: string): Promise<ExtractedAudio> {
  let targetUrl = url.trim();

  if (/on\.soundcloud\.com|soundcloud\.app\.goo\.gl/i.test(targetUrl)) {
    const redirectRes = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_UA },
      signal: AbortSignal.timeout(6000),
    });

    if (
      redirectRes.url &&
      /soundcloud\.com\//i.test(redirectRes.url) &&
      !/on\.soundcloud\.com/i.test(redirectRes.url)
    ) {
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
  let data: ScTrackRaw | null = null;

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
    data = (await resolveRes.json()) as ScTrackRaw;
  } else {
    const pageRes = await fetch(cleanUrl, {
      headers: { 'User-Agent': DESKTOP_UA },
      signal: AbortSignal.timeout(6000),
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const hydMatch = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);<\/script>/);
      if (hydMatch?.[1]) {
        const hyd = JSON.parse(hydMatch[1]) as Array<{
          hydratable?: string;
          data?: ScTrackRaw;
        }>;
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

  if (!track) {
    throw new Error('Bài SoundCloud này không có luồng phát công khai.');
  }

  const stream = await resolveSoundCloudStream(track, clientId);
  if (!stream) {
    throw new Error('Bài SoundCloud này bị giới hạn bản quyền (Go+/Preview).');
  }

  const rawThumb =
    track.artwork_url ||
    track.user?.avatar_url ||
    'https://placehold.co/512x512/18181b/ffffff.jpg?text=SoundCloud';

  return {
    id: `sc_${track.id || Date.now()}`,
    originalUrl: cleanUrl,
    audioUrl: stream.audioUrl,
    title: track.title || 'SoundCloud Track',
    author: track.user?.username || 'SoundCloud Artist',
    thumbnail: rawThumb.replace('-large', '-t500x500'),
    source: 'soundcloud',
    mimeType: stream.mimeType,
    extractedAt: Date.now(),
  };
}

/**
 * Trích xuất trang âm thanh TikTok (/music/... hoặc vm.tiktok.com trỏ tới âm thanh)
 */
async function extractTikTokMusicPage(url: string): Promise<ExtractedAudio> {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': IPHONE_UA,
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error('Không thể mở trang âm thanh TikTok này.');
  }

  const finalUrl = res.url || url;
  const html = await res.text();
  const uniMatch = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );

  if (!uniMatch?.[1]) {
    throw new Error('Không đọc được dữ liệu âm thanh từ trang TikTok.');
  }

  const json = JSON.parse(uniMatch[1]);
  const scope = json?.__DEFAULT_SCOPE__ || {};
  const basic =
    scope['sharing.music.music_state']?.musicInfo?.basic ||
    scope['webapp.music-detail']?.musicInfo?.music;

  const playUrl = basic?.musicPlay?.playUrl?.[0] || basic?.playUrl || '';

  if (playUrl) {
    const thumb =
      basic?.coverLarge?.[0] ||
      basic?.coverMedium?.[0] ||
      basic?.coverThumb?.[0] ||
      basic?.coverLarge ||
      'https://placehold.co/512x512/18181b/ffffff.jpg?text=TikTok';

    return {
      id: `ttm_${basic?.id || Date.now()}`,
      originalUrl: url,
      audioUrl: playUrl,
      title: basic?.title || 'TikTok Sound',
      author: basic?.authorName || 'TikTok Audio',
      thumbnail: thumb,
      source: 'tiktok',
      mimeType: 'audio/mpeg',
      extractedAt: Date.now(),
    };
  }

  const firstItem = scope['sharing.music.music_list_state']?.itemList?.[0];
  if (firstItem?.id) {
    const fallbackVideoUrl = `https://www.tiktok.com/@tiktok/video/${firstItem.id}`;
    const tikwmRes = await fetch(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(fallbackVideoUrl)}`,
      {
        headers: { Accept: 'application/json', 'User-Agent': IPHONE_UA },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      }
    );
    if (tikwmRes.ok) {
      const tikwmJson = await tikwmRes.json();
      const audioUrl =
        tikwmJson?.data?.music_info?.play ||
        tikwmJson?.data?.music ||
        tikwmJson?.data?.play;
      if (tikwmJson?.code === 0 && audioUrl) {
        return {
          id: `ttm_${basic?.id || firstItem.id}`,
          originalUrl: url,
          audioUrl,
          title: basic?.title || tikwmJson.data.music_info?.title || 'TikTok Sound',
          author: basic?.authorName || tikwmJson.data.music_info?.author || 'TikTok Audio',
          thumbnail:
            basic?.coverLarge?.[0] ||
            tikwmJson.data.cover ||
            'https://placehold.co/512x512/18181b/ffffff.jpg?text=TikTok',
          source: 'tiktok',
          mimeType: 'audio/mp4',
          extractedAt: Date.now(),
        };
      }
    }
  }

  if (!/\/music\//i.test(finalUrl)) {
    throw new Error('Link TikTok không hợp lệ hoặc đã bị xóa.');
  }
  throw new Error('Không tìm thấy luồng âm thanh từ trang nhạc TikTok này.');
}

/**
 * Trích xuất TikTok (Video lẫn Âm thanh)
 */
export async function extractTikTok(url: string): Promise<ExtractedAudio> {
  if (/tiktok\.com\/music\//i.test(url)) {
    return extractTikTokMusicPage(url);
  }

  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': IPHONE_UA },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  if (res.ok) {
    const json = await res.json();
    if (json.code === 0 && json.data) {
      const data = json.data;
      const audioUrl = data.music_info?.play || data.music || data.play;
      if (audioUrl) {
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
    }
  }

  return extractTikTokMusicPage(url);
}

interface FallbackTrackMeta {
  title?: string;
  author?: string;
  thumbnail?: string;
  originalUrl?: string;
  source?: AudioSource;
  id?: string;
}

/**
 * Tìm & giải mã luồng phát trực tiếp từ SoundCloud theo từ khóa (ưu tiên bản full, tránh Go+ preview 30s)
 */
async function searchSoundCloudAudio(
  query: string,
  meta?: FallbackTrackMeta
): Promise<ExtractedAudio | null> {
  if (!query.trim()) return null;
  try {
    const cid = await getSoundCloudClientId();
    const searchRes = await fetch(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
        query
      )}&limit=8&client_id=${cid}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(3500) }
    );
    if (!searchRes.ok) return null;

    const searchJson = await searchRes.json();
    const tracks = (searchJson?.collection || []) as ScTrackRaw[];
    // Ưu tiên bản full trước, chỉ xét track bị cắt SNIP/preview sau cùng
    const prioritized = [...tracks].sort((a, b) => {
      const aSnip = a.snipped || a.policy === 'SNIP' ? 1 : 0;
      const bSnip = b.snipped || b.policy === 'SNIP' ? 1 : 0;
      return aSnip - bSnip;
    });

    let previewBackup: ExtractedAudio | null = null;
    for (const scTrack of prioritized) {
      const stream = await resolveSoundCloudStream(scTrack, cid);
      if (!stream) continue;

      const thumb = (
        meta?.thumbnail ||
        scTrack.artwork_url ||
        scTrack.user?.avatar_url ||
        'https://placehold.co/512x512/18181b/ffffff.jpg?text=Audio'
      ).replace('-large', '-t500x500');
      const built: ExtractedAudio = {
        id: meta?.id || `sc_${scTrack.id || Date.now()}`,
        originalUrl: meta?.originalUrl || scTrack.permalink_url || '',
        audioUrl: stream.audioUrl,
        title: meta?.title || scTrack.title || query,
        author: meta?.author || scTrack.user?.username || 'Artist',
        thumbnail: thumb,
        source: meta?.source && meta.source !== 'youtube' ? meta.source : 'soundcloud',
        mimeType: stream.mimeType,
        extractedAt: Date.now(),
      };

      if (!stream.isPreview) return built;
      if (!previewBackup) previewBackup = built;
    }

    if (previewBackup) return previewBackup;
  } catch {}
  return null;
}

async function probeAudioRange(url: string, referer?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': DESKTOP_UA,
      Range: 'bytes=0-1023',
    };
    if (referer) headers.Referer = referer;
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(1600),
    });
    try {
      await res.body?.cancel();
    } catch {}
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

function wrapYouTubeProxyIfNeeded(directUrl: string): string {
  if (/googlevideo\.com/i.test(directUrl)) {
    return `/api/audio-proxy?url=${encodeURIComponent(directUrl)}`;
  }
  return directUrl;
}

const extractedCache = new Map<string, { item: ExtractedAudio; at: number }>();

export function getCachedExtraction(url: string): ExtractedAudio | null {
  const key = url.trim();
  const hit = extractedCache.get(key);
  if (!hit) return null;
  const maxAge = hit.item.source === 'soundcloud' ? 3 * 60 * 1000 : 15 * 60 * 1000;
  if (Date.now() - hit.at > maxAge) {
    extractedCache.delete(key);
    return null;
  }
  return hit.item;
}

export function cacheExtractionResult(url: string, item: ExtractedAudio) {
  const key = url.trim();
  if (extractedCache.size >= 45) {
    const oldest = extractedCache.keys().next().value;
    if (oldest) extractedCache.delete(oldest);
  }
  extractedCache.set(key, { item, at: Date.now() });
}

function pickOptimalAudioFormat(
  formats: readonly {
    url?: string;
    hasAudio?: boolean;
    hasVideo?: boolean;
    container?: string;
    audioBitrate?: number;
    bitrate?: number;
    mimeType?: string;
  }[]
) {
  const audioOnlyMp4 = formats
    .filter((f) => f.hasAudio && !f.hasVideo && f.container === 'mp4')
    .sort((a, b) => {
      // Ưu tiên M4A 96-160kbps (~1MB/phút) để nghe mượt, không lãng phí 5G
      const aRate = a.audioBitrate || 128;
      const bRate = b.audioBitrate || 128;
      const aScore = aRate >= 96 && aRate <= 160 ? Math.abs(aRate - 128) : 500 + aRate;
      const bScore = bRate >= 96 && bRate <= 160 ? Math.abs(bRate - 128) : 500 + bRate;
      return aScore - bScore;
    });
  if (audioOnlyMp4[0]) return audioOnlyMp4[0];

  const anyAudioOnly = formats
    .filter((f) => f.hasAudio && !f.hasVideo)
    .sort((a, b) => (a.audioBitrate || 128) - (b.audioBitrate || 128));
  if (anyAudioOnly[0]) return anyAudioOnly[0];

  // Fallback cuối cùng nếu chỉ còn muxed video -> chọn dung lượng nhỏ nhất để đỡ tốn 5G
  const muxed = formats
    .filter((f) => f.hasAudio)
    .sort((a, b) => (a.bitrate || 9999999) - (b.bitrate || 9999999));
  return muxed[0] || null;
}

/**
 * Trích xuất YouTube (tối ưu M4A ~128kbps tiết kiệm 5G + chạy song song oEmbed/Fallback tránh timeout 10s Vercel)
 */
export async function extractYouTube(
  url: string,
  fallbackMeta?: FallbackTrackMeta
): Promise<ExtractedAudio> {
  const videoIdMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/|.*shorts\/))([^&?/]+)/
  );
  const videoId = videoIdMatch ? videoIdMatch[1] : `${Date.now()}`;

  let detectedTitle = fallbackMeta?.title || '';
  let detectedAuthor = fallbackMeta?.author || '';
  let detectedThumb =
    fallbackMeta?.thumbnail ||
    (videoIdMatch ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

  const needOembed = Boolean(videoIdMatch && (!detectedTitle || !detectedAuthor));

  const [ytdlSettled, oembedSettled] = await Promise.allSettled([
    ytdl.getInfo(url, { signal: AbortSignal.timeout(3800) }),
    needOembed
      ? fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${videoId}`
          )}&format=json`,
          { signal: AbortSignal.timeout(2000) }
        ).then((r) => (r.ok ? r.json() : null))
      : Promise.resolve(null),
  ]);

  if (oembedSettled.status === 'fulfilled' && oembedSettled.value) {
    const oe = oembedSettled.value as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    detectedTitle = detectedTitle || oe?.title || '';
    detectedAuthor = detectedAuthor || oe?.author_name || '';
    detectedThumb = detectedThumb || oe?.thumbnail_url || '';
  }

  if (ytdlSettled.status === 'fulfilled' && ytdlSettled.value) {
    try {
      const info = ytdlSettled.value;
      detectedTitle = detectedTitle || info.videoDetails.title || '';
      detectedAuthor = detectedAuthor || info.videoDetails.author?.name || '';

      const directFormats = info.formats.filter((f) => Boolean(f.url) && !f.isDrm && !f.isOtf);
      let chosenFormat = pickOptimalAudioFormat(directFormats);
      if (!chosenFormat) {
        try {
          chosenFormat = chooseFormat(directFormats, {
            quality: Quality.HighestAudio,
            filter: [{ hasAudio: true, hasVideo: false }],
          });
        } catch {}
      }

      if (chosenFormat?.url) {
        const thumbnails = info.videoDetails.thumbnails;
        const bestThumb =
          detectedThumb ||
          thumbnails.find((t) => t.url.includes('.jpg'))?.url ||
          thumbnails[thumbnails.length - 1]?.url ||
          `https://i.ytimg.com/vi/${info.videoDetails.id || videoId}/hqdefault.jpg`;

        const ok = await probeAudioRange(chosenFormat.url, 'https://www.youtube.com/');
        if (ok) {
          return {
            id: `yt_${info.videoDetails.id || videoId}`,
            originalUrl: url,
            audioUrl: wrapYouTubeProxyIfNeeded(chosenFormat.url),
            title: detectedTitle || 'YouTube Audio',
            author: detectedAuthor || 'YouTube Channel',
            thumbnail: bestThumb,
            source: 'youtube',
            mimeType: chosenFormat.mimeType?.split(';')[0] || 'audio/mp4',
            extractedAt: Date.now(),
          };
        }
      }
    } catch {}
  }

  // Fallback 1 + 2 song song: thử Piped audio-only & tìm bản full tương ứng trên SoundCloud (tối ưu trong giới hạn 10s Vercel)
  const pipedPromise: Promise<ExtractedAudio | null> = videoIdMatch
    ? fetch(`https://api.piped.private.coffee/streams/${videoId}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2200),
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const data = await res.json();
          const audioStreams: Array<{ url: string; mimeType: string }> =
            data.audioStreams || [];
          const m4aStream =
            audioStreams.find((s) => s.mimeType?.includes('audio/mp4')) ||
            audioStreams[0];
          if (!m4aStream?.url) return null;
          return {
            id: `yt_${videoId}`,
            originalUrl: url,
            audioUrl: m4aStream.url,
            title: detectedTitle || data.title || 'YouTube Audio',
            author: detectedAuthor || data.uploader || 'YouTube',
            thumbnail:
              detectedThumb ||
              data.thumbnailUrl ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            source: 'youtube',
            mimeType: m4aStream.mimeType || 'audio/mp4',
            extractedAt: Date.now(),
          } satisfies ExtractedAudio;
        })
        .catch(() => null)
    : Promise.resolve(null);

  const scFallbackPromise: Promise<ExtractedAudio | null> = (async () => {
    if (!detectedTitle) return null;
    const cleanAuthor = detectedAuthor.replace(/\s*-\s*Topic$/i, '').trim();
    const { query } = cleanTrackQuery(detectedTitle, cleanAuthor);

    const scByFullQuery = await searchSoundCloudAudio(query, {
      id: `yt_${videoId}`,
      originalUrl: url,
      title: detectedTitle,
      author: cleanAuthor || 'YouTube',
      thumbnail: detectedThumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      source: 'soundcloud',
    });
    if (scByFullQuery) return scByFullQuery;

    if (cleanAuthor) {
      return await searchSoundCloudAudio(cleanTrackQuery(detectedTitle).query, {
        id: `yt_${videoId}`,
        originalUrl: url,
        title: detectedTitle,
        author: cleanAuthor,
        thumbnail: detectedThumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: 'soundcloud',
      });
    }
    return null;
  })();

  const [scResult, pipedResult] = await Promise.allSettled([
    scFallbackPromise,
    pipedPromise,
  ]);
  if (scResult.status === 'fulfilled' && scResult.value) return scResult.value;
  if (pipedResult.status === 'fulfilled' && pipedResult.value) return pipedResult.value;

  throw new Error(
    'Không thể trích xuất âm thanh YouTube lúc này. Vui lòng thử bài khác hoặc tìm bản SoundCloud/TikTok trong tab Gợi ý.'
  );
}

/**
 * Tìm bản full theo tên bài + ca sĩ trên YouTube Music -> fallback SoundCloud Search
 */
export async function searchAndExtractByQuery(
  query: string,
  meta?: FallbackTrackMeta
): Promise<ExtractedAudio> {
  // Ưu tiên 1: Tìm bài hát trên YouTube Music
  try {
    const songs = await ytdl.search(query, {
      type: SearchType.Song,
      limit: 3,
      signal: AbortSignal.timeout(4500),
    });
    for (const song of songs) {
      if (!song.url) continue;
      try {
        const yt = await extractYouTube(song.url, {
          title: meta?.title || song.title,
          author: meta?.author || song.author?.name,
          thumbnail: meta?.thumbnail || song.thumbnails?.[song.thumbnails.length - 1]?.url,
        });
        return {
          ...yt,
          id: meta?.id || yt.id,
          originalUrl: meta?.originalUrl || yt.originalUrl,
          title: meta?.title || yt.title,
          author: meta?.author || yt.author,
          thumbnail: meta?.thumbnail || yt.thumbnail,
          source: meta?.source && yt.source === 'youtube' ? meta.source : yt.source,
        };
      } catch {
        continue;
      }
    }
  } catch {}

  // Ưu tiên 2: Fallback sang SoundCloud Search
  const scResult = await searchSoundCloudAudio(query, meta);
  if (scResult) return scResult;

  throw new Error(`Không tìm thấy bản phát trực tuyến cho "${query}".`);
}

/**
 * Xử lý link Spotify (Track, Playlist, Album) qua Spotify Embed -> phát bản full từ YouTube Music / SoundCloud
 */
export async function extractSpotify(url: string): Promise<
  | { isBatch: false; track: ExtractedAudio }
  | { isBatch: true; playlistName: string; tracks: ExtractedAudio[] }
> {
  let targetUrl = url.trim();

  if (/spotify\.link/i.test(targetUrl)) {
    const r = await fetch(targetUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (r.url) targetUrl = r.url;
  }

  const spMatch = targetUrl.match(
    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album)\/([a-zA-Z0-9]+)/i
  );

  if (!spMatch) {
    throw new Error('Chỉ hỗ trợ link Bài hát, Playlist hoặc Album của Spotify.');
  }

  const kind = spMatch[1].toLowerCase();
  const spId = spMatch[2];
  const embedUrl = `https://open.spotify.com/embed/${kind}/${spId}`;

  const res = await fetch(embedUrl, {
    headers: { 'User-Agent': DESKTOP_UA },
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    throw new Error('Không thể đọc thông tin từ Spotify.');
  }

  const html = await res.text();
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!nextData) {
    throw new Error('Không đọc được dữ liệu bài hát từ Spotify.');
  }

  const parsed = JSON.parse(nextData);
  const entity = parsed?.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new Error('Bài hát hoặc Playlist Spotify này không tồn tại hoặc đang ẩn.');
  }

  if (kind === 'track') {
    const title = entity.title || entity.name || 'Spotify Track';
    const artists = Array.isArray(entity.artists)
      ? entity.artists.map((a: { name?: string }) => a.name).filter(Boolean).join(', ')
      : entity.subtitle || 'Spotify Artist';
    const cover =
      entity.visualIdentity?.image?.[0]?.url ||
      entity.coverArt?.sources?.[0]?.url ||
      'https://placehold.co/512x512/18181b/ffffff.jpg?text=Spotify';

    const resolved = await searchAndExtractByQuery(`${title} ${artists}`, {
      id: `sp_${spId}`,
      originalUrl: targetUrl.split('?')[0],
      title,
      author: artists,
      thumbnail: cover,
      source: 'spotify',
    });

    return { isBatch: false, track: resolved };
  }

  // Playlist hoặc Album: giải mã bài đầu tiên để phát ngay, các bài còn lại gắn spotify-search:// để lazy-load trước khi tới lượt
  const playlistName = entity.title || entity.name || 'Spotify Playlist';
  const coverFallback =
    entity.coverArt?.sources?.[0]?.url ||
    entity.visualIdentity?.image?.[0]?.url ||
    'https://placehold.co/512x512/18181b/ffffff.jpg?text=Spotify';

  const trackList: Array<{ title?: string; subtitle?: string; uri?: string }> =
    Array.isArray(entity.trackList) ? entity.trackList.slice(0, 30) : [];

  if (trackList.length === 0) {
    throw new Error('Playlist Spotify này không có bài hát công khai.');
  }

  const firstRaw = trackList[0];
  const firstTitle = firstRaw.title || 'Spotify Track';
  const firstArtist = firstRaw.subtitle || 'Artist';
  const firstId = firstRaw.uri?.split(':').pop() || `${spId}_0`;

  const firstTrack = await searchAndExtractByQuery(`${firstTitle} ${firstArtist}`, {
    id: `sp_${firstId}`,
    originalUrl: `spotify-search://${encodeURIComponent(`${firstTitle} ${firstArtist}`)}`,
    title: firstTitle,
    author: firstArtist,
    thumbnail: coverFallback,
    source: 'spotify',
  });

  const restTracks: ExtractedAudio[] = trackList.slice(1).map((t, i) => {
    const tTitle = t.title || `Track ${i + 2}`;
    const tArtist = t.subtitle || 'Artist';
    const tId = t.uri?.split(':').pop() || `${spId}_${i + 1}`;
    return {
      id: `sp_${tId}`,
      originalUrl: `spotify-search://${encodeURIComponent(`${tTitle} ${tArtist}`)}`,
      audioUrl: '',
      title: tTitle,
      author: tArtist,
      thumbnail: coverFallback,
      source: 'spotify',
      mimeType: 'audio/mp4',
      extractedAt: 0,
    };
  });

  return {
    isBatch: true,
    playlistName,
    tracks: [firstTrack, ...restTracks],
  };
}

const VIET_CHAR_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const VIET_MUSIC_WORD_RE =
  /\b(nhac|viet|vpop|vinahouse|bolero|lofi viet|tiktok|remix|cua|khong|anh|em|yeu|tinh|buon|dem|mua|sau|thuong|nho)\b/i;

function isLikelyVietnamese(text: string): boolean {
  return VIET_CHAR_RE.test(text) || VIET_MUSIC_WORD_RE.test(text);
}

function cleanTrackQuery(rawTitle?: string, rawAuthor?: string): {
  query: string;
  isGenericSound: boolean;
} {
  const author = (rawAuthor || '').trim();
  const stripped = (rawTitle || '')
    .replace(/^(âm thanh gốc|nhạc nền|original sound|original audio|nhạc của|sound by)\s*[-–:|]?\s*/i, '')
    .replace(/[\[(](official\s*(mv|music\s*video|audio|lyric\s*video)|mv|lyrics?|audio|visualizer|hd|4k)[\])]/gi, '')
    .replace(/#\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const lowerTitle = stripped.toLowerCase();
  const lowerAuthor = author.toLowerCase();

  // TikTok thường đặt tên âm thanh trùng tên tài khoản đăng clip -> tránh tìm theo username gây lạc sang nhạc nước ngoài
  const isGenericSound =
    !stripped ||
    stripped.length < 3 ||
    (lowerAuthor.length >= 2 &&
      (lowerTitle === lowerAuthor || lowerTitle === `@${lowerAuthor}`));

  if (isGenericSound) {
    return {
      query: 'nhạc trẻ việt nam hot tiktok chill remix',
      isGenericSound: true,
    };
  }

  const combined =
    author && !lowerTitle.includes(lowerAuthor)
      ? `${stripped} ${author}`.trim()
      : stripped;

  return { query: combined, isGenericSound: false };
}

function mapYtSummaries(
  items: readonly {
    id: string;
    url: string;
    title: string;
    author?: { name?: string };
    thumbnails?: readonly { url: string }[];
    isLive?: boolean;
    lengthSeconds?: number;
  }[],
  excludeUrl?: string
): SuggestedTrack[] {
  const seen = new Set<string>();
  const out: SuggestedTrack[] = [];

  for (const v of items) {
    if (!v.url || !v.title || v.isLive) continue;
    if (v.lengthSeconds && v.lengthSeconds > 900) continue; // Tránh podcast/video quá 15 phút
    if (excludeUrl && v.url === excludeUrl) continue;
    if (seen.has(v.url)) continue;
    seen.add(v.url);

    out.push({
      id: `yt_${v.id}`,
      url: v.url,
      title: v.title,
      author: v.author?.name || 'YouTube Music',
      thumbnail:
        v.thumbnails?.[v.thumbnails.length - 1]?.url ||
        `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      source: 'youtube',
    });
  }

  return out;
}

function prioritizeVietnamese(
  items: SuggestedTrack[],
  preferVietnamese: boolean
): SuggestedTrack[] {
  if (!preferVietnamese) return items;
  const vi: SuggestedTrack[] = [];
  const other: SuggestedTrack[] = [];
  for (const item of items) {
    if (isLikelyVietnamese(`${item.title} ${item.author}`)) {
      vi.push(item);
    } else {
      other.push(item);
    }
  }
  return [...vi, ...other];
}

function dedupeSuggestions(items: SuggestedTrack[]): SuggestedTrack[] {
  const seen = new Set<string>();
  const out: SuggestedTrack[] = [];
  for (const item of items) {
    const key = `${item.source}:${item.id}`;
    if (seen.has(key) || seen.has(item.url)) continue;
    seen.add(key);
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

const DISCOVERY_CACHE_TTL = 5 * 60 * 1000;
const relatedPoolCache = new Map<string, { items: SuggestedTrack[]; at: number }>();
const ytSearchCache = new Map<string, { items: SuggestedTrack[]; at: number }>();

function setBoundedCache<T>(
  map: Map<string, { items: T; at: number }>,
  key: string,
  items: T,
  maxSize = 60
) {
  if (map.size >= maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  map.set(key, { items, at: Date.now() });
}

function getValidCached<T>(
  map: Map<string, { items: T; at: number }>,
  key: string
): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > DISCOVERY_CACHE_TTL) {
    map.delete(key);
    return null;
  }
  return hit.items;
}

function mapScTracks(items: readonly ScTrackRaw[]): SuggestedTrack[] {
  const out: SuggestedTrack[] = [];
  for (const t of items) {
    if (!t.permalink_url || !t.title) continue;
    out.push({
      id: `sc_${t.id || Date.now()}`,
      url: t.permalink_url,
      title: t.title,
      author: t.user?.username || 'SoundCloud',
      thumbnail: (
        t.artwork_url ||
        t.user?.avatar_url ||
        'https://placehold.co/512x512/18181b/ffffff.jpg?text=SoundCloud'
      ).replace('-large', '-t500x500'),
      source: 'soundcloud',
    });
  }
  return out;
}

async function computeRelatedTrackPool(input: {
  id?: string;
  originalUrl?: string;
  title?: string;
  author?: string;
  source?: AudioSource;
}): Promise<SuggestedTrack[]> {
  const source = input.source;
  const originalUrl = input.originalUrl || '';
  const seedText = `${input.title || ''} ${input.author || ''}`;
  const preferVietnamese =
    isLikelyVietnamese(seedText) || source === 'tiktok';

  // 1. YouTube -> Dùng YouTube Music Radio + Related Videos khu vực VN (tới ~40 bài để scroll tải thêm)
  if (source === 'youtube' && /youtube\.com|youtu\.be/i.test(originalUrl)) {
    try {
      const [musicRelated, videoRelated] = await Promise.all([
        ytdl
          .getRelated(originalUrl, {
            music: true,
            signal: AbortSignal.timeout(5500),
          })
          .catch(() => []),
        ytdl
          .getRelated(originalUrl, {
            music: false,
            signal: AbortSignal.timeout(5500),
          })
          .catch(() => []),
      ]);

      const merged = dedupeSuggestions([
        ...mapYtSummaries(musicRelated, originalUrl),
        ...mapYtSummaries(videoRelated, originalUrl),
      ]);

      const ranked = prioritizeVietnamese(merged, preferVietnamese);
      if (ranked.length > 0) return ranked.slice(0, 36);
    } catch {}
  }

  // 2. SoundCloud -> Dùng Related Tracks API
  let scSuggestions: SuggestedTrack[] = [];
  if (source === 'soundcloud') {
    try {
      const cid = await getSoundCloudClientId();
      const numericId = input.id?.replace(/^sc_/, '').match(/^\d+$/)?.[0];

      if (numericId) {
        const relRes = await fetch(
          `https://api-v2.soundcloud.com/tracks/${numericId}/related?limit=25&client_id=${cid}`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
        );
        if (relRes.ok) {
          const relJson = await relRes.json();
          scSuggestions = mapScTracks((relJson?.collection || []) as ScTrackRaw[]);
        }
      }
    } catch {}

    const viSc = scSuggestions.filter((t) =>
      isLikelyVietnamese(`${t.title} ${t.author}`)
    );
    if (!preferVietnamese && scSuggestions.length > 0) {
      return scSuggestions.slice(0, 30);
    }
    if (preferVietnamese && viSc.length >= 6) {
      return prioritizeVietnamese(scSuggestions, true).slice(0, 30);
    }
  }

  // 3. Spotify / TikTok / SoundCloud nhạc Việt -> YouTube Music & SoundCloud
  const { query, isGenericSound } = cleanTrackQuery(input.title, input.author);
  if (!query) return scSuggestions.slice(0, 24);

  const ytSuggestions: SuggestedTrack[] = [];

  try {
    const songs = await ytdl.search(query, {
      type: SearchType.Song,
      limit: 12,
      signal: AbortSignal.timeout(5000),
    });

    if (!isGenericSound && songs[0]?.url) {
      const radio = await ytdl
        .getRelated(songs[0].url, { music: true, signal: AbortSignal.timeout(5000) })
        .catch(() => []);
      ytSuggestions.push(...mapYtSummaries(radio, originalUrl));
    }

    ytSuggestions.push(...mapYtSummaries(songs, originalUrl));

    if (ytSuggestions.length < 15) {
      const videos = await ytdl
        .search(preferVietnamese ? `${query} nhạc việt` : query, {
          type: SearchType.Video,
          limit: 12,
          signal: AbortSignal.timeout(4500),
        })
        .catch(() => []);
      ytSuggestions.push(...mapYtSummaries(videos, originalUrl));
    }
  } catch {}

  const combined = dedupeSuggestions(
    preferVietnamese
      ? [...ytSuggestions, ...scSuggestions]
      : [...scSuggestions, ...ytSuggestions]
  );

  if (combined.length > 0) {
    return prioritizeVietnamese(combined, preferVietnamese).slice(0, 36);
  }

  // Fallback cuối cùng sang SoundCloud Search nếu YouTube không trả về kết quả
  try {
    const cid = await getSoundCloudClientId();
    const scRes = await fetch(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
        query
      )}&limit=15&client_id=${cid}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4500) }
    );
    if (scRes.ok) {
      const scJson = await scRes.json();
      const out = mapScTracks((scJson?.collection || []) as ScTrackRaw[]);
      return prioritizeVietnamese(out, preferVietnamese).slice(0, 24);
    }
  } catch {}

  return [];
}

/**
 * Lấy từng trang bài gợi ý (hỗ trợ kéo xuống tải thêm)
 */
export async function getRelatedTracksPage(input: {
  id?: string;
  originalUrl?: string;
  title?: string;
  author?: string;
  source?: AudioSource;
  offset?: number;
  limit?: number;
}): Promise<{
  suggestions: SuggestedTrack[];
  hasMore: boolean;
  nextOffset: number;
}> {
  const offset = Math.max(0, Number(input.offset) || 0);
  const limit = Math.min(20, Math.max(4, Number(input.limit) || 10));
  const cacheKey = `${input.source || 'yt'}:${input.originalUrl || ''}:${input.title || ''}`;

  let pool = getValidCached(relatedPoolCache, cacheKey);
  if (!pool) {
    pool = await computeRelatedTrackPool(input);
    if (pool.length > 0) {
      setBoundedCache(relatedPoolCache, cacheKey, pool);
    }
  }

  const pageItems = pool.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    suggestions: pageItems,
    hasMore: nextOffset < pool.length,
    nextOffset,
  };
}

/**
 * Wrapper giữ tương thích gọi 1 lần mặc định
 */
export async function getRelatedTracks(input: {
  id?: string;
  originalUrl?: string;
  title?: string;
  author?: string;
  source?: AudioSource;
}): Promise<SuggestedTrack[]> {
  const { suggestions } = await getRelatedTracksPage({ ...input, offset: 0, limit: 10 });
  return suggestions;
}

function buildHashtagCandidates(rawQuery: string): string[] {
  const stripped = rawQuery
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

  const words = stripped
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  if (words.length > 0) {
    candidates.push(words.join(''));
    if (words.length >= 2) {
      candidates.push(words.slice(0, 2).join(''));
    }
    if (words.length >= 3) {
      candidates.push(words.slice(-2).join(''));
    }
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length >= 3) {
      candidates.push(longest);
    }
  }

  return Array.from(new Set(candidates)).filter((s) => s.length >= 2);
}

interface TikWmVideoRaw {
  video_id?: string;
  id?: string;
  title?: string;
  cover?: string;
  origin_cover?: string;
  author?: { nickname?: string; unique_id?: string; avatar?: string };
  music_info?: { title?: string; author?: string };
}

function mapTikWmVideos(videos: readonly TikWmVideoRaw[]): SuggestedTrack[] {
  const out: SuggestedTrack[] = [];
  const seen = new Set<string>();
  for (const v of videos) {
    const vid = v.video_id || v.id;
    if (!vid || seen.has(vid)) continue;
    seen.add(vid);

    const uniqueId = v.author?.unique_id;
    const videoUrl = uniqueId
      ? `https://www.tiktok.com/@${uniqueId}/video/${vid}`
      : `https://www.tiktok.com/video/${vid}`;

    out.push({
      id: `tt_${vid}`,
      url: videoUrl,
      title: v.title?.trim() || v.music_info?.title || 'TikTok Sound',
      author: v.author?.nickname || v.music_info?.author || 'TikTok',
      thumbnail:
        v.cover ||
        v.origin_cover ||
        v.author?.avatar ||
        'https://placehold.co/512x512/18181b/ffffff.jpg?text=TikTok',
      source: 'tiktok',
    });
  }
  return out;
}

async function searchYouTubeCatalog(query: string): Promise<SuggestedTrack[]> {
  const key = `yt:${query.toLowerCase().trim()}`;
  const cached = getValidCached(ytSearchCache, key);
  if (cached) return cached;

  const [songsRes, videosRes] = await Promise.allSettled([
    ytdl.search(query, { type: SearchType.Song, limit: 25, signal: AbortSignal.timeout(5000) }),
    ytdl.search(query, { type: SearchType.Video, limit: 20, signal: AbortSignal.timeout(5000) }),
  ]);

  const songs = songsRes.status === 'fulfilled' ? songsRes.value : [];
  const videos = videosRes.status === 'fulfilled' ? videosRes.value : [];

  const merged = dedupeSuggestions([
    ...mapYtSummaries(songs),
    ...mapYtSummaries(videos),
  ]);

  if (merged.length > 0) {
    setBoundedCache(ytSearchCache, key, merged, 50);
  }
  return merged;
}

async function searchTikTokCatalog(input: {
  query: string;
  limit: number;
  ttCursor: number;
  ttChallengeId?: string;
}): Promise<{
  items: SuggestedTrack[];
  hasMore: boolean;
  nextTtCursor: number;
  ttChallengeId?: string;
}> {
  const { query, limit, ttCursor } = input;
  let challengeId = input.ttChallengeId || '';

  // 1. Tìm hashtag phù hợp nhất trên TikWM khi ở trang đầu
  if (!challengeId && ttCursor === 0) {
    const slugs = buildHashtagCandidates(query);
    for (const slug of slugs.slice(0, 3)) {
      try {
        const res = await fetch(
          `https://www.tikwm.com/api/challenge/search?keywords=${encodeURIComponent(
            slug
          )}&count=5&cursor=0`,
          { headers: { Accept: 'application/json', 'User-Agent': IPHONE_UA }, signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) continue;
        const json = await res.json();
        const list = (json?.data?.challenge_list || []) as Array<{ id?: string; view_count?: number }>;
        if (list[0]?.id) {
          challengeId = list[0].id;
          break;
        }
      } catch {}
    }
  }

  // 2. Kéo danh sách video theo hashtag (hỗ trợ cursor phân trang vô hạn)
  if (challengeId) {
    try {
      const postsRes = await fetch(
        `https://www.tikwm.com/api/challenge/posts?challenge_id=${encodeURIComponent(
          challengeId
        )}&count=${limit}&cursor=${ttCursor}`,
        { headers: { Accept: 'application/json', 'User-Agent': IPHONE_UA }, signal: AbortSignal.timeout(5000) }
      );
      if (postsRes.ok) {
        const postsJson = await postsRes.json();
        const videos = (postsJson?.data?.videos || []) as TikWmVideoRaw[];
        const mapped = mapTikWmVideos(videos);
        if (mapped.length > 0) {
          return {
            items: mapped,
            hasMore: Boolean(postsJson?.data?.hasMore),
            nextTtCursor: Number(postsJson?.data?.cursor ?? ttCursor + mapped.length),
            ttChallengeId: challengeId,
          };
        }
      }
    } catch {}
  }

  // 3. Fallback qua tìm User TikTok nếu user search tên nghệ sĩ/kênh ở trang đầu
  if (ttCursor === 0) {
    try {
      const uRes = await fetch(
        `https://www.tikwm.com/api/user/search?keywords=${encodeURIComponent(
          query
        )}&count=3&cursor=0`,
        { headers: { Accept: 'application/json', 'User-Agent': IPHONE_UA }, signal: AbortSignal.timeout(4000) }
      );
      if (uRes.ok) {
        const uJson = await uRes.json();
        const uniqueId = uJson?.data?.user_list?.[0]?.user?.unique_id;
        if (uniqueId) {
          const pRes = await fetch(
            `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(
              uniqueId
            )}&count=${limit}&cursor=0`,
            { headers: { Accept: 'application/json', 'User-Agent': IPHONE_UA }, signal: AbortSignal.timeout(4500) }
          );
          if (pRes.ok) {
            const pJson = await pRes.json();
            const mapped = mapTikWmVideos((pJson?.data?.videos || []) as TikWmVideoRaw[]);
            if (mapped.length > 0) {
              return {
                items: mapped,
                hasMore: false,
                nextTtCursor: mapped.length,
              };
            }
          }
        }
      }
    } catch {}

    // 4. Fallback qua Bing RSS site:tiktok.com + hydrate qua TikWM
    try {
      const bingRes = await fetch(
        `https://www.bing.com/search?q=${encodeURIComponent(
          `site:tiktok.com/video ${query}`
        )}&count=8&format=rss`,
        { headers: { 'User-Agent': DESKTOP_UA }, signal: AbortSignal.timeout(4500) }
      );
      if (bingRes.ok) {
        const xml = await bingRes.text();
        const urls = Array.from(
          xml.matchAll(/<link>(https:\/\/www\.tiktok\.com\/[^<]+)<\/link>/gi)
        )
          .map((m) => m[1])
          .filter((u) => /tiktok\.com\/(?:@[^/]+\/video\/\d+|video\/\d+)/i.test(u))
          .slice(0, 5);

        const hydrated = await Promise.allSettled(
          urls.map(async (u) => {
            const r = await fetch(
              `https://www.tikwm.com/api/?url=${encodeURIComponent(u)}`,
              { headers: { Accept: 'application/json', 'User-Agent': IPHONE_UA }, signal: AbortSignal.timeout(4000) }
            );
            if (!r.ok) return null;
            const j = await r.json();
            if (j?.code !== 0 || !j?.data) return null;
            return { ...j.data, video_id: j.data.id } as TikWmVideoRaw;
          })
        );

        const rawList = hydrated
          .filter((r): r is PromiseFulfilledResult<TikWmVideoRaw | null> => r.status === 'fulfilled')
          .map((r) => r.value)
          .filter((x): x is TikWmVideoRaw => Boolean(x));

        const mapped = mapTikWmVideos(rawList);
        if (mapped.length > 0) {
          return {
            items: mapped,
            hasMore: false,
            nextTtCursor: mapped.length,
          };
        }
      }
    } catch {}
  }

  return {
    items: [],
    hasMore: false,
    nextTtCursor: ttCursor,
    ttChallengeId: challengeId || undefined,
  };
}

/**
 * Tìm kiếm bài hát trên YouTube & TikTok có hỗ trợ phân trang khi kéo xuống
 */
export async function searchTracks(input: {
  query: string;
  platform?: 'all' | 'youtube' | 'tiktok';
  offset?: number;
  limit?: number;
  ttCursor?: number;
  ttChallengeId?: string;
}): Promise<{
  results: SuggestedTrack[];
  hasMore: boolean;
  nextOffset: number;
  nextTtCursor: number;
  ttChallengeId?: string;
}> {
  const query = input.query.trim();
  const platform = input.platform || 'all';
  const offset = Math.max(0, Number(input.offset) || 0);
  const limit = Math.min(16, Math.max(6, Number(input.limit) || 10));
  const ttCursor = Math.max(0, Number(input.ttCursor) || 0);

  if (!query) {
    return {
      results: [],
      hasMore: false,
      nextOffset: 0,
      nextTtCursor: 0,
    };
  }

  const ytLimit = platform === 'all' ? Math.ceil(limit * 0.6) : platform === 'youtube' ? limit : 0;
  const ttLimit = platform === 'all' ? Math.ceil(limit * 0.5) : platform === 'tiktok' ? limit : 0;

  const [ytPool, ttRes] = await Promise.all([
    ytLimit > 0 ? searchYouTubeCatalog(query) : Promise.resolve([]),
    ttLimit > 0
      ? searchTikTokCatalog({
          query,
          limit: ttLimit,
          ttCursor,
          ttChallengeId: input.ttChallengeId,
        })
      : Promise.resolve({
          items: [] as SuggestedTrack[],
          hasMore: false,
          nextTtCursor: ttCursor,
          ttChallengeId: input.ttChallengeId,
        }),
  ]);

  const ytSlice = ytLimit > 0 ? ytPool.slice(offset, offset + ytLimit) : [];
  const nextOffset = offset + ytSlice.length;
  const ytHasMore = ytLimit > 0 && nextOffset < ytPool.length;

  // Xen kẽ YouTube & TikTok mượt mà khi chọn Tất cả
  const merged: SuggestedTrack[] = [];
  const maxLen = Math.max(ytSlice.length, ttRes.items.length);
  for (let i = 0; i < maxLen; i++) {
    if (ytSlice[i]) merged.push(ytSlice[i]);
    if (ttRes.items[i]) merged.push(ttRes.items[i]);
  }

  return {
    results: dedupeSuggestions(merged),
    hasMore: ytHasMore || ttRes.hasMore,
    nextOffset,
    nextTtCursor: ttRes.nextTtCursor,
    ttChallengeId: ttRes.ttChallengeId,
  };
}
