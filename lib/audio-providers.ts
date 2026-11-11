import { Ytdl, SearchType, chooseFormat, Quality } from '@distube/ytdl-core';

export const ytdl = new Ytdl({ timeoutMs: 8000 });

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
 * Lấy SoundCloud client_id công khai và cache trong process
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
  user?: { username?: string; avatar_url?: string };
  media?: {
    transcodings?: Array<{
      url: string;
      format?: { protocol?: string; mime_type?: string };
    }>;
  };
  tracks?: ScTrackRaw[];
}

async function resolveSoundCloudStream(
  track: ScTrackRaw,
  clientId: string
): Promise<{ audioUrl: string; mimeType: string } | null> {
  const transcodings = track?.media?.transcodings || [];
  if (transcodings.length === 0) return null;

  const sorted = [...transcodings].sort((a, b) => {
    const score = (t: typeof a) => {
      if (t.format?.protocol === 'progressive') return 0;
      if (t.format?.protocol === 'hls' && t.format?.mime_type?.includes('audio/mp4')) return 1;
      return 2;
    };
    return score(a) - score(b);
  });

  for (const candidate of sorted) {
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
        const mimeType =
          candidate.format?.protocol === 'hls' && streamJson.url.includes('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : candidate.format?.mime_type?.split(';')[0] || 'audio/mpeg';
        return { audioUrl: streamJson.url, mimeType };
      }
    } catch {
      continue;
    }
  }

  return null;
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

/**
 * Trích xuất YouTube (ưu tiên M4A/MP4 cho iOS Safari)
 */
export async function extractYouTube(url: string): Promise<ExtractedAudio> {
  const videoIdMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/|.*shorts\/))([^&?/]+)/
  );
  const videoId = videoIdMatch ? videoIdMatch[1] : `${Date.now()}`;

  try {
    const info = await ytdl.getInfo(url, { signal: AbortSignal.timeout(8000) });
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
      const audioStreams: Array<{ url: string; mimeType: string }> = data.audioStreams || [];
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
 * Tìm bản full theo tên bài + ca sĩ trên YouTube Music -> fallback SoundCloud Search
 */
export async function searchAndExtractByQuery(
  query: string,
  meta?: { title?: string; author?: string; thumbnail?: string; originalUrl?: string; source?: AudioSource; id?: string }
): Promise<ExtractedAudio> {
  // Ưu tiên 1: Tìm bài hát trên YouTube Music
  try {
    const songs = await ytdl.search(query, {
      type: SearchType.Song,
      limit: 3,
      signal: AbortSignal.timeout(5000),
    });
    for (const song of songs) {
      if (!song.url) continue;
      try {
        const yt = await extractYouTube(song.url);
        return {
          ...yt,
          id: meta?.id || yt.id,
          originalUrl: meta?.originalUrl || yt.originalUrl,
          title: meta?.title || yt.title,
          author: meta?.author || yt.author,
          thumbnail: meta?.thumbnail || yt.thumbnail,
          source: meta?.source || yt.source,
        };
      } catch {
        continue;
      }
    }
  } catch {}

  // Ưu tiên 2: Fallback sang SoundCloud Search
  try {
    const cid = await getSoundCloudClientId();
    const searchRes = await fetch(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
        query
      )}&limit=5&client_id=${cid}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    );
    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      const tracks = (searchJson?.collection || []) as ScTrackRaw[];
      for (const scTrack of tracks) {
        const stream = await resolveSoundCloudStream(scTrack, cid);
        if (stream) {
          const thumb = (
            meta?.thumbnail ||
            scTrack.artwork_url ||
            scTrack.user?.avatar_url ||
            'https://placehold.co/512x512/18181b/ffffff.jpg?text=Audio'
          ).replace('-large', '-t500x500');
          return {
            id: meta?.id || `sc_${scTrack.id || Date.now()}`,
            originalUrl: meta?.originalUrl || scTrack.permalink_url || '',
            audioUrl: stream.audioUrl,
            title: meta?.title || scTrack.title || query,
            author: meta?.author || scTrack.user?.username || 'Artist',
            thumbnail: thumb,
            source: meta?.source || 'soundcloud',
            mimeType: stream.mimeType,
            extractedAt: Date.now(),
          };
        }
      }
    }
  } catch {}

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

