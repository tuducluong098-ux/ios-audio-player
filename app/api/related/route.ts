import { NextRequest, NextResponse } from 'next/server';
import { getRelatedTracks } from '@/lib/audio-providers';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const track = body?.track;

    if (!track || (!track.originalUrl && !track.title)) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    const suggestions = await getRelatedTracks({
      id: track.id,
      originalUrl: track.originalUrl,
      title: track.title,
      author: track.author,
      source: track.source,
    });

    return NextResponse.json({ suggestions }, { status: 200 });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}
