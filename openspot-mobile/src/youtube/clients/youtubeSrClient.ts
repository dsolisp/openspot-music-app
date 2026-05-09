import YouTube from 'youtube-sr';
import type { Video, Channel, Playlist } from 'youtube-sr';
import type {
  SearchParams,
  SearchResponse,
  Track,
  Album,
  Artist,
  PlaylistSearchItem,
} from '@/types/music';

function emptySearch(): SearchResponse {
  return {
    tracks: [],
    albums: [],
    artists: [],
    playlists: [],
    pagination: { offset: 0, total: 0, hasMore: false },
  };
}

/**
 * Third-tier discovery via youtube-sr (scraped YouTube HTML) — independent from Invidious/Piped HTTP.
 */
export class YoutubeSrClient {
  static async searchDiscover(params: SearchParams): Promise<SearchResponse> {
    const kind = params.type || 'track';
    try {
      if (kind === 'track') {
        const videos = (await YouTube.search(params.q, { limit: 20, type: 'video' })) as Video[];
        const tracks: Track[] = [];
        const seen = new Set<string>();
        for (const v of videos) {
          const t = fromVideo(v);
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
      }

      if (kind === 'artist') {
        const channels = (await YouTube.search(params.q, { limit: 15, type: 'channel' })) as Channel[];
        const artists: Artist[] = [];
        const seen = new Set<string>();
        for (const ch of channels) {
          const a = this.channelToArtist(ch);
          if (!a || seen.has(a.id)) continue;
          seen.add(a.id);
          artists.push(a);
        }
        return {
          tracks: [],
          albums: [],
          artists,
          playlists: [],
          pagination: { offset: 0, total: artists.length, hasMore: false },
        };
      }

      const playlistsIn = (await YouTube.search(params.q, { limit: 15, type: 'playlist' })) as Playlist[];
      const plist: PlaylistSearchItem[] = [];
      const albums: Album[] = [];
      const seen = new Set<string>();
      for (const p of playlistsIn) {
        const base = this.playlistToSearchItem(p);
        if (!base || seen.has(base.id)) continue;
        seen.add(base.id);
        if (kind === 'playlist') {
          plist.push(base);
        } else if (kind === 'album') {
          const thumb = base.images.large;
          albums.push({
            id: base.id,
            name: base.name,
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
                  name: p.channel?.name || 'Various',
                  role: '',
                  type: 'artist',
                  image: [],
                  url: '',
                },
              ],
              featured: [],
              all: [],
            },
            songCount: base.songCount,
            url: base.url,
            image: [],
            images: imgSet(thumb),
          });
        }
      }

      console.log(`[YoutubeSrClient] Found ${kind === 'album' ? albums.length : plist.length} results for: ${params.q}`);
      return {
        tracks: [],
        albums: kind === 'album' ? albums : [],
        artists: [],
        playlists: kind === 'playlist' ? plist : [],
        pagination: {
          offset: 0,
          total: kind === 'album' ? albums.length : plist.length,
          hasMore: false,
        },
      };
    } catch (e) {
      console.warn('[YoutubeSrClient] searchDiscover', e);
      return emptySearch();
    }
  }

  static async getTrendingTracks(): Promise<Track[]> {
    try {
      const videos = await YouTube.trending({ type: 'MUSIC' });
      const out: Track[] = [];
      const seen = new Set<string>();
      for (const v of videos) {
        const t = fromVideo(v);
        if (!t || seen.has(String(t.id))) continue;
        seen.add(String(t.id));
        out.push(t);
      }
      return out;
    } catch (e) {
      console.warn('[YoutubeSrClient] trending', e);
      return [];
    }
  }

  static async getPlaylistSongs(playlistId: string): Promise<Track[]> {
    try {
      const pl = await YouTube.getPlaylist(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`, {
        limit: 100,
      });
      const out: Track[] = [];
      const seen = new Set<string>();
      for (const v of pl.videos) {
        const t = fromVideo(v);
        if (!t || seen.has(String(t.id))) continue;
        seen.add(String(t.id));
        out.push(t);
      }
      return out;
    } catch (e) {
      console.warn('[YoutubeSrClient] playlist', e);
      return [];
    }
  }

  private static channelToArtist(ch: Channel): Artist | null {
    const id = ch.id;
    if (!id) return null;
    const thumb =
      ch.iconURL?.({ size: 64 }) || `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.name || 'A')}`;
    const img = imgSet(thumb);
    return {
      id,
      name: ch.name || 'Channel',
      url: ch.url || `https://www.youtube.com/channel/${id}`,
      followerCount: null,
      isVerified: !!ch.verified,
      dominantLanguage: '',
      dominantType: '',
      role: '',
      image: [],
      images: img,
    };
  }

  private static playlistToSearchItem(p: Playlist): PlaylistSearchItem | null {
    const id = p.id;
    if (!id) return null;
    const thumb = p.thumbnail?.displayThumbnailURL?.('hqdefault') || '';
    const img = imgSet(thumb);
    return {
      id,
      name: p.title || 'Playlist',
      description: '',
      type: 'playlist',
      songCount: p.videoCount ?? null,
      followerCount: null,
      explicitContent: false,
      language: '',
      url: p.url || `https://www.youtube.com/playlist?list=${id}`,
      image: [],
      images: img,
    };
  }
}

function imgSet(url: string) {
  return { small: url, thumbnail: url, large: url, back: null as string | null };
}

function fromVideo(v: Video): Track | null {
  const id = v.id;
  if (!id) return null;
  const thumb =
    v.thumbnail?.displayThumbnailURL?.('hqdefault') || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return {
    id,
    provider: 'ytmusic',
    title: v.title || 'Unknown',
    artist: v.channel?.name || 'Unknown Artist',
    artistId: 0,
    albumTitle: '',
    albumCover: thumb,
    albumId: '',
    releaseDate: '',
    genre: '',
    duration: (v.duration || 0) * 1000,
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
    images: imgSet(thumb),
    isrc: '',
  };
}
