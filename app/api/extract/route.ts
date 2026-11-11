import { NextRequest, NextResponse } from 'next/server';
import {
  extractTikTok,
  extractSoundCloud,
  extractYouTube,
  extractSpotify,
  searchAndExtractByQuery,
} from '@/lib/audio-providers';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInput = String(body?.url || '').trim();

    if (!rawInput) {
      return NextResponse.json({ error: 'Vui lòng nhập đường dẫn (URL).' }, { status: 400 });
    }

    // Hỗ trợ lazy-resolve cho các bài trong Spotify Playlist hoặc từ Gợi ý
    if (rawInput.startsWith('spotify-search://')) {
      const query = decodeURIComponent(rawInput.replace('spotify-search://', ''));
      const track = await searchAndExtractByQuery(query, {
        originalUrl: rawInput,
        source: 'spotify',
      });
      return NextResponse.json(track, { status: 200 });
    }

    const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
    const rawUrl = (urlMatch ? urlMatch[0] : rawInput).trim();

    const isTikTok = /tiktok\.com/i.test(rawUrl);
    const isYouTube = /(youtube\.com|youtu\.be)/i.test(rawUrl);
    const isSoundCloud = /(soundcloud\.com|soundcloud\.app\.goo\.gl)/i.test(rawUrl);
    const isSpotify = /(open\.spotify\.com|spotify\.link)/i.test(rawUrl);

    if (!isTikTok && !isYouTube && !isSoundCloud && !isSpotify) {
      return NextResponse.json(
        { error: 'Chỉ hỗ trợ đường dẫn từ TikTok, YouTube, SoundCloud hoặc Spotify.' },
        { status: 400 }
      );
    }

    if (isSpotify) {
      const spResult = await extractSpotify(rawUrl);
      if (spResult.isBatch) {
        return NextResponse.json(
          {
            isBatch: true,
            playlistName: spResult.playlistName,
            tracks: spResult.tracks,
          },
          { status: 200 }
        );
      }
      return NextResponse.json(spResult.track, { status: 200 });
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
