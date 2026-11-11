import { NextRequest, NextResponse } from 'next/server';
import { getRelatedTracksPage } from '@/lib/audio-providers';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const track = body?.track;

    if (!track || (!track.originalUrl && !track.title)) {
      return NextResponse.json(
        { suggestions: [], hasMore: false, nextOffset: 0 },
        { status: 200 }
      );
    }

    const offset = Math.max(0, Number(body?.offset) || 0);
    const limit = Math.min(20, Math.max(4, Number(body?.limit) || 10));

    const data = await getRelatedTracksPage({
      id: track.id,
      originalUrl: track.originalUrl,
      title: track.title,
      author: track.author,
      source: track.source,
      offset,
      limit,
    });

    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json(
      { suggestions: [], hasMore: false, nextOffset: 0 },
      { status: 200 }
    );
  }
}
