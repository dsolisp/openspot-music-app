import { Track, SearchResponse, SearchParams, Album, Artist, PlaylistSearchItem } from '@/types/music';
import { takeToken } from '@/src/resilience/rateLimiter';
import { recordHostOutcome, sortHostsByHealth } from '@/src/resilience/healthScore';
import { Logger } from '@/src/utils/logger';
import { withRetry, parseRetryAfterMs } from '@/src/resilience/retry';

const DEFAULT_BASES = [
  'https://pipedapi.lunar.icu',
  'https://piped-api.lavender.software',
  'https://pipedapi.rivo.site',
  'https://pipedapi.kavin.rocks',
  'https://api.piped.victr.me',
  'https://pipedapi.us.to',
  'https://piped-api.hostux.net'
];

function getBases(): string[] {
  const raw = process.env.EXPO_PUBLIC_PIPED_INSTANCES || '';
  const fromEnv = raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_BASES;
}

function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { 
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  }).finally(() => clearTimeout(t));
}

function videoIdFromPipedUrl(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

type PipedSearchItem = {
  url?: string;
  title?: string;
  thumbnail?: string;
  uploaderName?: string;
  duration?: number;
};

type PipedStreams = {
  audioStreams?: { url?: string; bitrate?: number; mimeType?: string }[];
};

function channelIdFromPipedUrl(url: string): string | null {
  const m = url.match(/\/channel\/([^/?]+)/);
  return m?.[1] ?? null;
}

function playlistIdFromPipedUrl(url: string): string | null {
  const m = url.match(/[?&]list=([^&]+)/);
  return m?.[1] ?? null;
}

function pipedImages(url: string) {
  return { small: url, thumbnail: url, large: url, back: null as string | null };
}

function emptyAlbumBase(id: string, name: string, thumb: string, artistName: string): Album {
  const img = pipedImages(thumb);
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
      primary: [{ id: '', name: artistName, role: '', type: 'artist', image: [], url: '' }],
      featured: [],
      all: [],
    },
    songCount: null,
    url: '',
    image: [],
    images: img,
  };
}

function normalizeFromPipedItem(item: PipedSearchItem): Track | null {
  const id = item.url ? videoIdFromPipedUrl(item.url) : null;
  if (!id) return null;
  const thumb = item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return {
    id,
    provider: 'ytmusic',
    title: item.title || 'Unknown title',
    artist: item.uploaderName || 'Unknown Artist',
    artistId: 0,
    albumTitle: '',
    albumCover: thumb,
    albumId: '',
    releaseDate: '',
    genre: '',
    duration: (item.duration || 0) * 1000,
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
    images: { small: thumb, thumbnail: thumb, large: thumb, back: null },
    isrc: '',
  };
}

async function fetchJsonFromAnyBase<T>(path: string): Promise<T> {
  let last: unknown = null;
  const bases = getBases();
  const ordered = sortHostsByHealth(bases);
  for (const base of ordered) {
    const start = Date.now();
    let hostLabel = 'piped';
    try {
      hostLabel = new URL(base).hostname;
    } catch {
      /* noop */
    }
    try {
      await takeToken(`piped:${hostLabel}`);
      const data = await withRetry(
        async () => {
          const res = await fetchWithTimeout(`${base}${path}`, 12000); // Increased timeout
          if (!res.ok) {
            const retryAfterMs = parseRetryAfterMs(res);
            const err = Object.assign(new Error(`HTTP ${res.status}`), { 
              retryAfterMs, 
              status: res.status 
            });
            // If we're blocked (403) or rate limited (429), don't bother retrying this specific host
            if (res.status === 403 || res.status === 429) {
              (err as any).noRetry = true;
            }
            throw err;
          }
          return (await res.json()) as T;
        },
        { 
          retries: 1, // Reduced retries
          baseMs: 300, 
          maxMs: 3000,
          shouldRetry: (err: any) => !err.noRetry
        }
      );
      recordHostOutcome(hostLabel, true, Date.now() - start);
      return data;
    } catch (e) {
      recordHostOutcome(hostLabel, false, Date.now() - start);
      last = e;
      Logger.log(`${base} failed: ${e}`, 'warn', 'Piped');
      console.warn(`[Piped] ${base} failed: ${e}. Rotating to next instance...`);
    }
  }
  throw last ?? new Error('Piped: all instances failed');
}

/** Piped API tier — search + streams. */
export class PipedClient {
  private static readonly CHANNEL_PAGE = 10;

