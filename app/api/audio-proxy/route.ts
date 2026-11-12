import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

const ALLOWED_AUDIO_HOSTS = [
  'googlevideo.com',
  'youtube.com',
  'youtu.be',
  'sndcdn.com',
  'soundcloud.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokv.com',
  'tikwm.com',
  'muscdn.com',
];

const MAX_CHUNK_BYTES = 512 * 1024; // 512 KB mỗi đoạn Range -> truyền tải nhanh trên 5G, không bị Vercel timeout 10s giữa chừng

function isAllowedAudioHost(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_AUDIO_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

function clampRangeHeader(rawRange: string | null): string {
  if (!rawRange) {
    return `bytes=0-${MAX_CHUNK_BYTES - 1}`;
  }
  const match = rawRange.match(/^bytes=(\d+)-(\d*)$/i);
  if (!match) return `bytes=0-${MAX_CHUNK_BYTES - 1}`;

  const start = parseInt(match[1], 10);
  const rawEnd = match[2] ? parseInt(match[2], 10) : NaN;
  const end =
    Number.isFinite(rawEnd) && rawEnd >= start
      ? Math.min(rawEnd, start + MAX_CHUNK_BYTES - 1)
      : start + MAX_CHUNK_BYTES - 1;

  return `bytes=${start}-${end}`;
}

/**
 * Proxy stream audio hỗ trợ HTTP 206 Partial Content (Range) & HEAD probe cho CoreMedia iOS.
 * Giúp iPhone 4G/5G phát được URL googlevideo.com vốn bị khóa theo IP máy chủ Vercel.
 */
async function handleAudioProxy(req: NextRequest, method: 'GET' | 'HEAD') {
  const targetUrl = req.nextUrl.searchParams.get('url');

  if (!targetUrl || !isAllowedAudioHost(targetUrl)) {
    return NextResponse.json({ error: 'Invalid audio stream URL.' }, { status: 400 });
  }

  const headerAbort = new AbortController();
  const headerTimer = setTimeout(() => headerAbort.abort(), 6500);

  try {
    const rangeHeader = clampRangeHeader(req.headers.get('range'));
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Range: rangeHeader,
    };

    if (/tiktok/i.test(targetUrl)) {
      headers.Referer = 'https://www.tiktok.com/';
    } else if (/youtube|googlevideo/i.test(targetUrl)) {
      headers.Referer = 'https://www.youtube.com/';
      headers.Origin = 'https://www.youtube.com';
    }

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      redirect: 'follow',
      signal: headerAbort.signal,
    });
    clearTimeout(headerTimer);

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `Upstream audio returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const resHeaders = new Headers();
    const copyKeys = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
    ];
    for (const key of copyKeys) {
      const val = upstream.headers.get(key);
      if (val) resHeaders.set(key, val);
    }

    if (!resHeaders.has('accept-ranges')) {
      resHeaders.set('accept-ranges', 'bytes');
    }
    resHeaders.set('Cache-Control', 'private, max-age=1800');
    resHeaders.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch {
    clearTimeout(headerTimer);
    return NextResponse.json({ error: 'Audio proxy timeout or failed.' }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return handleAudioProxy(req, 'GET');
}

export async function HEAD(req: NextRequest) {
  return handleAudioProxy(req, 'HEAD');
}
