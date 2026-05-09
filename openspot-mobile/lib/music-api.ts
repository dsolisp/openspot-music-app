import { YouTubeAdapter } from '@/src/youtube/YouTubeAdapter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeTitle, sanitizeArtist, parseArtistAndTitle } from '@/src/utils/metadata';

const PROVIDER_KEY = 'openspot_provider_v1';

/** YouTube-only: all browse + streams go through `YouTubeAdapter` (Invidious → Piped → youtube-sr). */
export class MusicAPI {
  private static recentlyPlayedStorageKey = 'openspot_recently_played_tracks_v1';
  private static recentlyPlayedLimit = 30;

  static async ensureYouTubeProviderDefault(): Promise<void> {
    try {
      const cur = await AsyncStorage.getItem(PROVIDER_KEY);
      if (cur !== 'ytmusic') {
        await AsyncStorage.setItem(PROVIDER_KEY, 'ytmusic');
      }
    } catch {
      /* noop */
    }
  }

  static async search(params: SearchParams): Promise<SearchResponse> {
    return YouTubeAdapter.instance.search(params);
  }

  static async searchTracks(query: string, _offset: number = 0, _limit: number = 20): Promise<SearchResponse> {
    return YouTubeAdapter.instance.search({ q: query, type: 'track' });
  }

  static async getStreamUrl(trackId: string, _trackOrProvider?: Track | 'ytmusic'): Promise<string> {
    return YouTubeAdapter.instance.getAudioStreamUrl(trackId);
  }

  static async getDownloadUrl(trackId: string, trackOrProvider?: Track | 'ytmusic'): Promise<string> {
    return MusicAPI.getStreamUrl(trackId, trackOrProvider);
  }

  static async getPopularTracks(region?: string): Promise<Track[]> {
    return YouTubeAdapter.instance.getPopularTracks(region);
  }

  static async getAlbumSongs(albumId: string): Promise<Track[]> {
    return YouTubeAdapter.instance.getAlbumSongs(albumId);
  }

  static async getArtistSongs(artistId: string, page: number = 0): Promise<{ tracks: Track[]; total: number }> {
    return YouTubeAdapter.instance.getArtistSongs(artistId, page);
  }

  static async getPlaylistSongs(playlistId: string): Promise<Track[]> {
    return YouTubeAdapter.instance.getPlaylistSongs(playlistId);
  }

  static async getRecentlyPlayed(): Promise<Track[]> {
    try {
      const stored = await AsyncStorage.getItem(this.recentlyPlayedStorageKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as Track[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to read recently played tracks:', error);
      return [];
    }
  }

  static async addToRecentlyPlayed(track: Track): Promise<void> {
    try {
      const existing = await this.getRecentlyPlayed();
      const deduped = existing.filter((item) => item.id.toString() !== track.id.toString());
      const next = [track, ...deduped].slice(0, this.recentlyPlayedLimit);
      await AsyncStorage.setItem(this.recentlyPlayedStorageKey, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to save recently played track:', error);
    }
  }

  static async clearRecentlyPlayed(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.recentlyPlayedStorageKey);
    } catch (error) {
      console.error('Failed to clear recently played tracks:', error);
    }
  }

  static async getMadeForYou(): Promise<Track[]> {
    return YouTubeAdapter.instance.getMadeForYou();
  }

  static async getSmartScopeQueue(seed: Track): Promise<Track[]> {
    return YouTubeAdapter.instance.getSmartScopeQueue(seed);
  }

  static async resolveTrackById(trackId: string, _preferredProvider?: 'ytmusic'): Promise<Track | null> {
    try {
      const response = await YouTubeAdapter.instance.search({ q: trackId, type: 'track' });
      if (response.tracks.length > 0) {
        const exact = response.tracks.find((t) => t.id.toString() === trackId);
        return exact ?? response.tracks[0];
      }
    } catch {
      /* noop */
    }
    return null;
  }

  static parseArtistAndTitle(rawTitle: string, rawArtist: string): { title: string; artist: string } {
    return parseArtistAndTitle(rawTitle, rawArtist);
  }

  static sanitizeTitle(title: string, artistName?: string): string {
    return sanitizeTitle(title, artistName);
  }

  static sanitizeArtist(artist: string): string {
    return sanitizeArtist(artist);
  }

  static formatDuration(duration: number): string {
    const seconds = Math.floor(duration);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
      return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  static getOptimalImage(images: { small: string; thumbnail: string; large: string }): string {
    return images.large || images.small || images.thumbnail;
  }

  static isHighQuality(track: Track): boolean {
    return track.audioQuality.isHiRes || track.audioQuality.maximumBitDepth >= 24;
  }

  static getQualityBadge(track: Track): string | null {
    if (track.audioQuality.isHiRes) return 'Hi-Res';
    if (track.audioQuality.maximumBitDepth >= 24) return 'HD';
    return null;
  }

  static clearCache(): void {
    /* legacy no-op: stream URLs are resolved JIT via YouTubeAdapter */
  }

  static clearSearchCache(): void {
    /* no-op */
  }

  static clearStreamCache(): void {
    /* no-op */
  }
}
