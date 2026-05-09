import {
  Track,
  SearchResponse,
  SearchParams,
  Album,
  Artist,
  PlaylistSearchItem,
} from '@/types/music';
import { withRetry, parseRetryAfterMs } from '@/src/resilience/retry';
import { takeToken } from '@/src/resilience/rateLimiter';
import { recordHostOutcome, sortHostsByHealth } from '@/src/resilience/healthScore';
import { Logger } from '@/src/utils/logger';

type YtApiSearchItem = {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  authorId?: string;
  lengthSeconds?: number;
  videoThumbnails?: { url: string; quality?: string; width?: number; height?: number }[];
};

type YtApiVideoData = {
  adaptiveFormats?: {
    itag?: number;
    type?: string;
    bitrate?: number;
    url?: string;
  }[];
};

type InvChannelVideoResponse = {
  videos?: YtApiSearchItem[];
  continuation?: string;
};

type InvPlaylistResponse = {
  videos?: YtApiSearchItem[];
  title?: string;
};

const getEnvInstances = (): string[] => {
  const raw = process.env.EXPO_PUBLIC_YT_API_INSTANCES || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

const getDiscoveryUrl = (): string | null => {
  return process.env.EXPO_PUBLIC_YT_API_DISCOVERY || null;
};

const YTMUSIC_EXTRA_API_URL =
  'https://raw.githubusercontent.com/BlackHatDevX/openspot-config/refs/heads/main/ytmusicextraapi.json';

interface YtMusicExtraApiConfig {
  ytmusic_extra_apis: { name: string; url: string }[];
}

/** Invidious-compatible instance pool (existing OpenSpot behavior). Stream chain tier 1. */
export class InvidiousInstanceClient {
  private static readonly CHANNEL_PAGE_SIZE = 10;
  private static channelSessions = new Map<
    string,
    { buffer: Track[]; continuation: string | null }
  >();

  private static readonly STATIC_INSTANCES: string[] = getEnvInstances();

  private static dynamicInstances: string[] | null = null;
  private static extraConfigInstances: string[] | null = null;
  private static extraConfigFetchedAt = 0;
  private static lastWorkingInstance: string | null = null;
  private static instancesFetchedAt = 0;
  private static readonly INSTANCES_TTL_MS = 30 * 60 * 1000;
  private static readonly EXTRA_CONFIG_TTL_MS = 10 * 60 * 1000;

  // ARCHITECT'S FAIL-SAFE: High-availability instances that work when discovery fails.
  private static readonly GOLD_POOL: string[] = [
    'https://invidious.nerdvpn.de',
    'https://invidious.sethforprivacy.com',
    'https://inv.tux.pizza',
    'https://invidious.lunar.icu',
    'https://inv.pistasjis.net',
    'https://invidious.flokinet.to',
    'https://iv.melmac.space'
  ];

  private static async fetchExtraConfigInstances(): Promise<void> {
    const now = Date.now();
    const stale = now - this.extraConfigFetchedAt > this.EXTRA_CONFIG_TTL_MS;

    if (!this.extraConfigInstances || stale) {
      try {
        const res = await this.fetchWithTimeout(YTMUSIC_EXTRA_API_URL, 5000);
        if (res.ok) {
          const config: YtMusicExtraApiConfig = await res.json();
          const extraUrls =
            config.ytmusic_extra_apis?.map(api => api.url?.replace(/\/$/, '')).filter(Boolean) || [];
          if (extraUrls.length > 0) {
            this.extraConfigInstances = extraUrls;
            this.extraConfigFetchedAt = now;
            console.log('[YT API] Loaded extra config instances:', extraUrls);
          } else {
            this.extraConfigInstances = null;
          }
        }
      } catch (e) {
        console.warn('[YT API] Extra config fetch failed', e);
        this.extraConfigInstances = null;
      }
    }
  }

  private static async getInstances(): Promise<string[]> {
    const now = Date.now();
    const stale = now - this.instancesFetchedAt > this.INSTANCES_TTL_MS;

    await this.fetchExtraConfigInstances();

    if (!this.dynamicInstances || stale) {
      const discoveryUrl = getDiscoveryUrl();
      if (discoveryUrl) {
        try {
          const res = await this.fetchWithTimeout(discoveryUrl, 5000);
          if (res.ok) {
            const json: [string, { api: boolean; uri: string; type: string }][] = await res.json();
            const fresh = json
              .filter(([, info]) => info.api && info.type === 'https' && !info.uri.includes('.onion'))
              .map(([, info]) => info.uri.replace(/\/$/, ''))
              .slice(0, 12);
            if (fresh.length > 0) {
              this.dynamicInstances = fresh;
              this.instancesFetchedAt = now;
            }
          }
        } catch (e) {
          console.warn('[YT API] Discovery fetch failed', e);
        }
      }
    }

    const extraConfig = this.extraConfigInstances || [];
    const dynamic = this.dynamicInstances || [];
    const staticInstances = this.STATIC_INSTANCES;
    const goldPool = this.GOLD_POOL;

    const seen = new Set<string>();
    const result: string[] = [];

    // Priority: Last working -> Extra Config -> Gold Pool (Stability) -> Dynamic -> Static
    const allCandidates = [...extraConfig, ...goldPool, ...dynamic, ...staticInstances];
    
    for (const instance of allCandidates) {
      if (!seen.has(instance)) {
        seen.add(instance);
        result.push(instance);
      }
    }

    return result;
  }

  private static async getOrderedInstances(): Promise<string[]> {
    const all = await this.getInstances();
    const sorted = sortHostsByHealth(all);
    if (this.lastWorkingInstance && sorted.includes(this.lastWorkingInstance)) {
      return [this.lastWorkingInstance, ...sorted.filter((i) => i !== this.lastWorkingInstance)];
    }
    return sorted;
  }

  private static async fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
    let hostLabel = 'default';
    try {
      hostLabel = new URL(url).hostname;
    } catch {
      /* noop */
    }
    await takeToken(`invidious:${hostLabel}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async fetchFromAnyInstance<T>(path: string): Promise<T> {
    const instances = await this.getOrderedInstances();
    let lastError: unknown = null;
    for (const instance of instances) {
      const start = Date.now();
      const host = (() => {
        try {
          return new URL(instance).hostname;
        } catch {
          return instance;
        }
      })();
      try {
        const data = await withRetry(
          async () => {
            const res = await this.fetchWithTimeout(`${instance}${path}`);
            if (!res.ok) {
              const retryAfterMs = parseRetryAfterMs(res);
              const err = Object.assign(new Error(`HTTP ${res.status}`), { retryAfterMs });
              throw err;
            }
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              throw new Error('Not a JSON response');
            }
            return (await res.json()) as T;
          },
          { retries: 1, baseMs: 200, maxMs: 1000 }
        );
        this.lastWorkingInstance = instance;
        recordHostOutcome(host, true, Date.now() - start);
        console.log(`[YT API] ${instance} OK in ${Date.now() - start}ms`);
        return data;
      } catch (err) {
        recordHostOutcome(host, false, Date.now() - start);
        Logger.log(`${instance} failed: ${err}`, 'warn', 'Invidious');
        console.debug(`[YT API] ${instance} failed (${Date.now() - start}ms): ${err instanceof Error ? err.message : String(err)}`);
        if (instance === this.lastWorkingInstance) {
          this.lastWorkingInstance = null;
        }
        lastError = err;
      }
    }
    throw new Error(`All instances failed: ${String(lastError)}`);
  }

  private static async fetchWithInstance<T>(path: string): Promise<{ data: T; instance: string }> {
    const instances = await this.getOrderedInstances();
    let lastError: unknown = null;
    for (const instance of instances) {
      const start = Date.now();
      const host = (() => {
        try {
          return new URL(instance).hostname;
        } catch {
          return instance;
        }
      })();
      try {
        const data = await withRetry(
          async () => {
            const res = await this.fetchWithTimeout(`${instance}${path}`);
            if (!res.ok) {
              const retryAfterMs = parseRetryAfterMs(res);
              const err = Object.assign(new Error(`HTTP ${res.status}`), { retryAfterMs });
              throw err;
            }
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              throw new Error('Not a JSON response');
            }
            return (await res.json()) as T;
          },
          { retries: 1, baseMs: 200, maxMs: 1000 }
        );
        this.lastWorkingInstance = instance;
        recordHostOutcome(host, true, Date.now() - start);
        console.log(`[YT API] ${instance} OK in ${Date.now() - start}ms`);
        return { data, instance };
      } catch (err) {
        recordHostOutcome(host, false, Date.now() - start);
        Logger.log(`${instance} failed: ${err}`, 'warn', 'Invidious');
        console.debug(`[YT API] ${instance} failed (${Date.now() - start}ms): ${err instanceof Error ? err.message : String(err)}`);
        if (instance === this.lastWorkingInstance) this.lastWorkingInstance = null;
        lastError = err;
      }
    }
    throw new Error(`All instances failed: ${String(lastError)}`);
  }

  private static getBestThumbnail(item: YtApiSearchItem): string {
    if (item.videoId) return `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
    return item.videoThumbnails?.[0]?.url || '';
  }

  private static toImageSet(url: string) {
    return { small: url, thumbnail: url, large: url, back: null };
  }

  private static emptyAlbumBase(
    id: string,
    name: string,
    thumb: string,
    artistName: string
  ): Album {
    const img = this.toImageSet(thumb);
    return {
      id,
      name,
      description: '',
      year: null,
      type: 'album',
      playCount: null,
      language: '',
      explicitContent: false,
      artists: {
        primary: [
          {
            id: '',
            name: artistName,
            role: '',
            type: 'artist',
            image: [],
            url: '',
          },
        ],
        featured: [],
        all: [],
      },
      songCount: null,
      url: '',
      image: [],
      images: img,
    };
  }

  private static mapChannelToArtist(item: {
    author?: string;
    authorId?: string;
    authorThumbnails?: { url: string }[];
  }): Artist | null {
    const id = item.authorId;
    if (!id) return null;
    const thumb = item.authorThumbnails?.[item.authorThumbnails.length - 1]?.url || '';
    const img = this.toImageSet(thumb || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.author || 'A')}`);
    return {
      id,
      name: item.author || 'Channel',
      url: `https://www.youtube.com/channel/${id}`,
      followerCount: null,
      isVerified: false,
      dominantLanguage: '',
      dominantType: '',
      role: '',
      image: [],
      images: img,
    };
  }

  private static mapPlaylistToPlaylistSearch(item: {
    title?: string;
    playlistId?: string;
    author?: string;
    videoCount?: number;
    playlistThumbnails?: { url: string }[];
  }): PlaylistSearchItem | null {
    const id = item.playlistId;
    if (!id) return null;
    const thumb =
      item.playlistThumbnails?.[item.playlistThumbnails.length - 1]?.url ||
      `https://i.ytimg.com/hqdefault.jpg`;
    const img = this.toImageSet(thumb);
    return {
      id,
      name: item.title || 'Playlist',
      description: '',
      type: 'playlist',
      songCount: item.videoCount ?? null,
      followerCount: null,
      explicitContent: false,
      language: '',
      url: `https://www.youtube.com/playlist?list=${id}`,
      image: [],
      images: img,
    };
  }

  private static mapPlaylistToAlbum(item: {
    title?: string;
    playlistId?: string;
    author?: string;
    videoCount?: number;
    playlistThumbnails?: { url: string }[];
  }): Album | null {
    const pl = this.mapPlaylistToPlaylistSearch(item);
    if (!pl) return null;
    const thumb = pl.images.large;
    return this.emptyAlbumBase(pl.id, pl.name, thumb, item.author || 'Various');
  }

  private static normalizeTrack(item: YtApiSearchItem): Track {
    const thumb = this.getBestThumbnail(item);
    return {
      id: item.videoId || '',
      provider: 'ytmusic',
      title: item.title || 'Unknown title',
      artist: item.author || 'Unknown Artist',
      artistId: 0,
      albumTitle: '',
      albumCover: thumb,
      albumId: '',
      releaseDate: '',
      genre: '',
      duration: (item.lengthSeconds || 0) * 1000,
      audioQuality: { maximumBitDepth: 16, maximumSamplingRate: 44100, isHiRes: false },
      version: null,
      label: '',
      labelId: 0,
      upc: '',
      mediaCount: 1,
      parental_warning: false,
      streamable: true,
      purchasable: false,
      previewable: false,
      genreId: 0,
      genreSlug: '',
      genreColor: '',
      releaseDateStream: '',
      releaseDateDownload: '',
      maximumChannelCount: 2,
      images: this.toImageSet(thumb),
      isrc: '',
    };
  }

  private static pickBestAudioFormat(
    adaptiveFormats: YtApiVideoData['adaptiveFormats'] = [],
    instance: string,
    trackId: string
  ): string {
    const audioFormats = adaptiveFormats
      .filter(f => (f.type || '').startsWith('audio/'))
      .sort((a, b) => {
        const aIsMp4 = (a.type || '').includes('audio/mp4') ? 1 : 0;
        const bIsMp4 = (b.type || '').includes('audio/mp4') ? 1 : 0;
        if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });

    if (!audioFormats.length) throw new Error('No audio formats found');
    const best = audioFormats[0];

    // ARCHITECT'S CHOICE: Direct URL is faster and avoids instance bandwidth limits.
    // However, some instances hide the direct URL or it's IP-bound.
    if (best.url && !best.url.includes('googlevideo.com')) {
       return best.url;
    }

    if (best.itag) {
      const url = `${instance}/latest_version?id=${encodeURIComponent(trackId)}&itag=${best.itag}&local=true`;
      console.log(`[YT API] Using local redirect (itag=${best.itag}) via ${instance}`);
      return url;
    }
    
    if (best.url) return best.url;
    throw new Error('No usable audio URL');
  }

  static async searchDiscover(params: SearchParams): Promise<SearchResponse> {
    const kind = params.type || 'track';
    if (kind === 'track') {
      try {
        const results = await this.fetchFromAnyInstance<YtApiSearchItem[]>(
          `/api/v1/search?q=${encodeURIComponent(params.q)}&type=video&fields=videoId,title,author,lengthSeconds,videoThumbnails`
        );
        const seen = new Set<string>();
        const tracks: Track[] = [];
        for (const item of results) {
          if (!item.videoId || seen.has(item.videoId)) continue;
          seen.add(item.videoId);
          tracks.push(this.normalizeTrack(item));
        }
        return {
          tracks,
          albums: [],
          artists: [],
          playlists: [],
          pagination: { offset: 0, total: tracks.length, hasMore: false },
        };
      } catch (error) {
        console.error('[InvidiousInstanceClient] search error:', error);
        return {
          tracks: [],
          albums: [],
          artists: [],
          playlists: [],
          pagination: { offset: 0, total: 0, hasMore: false },
        };
      }
    }

    const invType = kind === 'artist' ? 'channel' : 'playlist';
    try {
      const results = await this.fetchFromAnyInstance<Record<string, unknown>[]>(
        `/api/v1/search?q=${encodeURIComponent(params.q)}&type=${invType}`
      );
      const artists: Artist[] = [];
      const playlists: PlaylistSearchItem[] = [];
      const albums: Album[] = [];
      const seenA = new Set<string>();
      const seenP = new Set<string>();

      for (const raw of results) {
        const item = raw as {
          type?: string;
          author?: string;
          authorId?: string;
          authorThumbnails?: { url: string }[];
          title?: string;
          playlistId?: string;
          videoCount?: number;
          playlistThumbnails?: { url: string }[];
        };
        if (kind === 'artist' || invType === 'channel') {
          const a = this.mapChannelToArtist(item);
          if (a && !seenA.has(a.id)) {
            seenA.add(a.id);
            artists.push(a);
          }
        }
        if (kind === 'playlist' || invType === 'playlist') {
          const p = this.mapPlaylistToPlaylistSearch(item);
          if (p && !seenP.has(p.id)) {
            seenP.add(p.id);
            playlists.push(p);
          }
        }
        if (kind === 'album') {
          const al = this.mapPlaylistToAlbum(item);
          if (al && !seenP.has(al.id)) {
            seenP.add(al.id);
            albums.push(al);
          }
        }
      }

      return {
        tracks: [],
        albums: kind === 'album' ? albums : [],
        artists: kind === 'artist' ? artists : [],
        playlists: kind === 'playlist' ? playlists : [],
        pagination: { offset: 0, total: artists.length + playlists.length + albums.length, hasMore: false },
      };
    } catch (e) {
      console.warn('[InvidiousInstanceClient] searchDiscover', e);
      return {
        tracks: [],
        albums: [],
        artists: [],
        playlists: [],
        pagination: { offset: 0, total: 0, hasMore: false },
      };
    }
  }

  static async search(params: { q: string; type?: 'track' }): Promise<SearchResponse> {
    return this.searchDiscover({ q: params.q, type: params.type || 'track' });
  }

  static async getStreamUrl(trackId: string): Promise<string> {
    console.log('[InvidiousInstanceClient] getStreamUrl:', { trackId });
    const { data, instance } = await this.fetchWithInstance<YtApiVideoData>(
      `/api/v1/videos/${encodeURIComponent(trackId)}?fields=adaptiveFormats`
    );
    return this.pickBestAudioFormat(data.adaptiveFormats, instance, trackId);
  }

  static async getDownloadUrl(trackId: string): Promise<string> {
    return this.getStreamUrl(trackId);
  }

  static async getPlaylistSongs(playlistId: string): Promise<Track[]> {
    try {
      const data = await this.fetchFromAnyInstance<InvPlaylistResponse>(
        `/api/v1/playlists/${encodeURIComponent(playlistId)}`
      );
      const vids = data.videos || [];
      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const v of vids) {
        if (!v.videoId || seen.has(v.videoId)) continue;
        seen.add(v.videoId);
        tracks.push(this.normalizeTrack(v));
      }
      return tracks;
    } catch {
      return [];
    }
  }

  static async getAlbumSongs(albumId: string): Promise<Track[]> {
    return this.getPlaylistSongs(albumId);
  }

  static async getChannelTracksPage(channelId: string, page: number): Promise<{ tracks: Track[]; total: number }> {
    const PAGE = this.CHANNEL_PAGE_SIZE;
    if (page === 0) {
      this.channelSessions.delete(channelId);
    }
    let session = this.channelSessions.get(channelId);
    if (!session) {
      session = { buffer: [], continuation: null };
      this.channelSessions.set(channelId, session);
    }

    try {
      while (session.buffer.length < (page + 1) * PAGE) {
        const path = session.continuation
          ? `/api/v1/channels/${encodeURIComponent(channelId)}/videos?continuation=${encodeURIComponent(session.continuation)}`
          : `/api/v1/channels/${encodeURIComponent(channelId)}/videos?sort_by=newest`;
        const data = await this.fetchFromAnyInstance<InvChannelVideoResponse>(path);
        const vids = data.videos || [];
        for (const v of vids) {
          if (v.videoId) session.buffer.push(this.normalizeTrack(v));
        }
        session.continuation = data.continuation || null;
        this.channelSessions.set(channelId, session);
        if (!session.continuation) break;
        if (!vids.length) break;
      }
    } catch (e) {
      console.warn('[InvidiousInstanceClient] channel videos', e);
    }

    const start = page * PAGE;
    const slice = session.buffer.slice(start, start + PAGE);
    const total = session.continuation ? Math.max(session.buffer.length + 50, 100) : session.buffer.length;
    return { tracks: slice, total };
  }

  static async getArtistSongs(artistId: string, page: number): Promise<{ tracks: Track[]; total: number }> {
    return this.getChannelTracksPage(artistId, page);
  }

  static async getPopularTracks(region?: string): Promise<Track[]> {
    try {
      const targetRegion = region || 'US';
      const results = await this.fetchFromAnyInstance<YtApiSearchItem[]>(
        `/api/v1/trending?type=music&region=${encodeURIComponent(targetRegion)}`
      );
      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const item of results) {
        if (!item.videoId || seen.has(item.videoId)) continue;
        seen.add(item.videoId);
        tracks.push(this.normalizeTrack(item));
      }
      return tracks;
    } catch {
      return [];
    }
  }

  static async getMadeForYou(): Promise<Track[]> {
    return this.getPopularTracks();
  }
}
