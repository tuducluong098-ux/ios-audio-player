import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * Proxy hình ảnh đại diện (Thumbnail) cho iOS Dynamic Island & Lock Screen.
 * Giúp vượt qua chặn Referer/Hotlink của CDN TikTok và đảm bảo trả về đúng Content-Type image/*
 * để iOS MediaSession luôn hiển thị được ảnh bìa trên Dynamic Island.
 */
export async function GET(req: NextRequest) {
  const imageUrl = req.nextUrl.searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.redirect('https://placehold.co/512x512/18181b/ffffff.jpg?text=Audio');
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    };

    if (/tiktok/i.test(imageUrl)) {
      headers.Referer = 'https://www.tiktok.com/';
    } else if (/sndcdn|soundcloud/i.test(imageUrl)) {
      headers.Referer = 'https://soundcloud.com/';
    }

    const res = await fetch(imageUrl, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.redirect('https://placehold.co/512x512/18181b/ffffff.jpg?text=Audio');
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.redirect('https://placehold.co/512x512/18181b/ffffff.jpg?text=Audio');
  }
}
