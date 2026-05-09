import { Platform } from 'react-native';

let SQLite: typeof import('expo-sqlite') | null = null;

export const DB_NAME = 'openspot.db';

type SqlDb = import('expo-sqlite').SQLiteDatabase;

let dbPromise: Promise<SqlDb> | null = null;

export function getDb(): Promise<SqlDb> {
  if (Platform.OS === 'web') {
    // Web build has no native SQLite module; avoid crashing devtools/web.
    return Promise.reject(new Error('SQLite is not available on web'));
  }
  if (!dbPromise) {
    if (!SQLite) SQLite = require('expo-sqlite');
    dbPromise = SQLite!.openDatabaseAsync(DB_NAME).then(async (db: SqlDb) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS playlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          cover TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS playlist_items (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, track_id)
        );
        CREATE TABLE IF NOT EXISTS track_meta (
          track_id TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS likes (
          track_id TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL,
          liked_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS downloads (
          track_id TEXT PRIMARY KEY NOT NULL,
          file_uri TEXT NOT NULL,
          thumb_uri TEXT,
          json TEXT NOT NULL,
          downloaded_at TEXT NOT NULL,
          bytes INTEGER,
          checksum TEXT
        );
        CREATE TABLE IF NOT EXISTS cache_entries (
          cache_key TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id, position);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
      `);
      await db.runAsync(
        `INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '1')`
      );
      return db;
    });
  }
  return dbPromise;
}

/** Evict oldest cache rows when over cap (by expires_at). */
export async function evictCacheIfNeeded(maxRows = 500): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM cache_entries'
  );
  if ((row?.c ?? 0) <= maxRows) return;
  const toDelete = (row!.c as number) - maxRows;
  await db.runAsync(
    `DELETE FROM cache_entries WHERE cache_key IN (
       SELECT cache_key FROM cache_entries ORDER BY expires_at ASC LIMIT ?
     )`,
    toDelete
  );
}
