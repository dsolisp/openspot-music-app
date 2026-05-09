import { getDb } from '@/src/storage/database';
import type { Track } from '@/types/music';
import * as FileSystem from 'expo-file-system';

export interface OfflineDownloadRow {
  track_id: string;
  file_uri: string;
  thumb_uri: string | null;
  track: Track;
  downloaded_at: string;
  bytes: number | null;
  checksum: string | null;
}

export async function getDownloadByTrackId(trackId: string | number): Promise<OfflineDownloadRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    track_id: string;
    file_uri: string;
    thumb_uri: string | null;
    json: string;
    downloaded_at: string;
    bytes: number | null;
    checksum: string | null;
  }>(`SELECT * FROM downloads WHERE track_id = ?`, trackId.toString());
  if (!row) return null;
  return {
    track_id: row.track_id,
    file_uri: row.file_uri,
    thumb_uri: row.thumb_uri,
    track: JSON.parse(row.json) as Track,
    downloaded_at: row.downloaded_at,
    bytes: row.bytes,
    checksum: row.checksum,
  };
}

export async function getAllDownloadsNewestFirst(): Promise<OfflineDownloadRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    track_id: string;
    file_uri: string;
    thumb_uri: string | null;
    json: string;
    downloaded_at: string;
    bytes: number | null;
    checksum: string | null;
  }>(`SELECT * FROM downloads ORDER BY downloaded_at DESC`);
  return rows.map((row) => ({
    track_id: row.track_id,
    file_uri: row.file_uri,
    thumb_uri: row.thumb_uri,
    track: JSON.parse(row.json) as Track,
    downloaded_at: row.downloaded_at,
    bytes: row.bytes,
    checksum: row.checksum,
  }));
}

export async function upsertDownload(params: {
  track: Track;
  file_uri: string;
  thumb_uri: string | null;
  downloaded_at?: string;
  bytes?: number | null;
  checksum?: string | null;
}): Promise<void> {
  const db = await getDb();
  const trackId = params.track.id.toString();
  const json = JSON.stringify(params.track);
  const at = params.downloaded_at ?? new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO downloads (track_id, file_uri, thumb_uri, json, downloaded_at, bytes, checksum)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    trackId,
    params.file_uri,
    params.thumb_uri,
    json,
    at,
    params.bytes ?? null,
    params.checksum ?? null
  );
  
  // Evict old downloads if we exceed 200 items to prevent unbounded growth
  await evictOldDownloads(200).catch(console.error);
}

export async function removeDownloadByTrackId(trackId: string | number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM downloads WHERE track_id = ?`, trackId.toString());
}

/** Evict oldest downloaded tracks to respect storage bounds, removing files. */
export async function evictOldDownloads(maxRows = 200): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM downloads'
  );
  if ((row?.c ?? 0) <= maxRows) return;
  const toDelete = (row!.c as number) - maxRows;
  
  const rowsToDelete = await db.getAllAsync<{ track_id: string, file_uri: string }>(
    `SELECT track_id, file_uri FROM downloads ORDER BY downloaded_at ASC LIMIT ?`,
    toDelete
  );
  
  for (const item of rowsToDelete) {
    try {
      if (item.file_uri) {
        await FileSystem.deleteAsync(item.file_uri, { idempotent: true });
      }
    } catch {
      /* ignore file deletion errors */
    }
  }
  
  if (rowsToDelete.length > 0) {
    const ids = rowsToDelete.map(r => `'${r.track_id.replace(/'/g, "''")}'`).join(',');
    await db.runAsync(`DELETE FROM downloads WHERE track_id IN (${ids})`);
  }
}
