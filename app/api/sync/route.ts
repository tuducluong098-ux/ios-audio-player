import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

interface TrackItem {
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

interface PlaylistItem {
  id: string;
  name: string;
  createdAt: number;
  tracks: TrackItem[];
}

interface UserSyncRecord {
  username: string;
  pinHash: string;
  updatedAt: number;
  playlists: PlaylistItem[];
  history: TrackItem[];
  queue: TrackItem[];
}

const USERNAME_REGEX = /^[a-z0-9]{1,10}$/;
const PIN_REGEX = /^\d{4}$/;

function getRedisConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    '';
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    '';
  return { url: url.replace(/\/+$/, ''), token };
}

async function redisCommand<T = unknown>(args: (string | number)[]): Promise<T> {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    throw new Error('MISSING_REDIS_CONFIG');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upstash Redis error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error);
  }
  return json.result as T;
}

function getSecretSalt() {
  return (
    process.env.SYNC_SECRET ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    'liquidaudio-sync-salt-v1'
  );
}

function hashPin(username: string, pin: string): string {
  return crypto
    .createHash('sha256')
    .update(`pin:${username}:${pin}:${getSecretSalt()}`)
    .digest('hex');
}

function deriveSyncKey(pinHash: string): string {
  return crypto
    .createHash('sha256')
    .update(`session:${pinHash}:${getSecretSalt()}`)
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function mergeTracks(primary: TrackItem[], secondary: TrackItem[], limit = 100): TrackItem[] {
  const seen = new Set<string>();
  const result: TrackItem[] = [];

  for (const item of [...primary, ...secondary]) {
    if (!item || !item.originalUrl) continue;
    const key = item.id || item.originalUrl;
    if (seen.has(key) || seen.has(item.originalUrl)) continue;
    seen.add(key);
    seen.add(item.originalUrl);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}

function mergePlaylists(cloud: PlaylistItem[], local: PlaylistItem[]): PlaylistItem[] {
  const map = new Map<string, PlaylistItem>();

  for (const pl of cloud) {
    if (!pl || !pl.id) continue;
    map.set(pl.id, { ...pl, tracks: Array.isArray(pl.tracks) ? [...pl.tracks] : [] });
  }

  for (const pl of local) {
    if (!pl || !pl.id) continue;
    const existing = map.get(pl.id);
    if (existing) {
      existing.tracks = mergeTracks(existing.tracks, pl.tracks || [], 200);
    } else if (pl.tracks?.length > 0 || pl.id !== 'pl_default') {
      map.set(pl.id, { ...pl, tracks: Array.isArray(pl.tracks) ? [...pl.tracks] : [] });
    }
  }

  return Array.from(map.values());
}

function sanitizeSyncData(raw: unknown): {
  playlists: PlaylistItem[];
  history: TrackItem[];
  queue: TrackItem[];
} {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    playlists: Array.isArray(obj.playlists) ? (obj.playlists as PlaylistItem[]).slice(0, 50) : [],
    history: Array.isArray(obj.history) ? (obj.history as TrackItem[]).slice(0, 100) : [],
    queue: Array.isArray(obj.queue) ? (obj.queue as TrackItem[]).slice(0, 150) : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action as 'auth' | 'pull' | 'push';
    const username = String(body?.username || '').trim().toLowerCase();

    if (!USERNAME_REGEX.test(username)) {
      return NextResponse.json(
        { error: 'Tên phải từ 1–10 ký tự chữ thường hoặc số, không dấu, không khoảng trắng.' },
        { status: 400 }
      );
    }

    const redisKey = `liquidaudio:user:${username}`;
    const rawRecord = await redisCommand<string | null>(['GET', redisKey]);
    const existingRecord: UserSyncRecord | null = rawRecord ? JSON.parse(rawRecord) : null;

    // 1. ĐĂNG NHẬP HOẶC TỰ TẠO TÀI KHOẢN MỚI BẰNG TÊN + PIN 4 SỐ
    if (action === 'auth') {
      const pin = String(body?.pin || '').trim();
      if (!PIN_REGEX.test(pin)) {
        return NextResponse.json(
          { error: 'Mã PIN phải gồm đúng 4 chữ số (VD: 1234).' },
          { status: 400 }
        );
      }

      const incomingPinHash = hashPin(username, pin);
      const localData = sanitizeSyncData(body?.localData);

      if (!existingRecord) {
        // Tạo mới tài khoản với dữ liệu đang có trên thiết bị
        const newRecord: UserSyncRecord = {
          username,
          pinHash: incomingPinHash,
          updatedAt: Date.now(),
          ...localData,
        };
        await redisCommand(['SET', redisKey, JSON.stringify(newRecord)]);

        return NextResponse.json({
          isNew: true,
          username,
          syncKey: deriveSyncKey(incomingPinHash),
          updatedAt: newRecord.updatedAt,
          playlists: newRecord.playlists,
          history: newRecord.history,
          queue: newRecord.queue,
        });
      }

      // Kiểm tra đúng PIN
      if (!safeEqual(existingRecord.pinHash, incomingPinHash)) {
        return NextResponse.json(
          { error: 'Sai mã PIN 4 số hoặc tên này đã được người khác dùng.' },
          { status: 401 }
        );
      }

      // Gộp thông minh dữ liệu giữa máy hiện tại và Cloud để không mất bài nào
      const mergedPlaylists = mergePlaylists(
        existingRecord.playlists || [],
        localData.playlists
      );
      const mergedHistory = mergeTracks(
        existingRecord.history || [],
        localData.history,
        100
      );
      const mergedQueue =
        existingRecord.queue?.length > 0 ? existingRecord.queue : localData.queue;

      const updatedRecord: UserSyncRecord = {
        ...existingRecord,
        updatedAt: Date.now(),
        playlists: mergedPlaylists,
        history: mergedHistory,
        queue: mergedQueue,
      };
      await redisCommand(['SET', redisKey, JSON.stringify(updatedRecord)]);

      return NextResponse.json({
        isNew: false,
        username,
        syncKey: deriveSyncKey(existingRecord.pinHash),
        updatedAt: updatedRecord.updatedAt,
        playlists: updatedRecord.playlists,
        history: updatedRecord.history,
        queue: updatedRecord.queue,
      });
    }

    // Các thao tác pull / push yêu cầu syncKey hợp lệ
    const syncKey = String(body?.syncKey || '');
    if (!existingRecord) {
      return NextResponse.json(
        { error: 'Tài khoản đồng bộ không tồn tại.' },
        { status: 404 }
      );
    }

    const expectedSyncKey = deriveSyncKey(existingRecord.pinHash);
    if (!safeEqual(expectedSyncKey, syncKey)) {
      return NextResponse.json(
        { error: 'Phiên đồng bộ hết hạn hoặc sai thông tin xác thực.' },
        { status: 401 }
      );
    }

    // 2. KÉO DỮ LIỆU TỪ CLOUD VỀ MÁY
    if (action === 'pull') {
      return NextResponse.json({
        username,
        updatedAt: existingRecord.updatedAt,
        playlists: existingRecord.playlists || [],
        history: existingRecord.history || [],
        queue: existingRecord.queue || [],
      });
    }

    // 3. ĐẨY DỮ LIỆU TỪ MÁY LÊN CLOUD
    if (action === 'push') {
      const incomingData = sanitizeSyncData(body?.data);
      const nextRecord: UserSyncRecord = {
        ...existingRecord,
        updatedAt: Date.now(),
        playlists: incomingData.playlists,
        history: incomingData.history,
        queue: incomingData.queue,
      };
      await redisCommand(['SET', redisKey, JSON.stringify(nextRecord)]);

      return NextResponse.json({
        ok: true,
        username,
        updatedAt: nextRecord.updatedAt,
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'MISSING_REDIS_CONFIG') {
      return NextResponse.json(
        {
          error:
            'Chưa gắn Upstash Redis trên Vercel. Hãy vào Vercel → Storage → Create Upstash Redis để kích hoạt đồng bộ.',
        },
        { status: 503 }
      );
    }
    const message =
      err instanceof Error ? err.message : 'Lỗi máy chủ khi đồng bộ dữ liệu.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
