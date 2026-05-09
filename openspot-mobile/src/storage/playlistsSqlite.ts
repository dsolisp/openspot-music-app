import { getDb } from '@/src/storage/database';
import type { Playlist } from '@/lib/playlist-storage';
import type { Track } from '@/types/music';

export async function replaceAllPlaylistsInSqlite(playlists: Playlist[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const pl of playlists) {
      await db.runAsync(
        `INSERT INTO playlists (name, cover) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET cover = excluded.cover`,
        pl.name,
        pl.cover || ''
      );
      const row = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM playlists WHERE name = ?`,
        pl.name
      );
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
      }
    }

    if (playlists.length > 0) {
      const placeholders = playlists.map(() => '?').join(',');
      const names = playlists.map((p) => p.name);
      await db.runAsync(`DELETE FROM playlists WHERE name NOT IN (${placeholders})`, ...names);
    } else {
      await db.execAsync('DELETE FROM playlist_items');
      await db.execAsync('DELETE FROM playlists');
    }
  });
}

export async function upsertTrackMeta(track: Track): Promise<void> {
  const db = await getDb();
  const json = JSON.stringify(track);
  await db.runAsync(`INSERT OR REPLACE INTO track_meta (track_id, json) VALUES (?, ?)`, track.id.toString(), json);
}

export async function getTrackMetaFromSqlite(trackId: string): Promise<Track | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ json: string }>(
      `SELECT json FROM track_meta WHERE track_id = ?`,
      trackId
    );
    if (row?.json) return JSON.parse(row.json) as Track;
  } catch {
    /* noop */
  }
  return null;
}
