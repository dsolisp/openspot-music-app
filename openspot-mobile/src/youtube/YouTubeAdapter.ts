import type { SearchParams, SearchResponse, Track } from '@/types/music';
import { InvidiousInstanceClient } from '@/src/youtube/clients/invidiousInstanceClient';
import { PipedClient } from '@/src/youtube/clients/pipedClient';
import { YoutubeSrClient } from '@/src/youtube/clients/youtubeSrClient';
import { ItunesClient } from '@/src/youtube/clients/itunesClient';
import { tryYtdlpStream } from '@/src/youtube/clients/ytdlpStub';
import {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
} from '@/src/resilience/circuitBreaker';
import { dedupeAsync } from '@/src/resilience/dedupe';
import { AllProvidersFailedError, type StreamResult } from '@/src/youtube/types';
import { AiMetadataService } from '../services/AiMetadataService';
import { sanitizeTitle, parseArtistAndTitle } from '../utils/metadata';
import { Logger } from '../utils/logger';

import { getAllLikesOrderedNewestFirst } from '@/src/storage/likesRepo';

function discoverHasResults(r: SearchResponse): boolean {
  return (
    r.tracks.length > 0 ||
    r.albums.length > 0 ||
    r.artists.length > 0 ||
    r.playlists.length > 0
  );
}

/**
 * Single façade: operation-specific cascades, automatic failover, no user-facing tier choice.
 * Config-free defaults: Invidious pool → Piped → youtube-sr for discovery; no API keys required.
 */
export class YouTubeAdapter {
  private static _instance: YouTubeAdapter | null = null;

  static get instance(): YouTubeAdapter {
    if (!this._instance) this._instance = new YouTubeAdapter();
    return this._instance;
  }

  /** Resolve playable URL for TrackPlayer / downloads. */
  async getAudioStream(videoId: string): Promise<StreamResult> {
    return dedupeAsync(`stream:${videoId}`, () => this.getAudioStreamUncached(videoId));
  }

  async getAudioStreamUrl(videoId: string): Promise<string> {
    const r = await this.getAudioStream(videoId);
    return r.audioUrl;
  }

  private async getAudioStreamUncached(idOrVideoId: string): Promise<StreamResult> {
    let videoId = idOrVideoId;

    // If it's not a standard 11-char YouTube ID, it's likely a metadata ID (iTunes)
    // and we need to resolve it to a YouTube video first.
    if (!/^[a-zA-Z0-9_-]{11}$/.test(idOrVideoId)) {
      Logger.log(`Resolving metadata ID to YouTube: ${idOrVideoId}`, 'info', 'YouTubeAdapter');
      const resolvedId = await this.resolveVideoId(idOrVideoId);
      if (!resolvedId) {
        throw new Error(`Could not resolve audio for metadata ID: ${idOrVideoId}`);
      }
      videoId = resolvedId;
    }

    const tiers: {
      name: 'invidious' | 'piped' | 'ytdlp';
      run: () => Promise<string | null>;
    }[] = [
      {
        name: 'piped',
        run: async () => {
          try {
            return await PipedClient.getStreamUrl(videoId);
          } catch {
            throw new Error('piped failed');
          }
        },
      },
      {
        name: 'invidious',
        run: async () => {
          try {
            return await InvidiousInstanceClient.getStreamUrl(videoId);
          } catch {
            throw new Error('invidious failed');
          }
        },
      },
    ];

    if (process.env.EXPO_PUBLIC_YTDLP_ENABLED === '1') {
      tiers.push({
        name: 'ytdlp',
        run: () => tryYtdlpStream(videoId),
      });
    }

    let lastErr: unknown = null;
    for (const tier of tiers) {
      if (isCircuitOpen(tier.name)) continue;
      try {
        const audioUrl = await tier.run();
        if (audioUrl) {
          recordSuccess(tier.name);
          Logger.log(`Resolved stream: ${audioUrl} via ${tier.name}`, 'info', 'YouTubeAdapter');
          return { audioUrl, providerTier: tier.name };
        }
        recordFailure(tier.name);
      } catch (e) {
        Logger.log(`Tier ${tier.name} failed: ${e}`, 'warn', 'YouTubeAdapter');
        lastErr = e;
        recordFailure(tier.name);
      }
    }
    Logger.log(`All streaming providers failed for ${videoId}`, 'error', 'YouTubeAdapter');
    throw new AllProvidersFailedError(videoId, lastErr);
  }