/**
 * Lấy danh sách bài gợi ý (Related Tracks) theo bài đang nghe
 */
export async function getRelatedTracks(input: {
  id?: string;
  originalUrl?: string;
  title?: string;
  author?: string;
  source?: AudioSource;
}): Promise<SuggestedTrack[]> {
  const source = input.source;
  const originalUrl = input.originalUrl || '';

  // 1. YouTube -> Dùng YouTube Music Radio trực tiếp
  if (source === 'youtube' && /youtube\.com|youtu\.be/i.test(originalUrl)) {
    try {
      let related = await ytdl.getRelated(originalUrl, {
        music: true,
        signal: AbortSignal.timeout(6000),
      });
      if (related.length === 0) {
        related = await ytdl.getRelated(originalUrl, {
          signal: AbortSignal.timeout(5000),
        });
      }
      return related
        .filter((v) => !v.isLive && v.url && v.title)
        .slice(0, 8)
        .map((v) => ({
          id: `yt_${v.id}`,
          url: v.url,
          title: v.title,
          author: v.author?.name || 'YouTube',
          thumbnail:
            v.thumbnails?.[v.thumbnails.length - 1]?.url ||
            `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          source: 'youtube',
        }));
    } catch {}
  }

  // 2. SoundCloud -> Dùng Related Tracks API theo Track ID
  if (source === 'soundcloud') {
    try {
      const cid = await getSoundCloudClientId();
      const numericId = input.id?.replace(/^sc_/, '').match(/^\d+$/)?.[0];

      if (numericId) {
        const relRes = await fetch(
          `https://api-v2.soundcloud.com/tracks/${numericId}/related?limit=8&client_id=${cid}`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
        );
        if (relRes.ok) {
          const relJson = await relRes.json();
          const items = (relJson?.collection || []) as ScTrackRaw[];
          if (items.length > 0) {
            return items
              .filter((t) => t.permalink_url && t.title)
              .slice(0, 8)
              .map((t) => ({
                id: `sc_${t.id || Date.now()}`,
                url: t.permalink_url!,
                title: t.title!,
                author: t.user?.username || 'SoundCloud',
                thumbnail: (
                  t.artwork_url ||
                  t.user?.avatar_url ||
                  'https://placehold.co/512x512/18181b/ffffff.jpg?text=SoundCloud'
                ).replace('-large', '-t500x500'),
                source: 'soundcloud',
              }));
          }
        }
      }
    } catch {}
  }

  // 3. Spotify / TikTok / Fallback chung -> Tìm bài liên quan từ YouTube Music & SoundCloud theo tên bài
  const cleanTitle = (input.title || '')
    .replace(/^(âm thanh gốc|nhạc nền|original sound)\s*[-–:]\s*/i, '')
    .trim();
  const query = `${cleanTitle} ${input.author || ''}`.trim();
  if (!query) return [];

  const suggestions: SuggestedTrack[] = [];

  try {
    const songs = await ytdl.search(query, {
      type: SearchType.Song,
      limit: 5,
      signal: AbortSignal.timeout(5000),
    });

    // Nếu tìm được bài hạt giống, lấy Radio liên quan từ YouTube Music cho chuẩn gu
    if (songs[0]?.url) {
      const radio = await ytdl
        .getRelated(songs[0].url, { music: true, signal: AbortSignal.timeout(5000) })
        .catch(() => []);
      for (const v of radio.slice(0, 6)) {
        if (!v.url || !v.title || v.isLive) continue;
        suggestions.push({
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
    }

    if (suggestions.length < 4) {
      for (const v of songs) {
        if (!v.url || !v.title) continue;
        if (suggestions.some((s) => s.url === v.url)) continue;
        suggestions.push({
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
    }
  } catch {}

  if (suggestions.length < 4) {
    try {
      const cid = await getSoundCloudClientId();
      const scRes = await fetch(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
          query
        )}&limit=6&client_id=${cid}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4500) }
      );
      if (scRes.ok) {
        const scJson = await scRes.json();
        const items = (scJson?.collection || []) as ScTrackRaw[];
        for (const t of items) {
          if (!t.permalink_url || !t.title) continue;
          suggestions.push({
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
      }
    } catch {}
  }

  return suggestions.slice(0, 8);
}
