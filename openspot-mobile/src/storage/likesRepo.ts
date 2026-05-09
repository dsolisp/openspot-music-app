import { getDb } from '@/src/storage/database';
import type { Track } from '@/types/music';

export interface LikedSong {
  id: string | number;
  provider?: 'ytmusic';
  title: string;
  artist: string;
  albumTitle?: string;
  duration?: number;
  images: {
    small: string;
    thumbnail: string;
    large: string;
    back: string | null;
  };
  likedAt: string;
}

export function trackToLikedSong(track: Track): LikedSong {
  return {
    id: track.id,
    provider: 'ytmusic',
    title: track.title,
    artist: track.artist,
    albumTitle: track.albumTitle,
    duration: track.duration,
    images: track.images,
    likedAt: new Date().toISOString(),
  };
}

export async function getAllLikesOrderedNewestFirst(): Promise<LikedSong[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(
    `SELECT json FROM likes ORDER BY liked_at DESC`
  );
  return rows.map((r) => JSON.parse(r.json) as LikedSong);
}

export async function upsertLike(song: LikedSong): Promise<void> {
  const db = await getDb();
  const id = song.id.toString();
  const json = JSON.stringify(song);
  await db.runAsync(
    `INSERT OR REPLACE INTO likes (track_id, json, liked_at) VALUES (?, ?, ?)`,
    id,
    json,
    song.likedAt
  );
}

export async function removeLikeByTrackId(trackId: string | number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM likes WHERE track_id = ?`, trackId.toString());
}

export async function clearAllLikes(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`DELETE FROM likes`);
}