  /**
   * Search / discovery: iTunes (Stable Meta) → Invidious → Piped → youtube-sr.
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    const kind = params.type || 'track';
    
    // Tier 1: iTunes (Metadata First) with Cleaned Query
    const cleanQuery = sanitizeTitle(params.q);
    try {
      const itunesResults = await ItunesClient.search(cleanQuery, kind as any);
      if (discoverHasResults(itunesResults)) {
        Logger.log(`Found results via iTunes for: ${cleanQuery}`, 'info', 'YouTubeAdapter');
        return itunesResults;
      }
    } catch (e) {
      Logger.log(`iTunes search failed: ${e}`, 'warn', 'YouTubeAdapter');
    }

    // Tier 2: YouTube Fallback with Correction
    let youtubeResults: SearchResponse;
    if (!isCircuitOpen('invidious')) {
      try {
        youtubeResults = await InvidiousInstanceClient.searchDiscover(params);
      } catch (e) {
        recordFailure('invidious');
        youtubeResults = await PipedClient.searchDiscover(params);
      }
    } else {
      youtubeResults = await PipedClient.searchDiscover(params);
    }

    if (kind === 'track' && youtubeResults.tracks.length > 0) {
      const topFive = youtubeResults.tracks.slice(0, 5);
      const corrected = await Promise.all(
        topFive.map(async (t) => {
          // Instantly fix "Artist - Title" formats locally (zero latency)
          const parsed = parseArtistAndTitle(t.title, t.artist);
          t.title = parsed.title;
          t.artist = parsed.artist;

          // If artist still looks like a YouTube channel, try iTunes verification
          if (AiMetadataService.needsAiRecovery(t.title, t.artist)) {
            try {
              const verification = await ItunesClient.search(`${t.artist} ${t.title}`, 'track', 1);
              if (verification.tracks.length > 0) {
                const official = verification.tracks[0];
                return {
                  ...t,
                  title: official.title,
                  artist: official.artist,
                  images: official.images,
                  album: official.album,
                };
              }
            } catch { /* fallback */ }

            // ULTIMATE FALLBACK: GLM-4-Flash AI
            const aiRecovered = await AiMetadataService.recoverMetadata(t.title, t.artist);
            if (aiRecovered) {
              return {
                ...t,
                title: aiRecovered.title,
                artist: aiRecovered.artist,
              };
            }
          }
          return t;
        })
      );
      youtubeResults.tracks = [...corrected, ...youtubeResults.tracks.slice(5)];
    }

    return youtubeResults;
  }

  async getPopularTracks(region?: string): Promise<Track[]> {
    // Tier 1: Costa Rica Trending (Official & Local)
    try {
      // If no region provided, or if specifically US, try the CR hits if that's the branding target
      const crTracks = await ItunesClient.getCostaRicaTrending();
      if (crTracks.length > 0 && (!region || region === 'CR')) {
        Logger.log(`Fetched ${crTracks.length} Costa Rica hits via iTunes.`, 'info', 'YouTubeAdapter');
        return crTracks;
      }
    } catch (e) {
      Logger.log(`iTunes CR Trending failed: ${e}`, 'warn', 'YouTubeAdapter');
    }

    if (!isCircuitOpen('invidious')) {
      try {
        const t = await InvidiousInstanceClient.getPopularTracks(region);
        if (t.length > 0) { recordSuccess('invidious'); return t; }
      } catch { recordFailure('invidious'); }
    }
    if (!isCircuitOpen('piped')) {
      try {
        const t = await PipedClient.getTrendingTracks(region);
        if (t.length > 0) { recordSuccess('piped'); return t; }
      } catch { recordFailure('piped'); }
    }
    return YoutubeSrClient.getTrendingTracks();
  }

  async getMadeForYou(): Promise<Track[]> {
    try {
      const likes = await getAllLikesOrderedNewestFirst();
      const crTrending = await ItunesClient.getCostaRicaTrending();
      
      const artists = new Set<string>();
      for (const like of likes) {
        if (like.artist && !['Unknown Artist', 'Unknown'].includes(like.artist)) {
          artists.add(like.artist);
        }
      }
      
      const artistList = Array.from(artists);
      if (artistList.length === 0) {
        return crTrending.length > 0 ? crTrending : this.getPopularTracks();
      }
      
      // Take up to 5 most recent artists for relevance
      const selectedArtists = artistList.slice(0, 5);
      
      const results = await Promise.allSettled(
        selectedArtists.map(artist => this.search({ q: artist, type: 'track' }))
      );
      const personalPool: Track[] = [];
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value.tracks) {
          personalPool.push(...r.value.tracks.slice(0, 10));
        }
      });

      // --- HYBRID MIXING LOGIC ---
      const finalMix: Track[] = [];
      const seenIds = new Set<string>();
      
      let pIdx = 0;
      let tIdx = 0;
      
      while (finalMix.length < 50 && (pIdx < personalPool.length || tIdx < crTrending.length)) {
        // Add up to 2 personal tracks
        for (let i = 0; i < 2 && pIdx < personalPool.length; i++) {
          const t = personalPool[pIdx++];
          if (!seenIds.has(t.id.toString())) {
            seenIds.add(t.id.toString());
            finalMix.push(t);
          }
        }
        // Add 1 trending track for discovery
        if (tIdx < crTrending.length) {
          const t = crTrending[tIdx++];
          if (!seenIds.has(t.id.toString())) {
            seenIds.add(t.id.toString());
            finalMix.push(t);
          }
        }
      }

      return finalMix;
    } catch (error) {
      console.warn('[YouTubeAdapter] getMadeForYou failed:', error);
      return this.getPopularTracks();
    }
  }

  async getAlbumSongs(albumId: string): Promise<Track[]> {
    // If it's a numeric ID, it's likely an iTunes ID
    if (/^\d+$/.test(albumId)) {
      try {
        const tracks = await ItunesClient.getAlbumTracks(parseInt(albumId, 10));
        if (tracks.length > 0) {
          console.log(`[YouTubeAdapter] Resolved ${tracks.length} tracks via iTunes for album: ${albumId}`);
          return tracks;
        }
      } catch (e) {
        console.warn(`[YouTubeAdapter] iTunes getAlbumTracks failed for ${albumId}: ${e}`);
      }
    }

    if (!isCircuitOpen('invidious')) {
      try {
        const tracks = await InvidiousInstanceClient.getAlbumSongs(albumId);
        if (tracks.length > 0) { recordSuccess('invidious'); return tracks; }
      } catch { recordFailure('invidious'); }
    }
    if (!isCircuitOpen('piped')) {
      try {
        const tracks = await PipedClient.getAlbumSongs(albumId);
        if (tracks.length > 0) { recordSuccess('piped'); return tracks; }
      } catch { recordFailure('piped'); }
    }
    return YoutubeSrClient.getPlaylistSongs(albumId);
  }

  async getPlaylistSongs(playlistId: string): Promise<Track[]> {
    return this.getAlbumSongs(playlistId);
  }

  async getArtistSongs(artistId: string, page: number): Promise<{ tracks: Track[]; total: number }> {
    // If it's a numeric ID, it's an iTunes Artist ID
    if (/^\d+$/.test(artistId)) {
      try {
        const tracks = await ItunesClient.getArtistTopSongs(artistId);
        if (tracks.length > 0) {
          console.log(`[YouTubeAdapter] Resolved ${tracks.length} artist tracks via iTunes for artist: ${artistId}`);
          return { tracks, total: tracks.length };
        }
      } catch (e) {
        console.warn(`[YouTubeAdapter] iTunes getArtistTopSongs failed for ${artistId}: ${e}`);
      }
    }

    if (!isCircuitOpen('invidious')) {
      try {
        const r = await InvidiousInstanceClient.getArtistSongs(artistId, page);
        if (r.tracks.length > 0) { recordSuccess('invidious'); return r; }
      } catch { recordFailure('invidious'); }
    }
    if (!isCircuitOpen('piped')) {
      try {
        const r = await PipedClient.getArtistSongs(artistId, page);
        if (r.tracks.length > 0) { recordSuccess('piped'); return r; }
      } catch { recordFailure('piped'); }
    }
    return { tracks: [], total: 0 };
  }

  /**
   * Helper to resolve a non-YouTube ID or a search query to a specific YouTube Video ID.
   */
  private async resolveVideoId(queryOrId: string): Promise<string | null> {
    try {
      let searchQuery = queryOrId;
      
      // Parse Smart ID format: itunes:id:Artist - Title
      if (queryOrId.startsWith('itunes:')) {
        const parts = queryOrId.split(':');
        if (parts.length >= 3) {
          searchQuery = parts.slice(2).join(':'); // Extract "Artist - Title"
        }
      }

      // We use YoutubeSr for the fastest, most direct resolution
      const response = await YoutubeSrClient.searchDiscover({ q: searchQuery, type: 'track' });
      if (response.tracks.length > 0) {
        const topResult = response.tracks[0];
        console.log(`[YouTubeAdapter] Resolved ${queryOrId} -> ${topResult.id} (${topResult.title})`);
        return topResult.id.toString();
      }
    } catch (e) {
      console.warn(`[YouTubeAdapter] Resolution failed for ${queryOrId}: ${e}`);
    }
    return null;
  }

  async getSmartScopeQueue(seed: Track): Promise<Track[]> {
    try {
      console.log(`[YouTubeAdapter] Generating Smart Scope for: ${seed.artist} - ${seed.title}`);
      
      const recommendations = await ItunesClient.getRecommendationsForTrack(seed);
      
      if (recommendations.length > 0) {
        // Interleave with some artist top songs for a better mix
        let artistTop: Track[] = [];
        if (seed.artistId) {
          artistTop = await ItunesClient.getArtistTopSongs(seed.artistId.toString());
        }
        
        const combined = [...artistTop.slice(0, 5), ...recommendations];
        // Shuffle the result
        return combined.sort(() => Math.random() - 0.5).slice(0, 40);
      }
    } catch (e) {
      console.warn(`[YouTubeAdapter] Smart Scope failed: ${e}`);
    }
    
    return this.getPopularTracks();
  }
}
