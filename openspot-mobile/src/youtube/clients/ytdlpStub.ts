/**
 * yt-dlp tier (deferred): playback extraction via WASM, companion app, or backend.
 * Not used in default APK. Returns null so the adapter can try other tiers or fail last.
 */
export async function tryYtdlpStream(_videoId: string): Promise<string | null> {
  return null;
}
