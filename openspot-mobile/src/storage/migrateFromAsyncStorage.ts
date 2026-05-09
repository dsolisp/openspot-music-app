import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Playlist } from '@/lib/playlist-storage';
import type { Track } from '@/types/music';
import { getDb } from '@/src/storage/database';
import { upsertLike, type LikedSong } from '@/src/storage/likesRepo';
import { upsertDownload } from '@/src/storage/downloadsRepo';

const LEGACY_MIGRATED = 'openspot_sqlite_migrated_v1';
const LIBRARY_SQLITE_MIGRATED = 'openspot_sqlite_likes_downloads_v1';
const LIKED_SONGS_STORAGE_KEY = 'openspot_liked_songs';
const PLAYLISTS_KEY = 'user_playlists';
const TRACK_DATA_PREFIX = 'user_track_data_';

async function legacyGetPlaylists(): Promise<Playlist[]> {
  const data = await AsyncStorage.getItem(PLAYLISTS_KEY);
  return data ? JSON.parse(data) : [];
}

/** One-time migrate playlists + per-track JSON blobs into SQLite. */
export async function migrateLegacyAsyncStorageIfNeeded(): Promise<void> {
  const done = await AsyncStorage.getItem(LEGACY_MIGRATED);
  if (done === '1') return;

  const db = await getDb();
  const legacy = await legacyGetPlaylists();

  for (const pl of legacy) {
    await db.runAsync(`INSERT OR IGNORE INTO playlists (name, cover) VALUES (?, ?)`, pl.name, pl.cover || '');
    const row = await db.getFirstAsync<{ id: number }>(`SELECT id FROM playlists WHERE name = ?`, pl.name);
    const pid = row?.id;
    if (!pid) continue;

    await db.runAsync(`DELETE FROM playlist_items WHERE playlist_id = ?`, pid);
    let pos = 0;
    for (const tid of pl.trackIds) {
      await db.runAsync(
        `INSERT INTO playlist_items (playlist_id, track_id, position) VALUES (?, ?, ?)`,
        pid,
        tid,
        pos++
      );
      const key = `${TRACK_DATA_PREFIX}${tid}`;
      const td = await AsyncStorage.getItem(key);
      if (td) {
        await db.runAsync(`INSERT OR REPLACE INTO track_meta (track_id, json) VALUES (?, ?)`, tid, td);
      }
    }
  }

  await AsyncStorage.setItem(LEGACY_MIGRATED, '1');
}

/** One-time: liked songs + offline download blobs from AsyncStorage into SQLite. */
export async function migrateLibraryFromAsyncStorageIfNeeded(): Promise<void> {
  const done = await AsyncStorage.getItem(LIBRARY_SQLITE_MIGRATED);
  if (done === '1') return;

  try {
    const rawLikes = await AsyncStorage.getItem(LIKED_SONGS_STORAGE_KEY);
    if (rawLikes) {
      const parsed = JSON.parse(rawLikes) as LikedSong[];
      for (const song of parsed) {
        const normalized: LikedSong = {
          ...song,
          provider: 'ytmusic',
          likedAt: song.likedAt || new Date().toISOString(),
        };
        await upsertLike(normalized);
      }
    }
  } catch (e) {
    console.warn('[OpenSpot] migrate likes', e);
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      if (!key.startsWith('offline_')) continue;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      try {
        const o = JSON.parse(raw) as {
          fileUri?: string;
          thumbUri?: string | null;
          trackData?: Track;
          downloadedAt?: string;
        };
        if (o.trackData && o.fileUri) {
          await upsertDownload({
            track: o.trackData,
            file_uri: o.fileUri,
            thumb_uri: typeof o.thumbUri === 'string' ? o.thumbUri : null,
            downloaded_at: o.downloadedAt,
          });
        }
      } catch {
        /* skip corrupt row */
      }
    }
  } catch (e) {
    console.warn('[OpenSpot] migrate offline downloads', e);
  }

  await AsyncStorage.setItem(LIBRARY_SQLITE_MIGRATED, '1');
}

/** Refresh AsyncStorage mirror of playlists from SQLite (keeps existing screens working). */
export async function mirrorPlaylistsToAsyncStorage(): Promise<void> {
  const db = await getDb();

  // Single JOIN — O(1) queries regardless of playlist count
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    cover: string;
    track_id: string | null;
    position: number | null;
  }>(
    `SELECT p.id, p.name, p.cover, pi.track_id, pi.position
     FROM playlists p
     LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
     ORDER BY p.sort_order, p.id, pi.position`
  );

  // Group rows into playlists in JS
  const playlistMap = new Map<number, Playlist & { _id: number }>();
  for (const row of rows) {
    if (!playlistMap.has(row.id)) {
      playlistMap.set(row.id, { _id: row.id, name: row.name, cover: row.cover, trackIds: [] });
    }
    if (row.track_id != null) {
      playlistMap.get(row.id)!.trackIds.push(row.track_id);
    }
  }

  const playlists: Playlist[] = [...playlistMap.values()].map(({ _id: _ignored, ...rest }) => rest);
  await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}
