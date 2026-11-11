import { NextRequest, NextResponse } from 'next/server';
import { searchTracks } from '@/lib/audio-providers';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body?.query || '').trim();
    const platform =
      body?.platform === 'youtube' || body?.platform === 'tiktok'
        ? body.platform
        : 'all';

    if (!query) {
      return NextResponse.json(
        { results: [], hasMore: false, nextOffset: 0, nextTtCursor: 0 },
        { status: 200 }
      );
    }

    const data = await searchTracks({
      query,
      platform,
      offset: Number(body?.offset) || 0,
      limit: Number(body?.limit) || 10,
      ttCursor: Number(body?.ttCursor) || 0,
      ttChallengeId: body?.ttChallengeId ? String(body.ttChallengeId) : undefined,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Lỗi tìm kiếm bài hát.';
    return NextResponse.json(
      { results: [], hasMore: false, error: message },
      { status: 500 }
    );
  }
}