  static async searchDiscover(params: SearchParams): Promise<SearchResponse> {
    const kind = params.type || 'track';
    const encoded = encodeURIComponent(params.q);
    try {
      if (kind === 'track') {
        return this.search(params.q);
      }
      const filter = kind === 'artist' ? 'channels' : 'playlists';
      const data = await fetchJsonFromAnyBase<{ items?: Record<string, unknown>[] }>(
        `/search?q=${encoded}&filter=${filter}`
      );
      const items = data.items || [];
      const artists: Artist[] = [];
      const playlists: PlaylistSearchItem[] = [];
      const albums: Album[] = [];
      const seen = new Set<string>();

      for (const raw of items) {
        const item = raw as {
          url?: string;
          name?: string;
          thumbnail?: string;
          videos?: number;
          subscribers?: number;
        };
        if (kind === 'artist') {
          const cid = item.url ? channelIdFromPipedUrl(item.url) : null;
          if (!cid || seen.has(cid)) continue;
          seen.add(cid);
          const thumb = item.thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'A')}`;
          const img = pipedImages(thumb);
          artists.push({
            id: cid,
            name: item.name || 'Channel',
            url: item.url || `https://www.youtube.com/channel/${cid}`,
            followerCount: item.subscribers ?? null,
            isVerified: false,
            dominantLanguage: '',
            dominantType: '',
            role: '',
            image: [],
            images: img,
          });
        } else if (kind === 'playlist') {
          const pid = item.url ? playlistIdFromPipedUrl(item.url) : null;
          if (!pid || seen.has(pid)) continue;
          seen.add(pid);
          const thumb = item.thumbnail || '';
          const img = pipedImages(thumb);
          playlists.push({
            id: pid,
            name: item.name || 'Playlist',
            description: '',
            type: 'playlist',
            songCount: item.videos ?? null,
            followerCount: null,
            explicitContent: false,
            language: '',
            url: item.url || `https://www.youtube.com/playlist?list=${pid}`,
            image: [],
            images: img,
          });
        } else if (kind === 'album') {
          const pid = item.url ? playlistIdFromPipedUrl(item.url) : null;
          if (!pid || seen.has(pid)) continue;
          seen.add(pid);
          const thumb = item.thumbnail || '';
          albums.push(emptyAlbumBase(pid, item.name || 'Album', thumb, 'Various'));
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
      console.warn('[PipedClient] searchDiscover', e);
      return {
        tracks: [],
        albums: [],
        artists: [],
        playlists: [],
        pagination: { offset: 0, total: 0, hasMore: false },
      };
    }
  }

  static async getTrendingTracks(region?: string): Promise<Track[]> {
    try {
      const targetRegion = region || 'US';
      const data = await fetchJsonFromAnyBase<PipedSearchItem[] | { items?: PipedSearchItem[] }>(
        `/trending?region=${encodeURIComponent(targetRegion)}`
      );
      const items = Array.isArray(data) ? data : data.items || [];
      const seen = new Set<string>();
      const tracks: Track[] = [];
      for (const item of items) {
        const t = normalizeFromPipedItem(item);
        if (!t || seen.has(String(t.id))) continue;
        seen.add(String(t.id));
        tracks.push(t);
      }
      return tracks;
    } catch {
      return [];
    }
  }

  static async getPlaylistSongs(playlistId: string): Promise<Track[]> {
    try {
      const data = await fetchJsonFromAnyBase<{ relatedStreams?: PipedSearchItem[] }>(
        `/playlists/${encodeURIComponent(playlistId)}`
      );
      const streams = data.relatedStreams || [];
      const seen = new Set<string>();
      const tracks: Track[] = [];
      for (const item of streams) {
        const t = normalizeFromPipedItem(item);
        if (!t || seen.has(String(t.id))) continue;
        seen.add(String(t.id));
        tracks.push(t);
      }
      return tracks;
    } catch {
      return [];
    }
  }

  static async getAlbumSongs(albumId: string): Promise<Track[]> {
    return this.getPlaylistSongs(albumId);
  }

  static async getArtistSongs(artistId: string, page: number): Promise<{ tracks: Track[]; total: number }> {
    const PAGE = this.CHANNEL_PAGE;
    try {
      const data = await fetchJsonFromAnyBase<{ tabs?: { tab?: string; content?: PipedSearchItem[] }[] }>(
        `/channel/${encodeURIComponent(artistId)}`
      );
      const tab =
        data.tabs?.find((t) => (t.tab || '').toLowerCase().includes('video')) || data.tabs?.[0];
      const all = tab?.content || [];
      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const item of all) {
        const t = normalizeFromPipedItem(item);
        if (!t || seen.has(String(t.id))) continue;
        seen.add(String(t.id));
        tracks.push(t);
      }
      const start = page * PAGE;
      const slice = tracks.slice(start, start + PAGE);
      return { tracks: slice, total: tracks.length };
    } catch {
      return { tracks: [], total: 0 };
    }
  }

  static async searchRaw(q: string): Promise<PipedSearchItem[]> {
    const encoded = encodeURIComponent(q);
    const data = await fetchJsonFromAnyBase<{ items?: PipedSearchItem[] }>(
      `/search?q=${encoded}&filter=videos`
    );
    return data.items || [];
  }

  static async search(query: string): Promise<SearchResponse> {
    try {
      const items = await this.searchRaw(query);
      const seen = new Set<string>();
      const tracks: Track[] = [];
      for (const item of items) {
        const t = normalizeFromPipedItem(item);
        if (!t || seen.has(String(t.id))) continue;
        seen.add(String(t.id));
        tracks.push(t);
      }
      return {
        tracks,
        albums: [],
        artists: [],
        playlists: [],
        pagination: { offset: 0, total: tracks.length, hasMore: false },
      };
    } catch (e) {
      console.error('[PipedClient] search error', e);
      return {
        tracks: [],
        albums: [],
        artists: [],
        playlists: [],
        pagination: { offset: 0, total: 0, hasMore: false },
      };
    }
  }

  static async getStreamUrl(videoId: string): Promise<string> {
    const data = await fetchJsonFromAnyBase<PipedStreams>(`/streams/${encodeURIComponent(videoId)}`);
    const streams = [...(data.audioStreams || [])].sort(
      (a, b) => (b.bitrate || 0) - (a.bitrate || 0)
    );
    const url = streams[0]?.url;
    if (!url) throw new Error('Piped: no audio stream');
    return url;
  }
}
