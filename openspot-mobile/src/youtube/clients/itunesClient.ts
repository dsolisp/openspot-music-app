import { Album, SearchResponse, Track, Artist, PlaylistSearchItem } from '@/types/music';

/**
 * iTunes Search API client for high-quality metadata discovery.
 * Used as a stable tier 1 for Albums and Artists.
 */
export class ItunesClient {
  private static BASE_URL = 'https://itunes.apple.com/search';

  static async search(query: string, type: 'album' | 'artist' | 'track'): Promise<SearchResponse> {
    const entity = type === 'album' ? 'album' : type === 'artist' ? 'musicArtist' : 'musicTrack';
    // Increase limit to 50 for better filtering
    const url = `${this.BASE_URL}?term=${encodeURIComponent(query)}&entity=${entity}&limit=50&media=music`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`iTunes API error: ${response.status}`);
      const data = await response.json();
      const results = data.results || [];

      if (type === 'album') {
        const lowerQuery = query.toLowerCase();
        
        // --- PASS 1: Try to find the Official Artist ID first ---
        let officialDiscography: any[] = [];
        try {
          const artistSearchUrl = `${this.BASE_URL}?term=${encodeURIComponent(query)}&entity=musicArtist&limit=1&media=music`;
          const artistRes = await fetch(artistSearchUrl);
          const artistData = await artistRes.json();
          const bestArtist = artistData.results?.[0];
          
          if (bestArtist && bestArtist.artistName.toLowerCase() === lowerQuery) {
            // --- PASS 2: Targeted Discography Lookup ---
            console.log(`[ItunesClient] Found official artist ID ${bestArtist.artistId} for "${query}". Fetching full discography...`);
            const lookupUrl = `https://itunes.apple.com/lookup?id=${bestArtist.artistId}&entity=album&limit=200&media=music`;
            const lookupRes = await fetch(lookupUrl);
            const lookupData = await lookupRes.json();
            // Filter out the artist object itself (wrapperType: artist)
            officialDiscography = lookupData.results.filter((item: any) => item.wrapperType === 'collection');
          }
        } catch (e) {
          console.warn('[ItunesClient] Artist-based discography lookup failed:', e);
        }

        // Merge results: Official discography first, then general keyword matches
        const allRawResults = [...officialDiscography, ...results];
        
        // SMART RELEVANCE & DEDUPLICATION
        const seenNames = new Set<string>();
        const processedAlbums = allRawResults
          .map((item: any) => this.mapToAlbum(item))
          .filter(album => {
            // Simple deduplication by name (ignore case/deluxe)
            const baseName = album.name.toLowerCase().split('(')[0].split('[')[0].trim();
            if (seenNames.has(baseName)) return false;
            seenNames.add(baseName);
            return true;
          })
          .sort((a, b) => {
            const getScore = (album: Album) => {
              let score = 0;
              const artist = album.artists.primary[0]?.name.toLowerCase() || '';
              
              if (artist === lowerQuery) score += 1000;
              else if (artist.startsWith(lowerQuery)) score += 500;
              else if (new RegExp(`\\b${lowerQuery}\\b`).test(artist)) score += 250;
              
              if ((album.songCount || 0) >= 5) score += 100;
              if (album.year) score += (album.year - 1900) / 10;
              
              return score;
            };

            return getScore(b) - getScore(a);
          });

        return {
          tracks: [],
          albums: processedAlbums.slice(0, 40), // Return more results for discography
          artists: [],
          playlists: [],
          pagination: { offset: 0, total: processedAlbums.length, hasMore: false },
        };
      }

      if (type === 'artist') {
        return {
          tracks: [],
          albums: [],
          artists: results.map((item: any) => this.mapToArtist(item)),
          playlists: [],
          pagination: { offset: 0, total: results.length, hasMore: false },
        };
      }

      // Default to tracks
      return {
        tracks: results.map((item: any) => this.mapToTrack(item)),
        albums: [],
        artists: [],
        playlists: [],
        pagination: { offset: 0, total: results.length, hasMore: false },
      };
    } catch (error) {
      console.warn('[ItunesClient] search error:', error);
      return {
        tracks: [],
        albums: [],
        artists: [],
        playlists: [],
        pagination: { offset: 0, total: 0, hasMore: false },
      };
    }
  }

  static async getRecommendationsForTrack(seed: Track): Promise<Track[]> {
    try {
      const genre = seed.genre || '';
      const year = seed.releaseDate ? new Date(seed.releaseDate).getFullYear() : null;
      
      // If we don't have enough meta, fallback to artist top songs
      if (!genre || !year) {
        return seed.artistId ? this.getArtistTopSongs(seed.artistId.toString()) : [];
      }

      const eraStart = year - 3;
      const eraEnd = year + 3;
      
      // iTunes doesn't have a perfect "related" API, so we use a targeted search
      // "Rock 1994" for example
      const query = `${genre} ${year}`;
      const url = `${this.BASE_URL}?term=${encodeURIComponent(query)}&entity=musicTrack&limit=40&media=music`;
      
      const response = await fetch(url);
      const data = await response.json();
      const results = (data.results || []).map((item: any) => this.mapToTrack(item));

      // Post-filter to strictly stay within +- 3 years
      return results.filter((t: Track) => {
        const tYear = t.releaseDate ? new Date(t.releaseDate).getFullYear() : null;
        if (!tYear) return false;
        return tYear >= eraStart && tYear <= eraEnd && t.id.toString() !== seed.id.toString();
      });
    } catch (error) {
      console.warn('[ItunesClient] getRecommendationsForTrack error:', error);
      return [];
    }
  }

  static async getArtistTopSongs(artistId: string): Promise<Track[]> {
    const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=50`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`iTunes API error: ${response.status}`);
      const data = await response.json();
      // First item is artist, rest are tracks
      const tracks = data.results.filter((item: any) => item.wrapperType === 'track');
      return tracks.map((item: any) => this.mapToTrack(item));
    } catch (error) {
      console.warn('[ItunesClient] getArtistTopSongs error:', error);
      return [];
    }
  }

  static async getCostaRicaTrending(): Promise<Track[]> {
    const url = 'https://itunes.apple.com/cr/rss/topsongs/limit=50/json';
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`iTunes RSS error: ${response.status}`);
      const data = await response.json();
      const entries = data.feed?.entry || [];
      
      return entries.map((entry: any) => {
        const id = entry.id?.attributes?.['im:id'] || '';
        const title = entry['im:name']?.label || 'Unknown';
        const artist = entry['im:artist']?.label || 'Unknown Artist';
        const thumb = entry['im:image']?.[2]?.label || ''; // Large thumbnail
        
        const smartId = `itunes:${id}:${artist} - ${title}`;
        
        return {
          id: smartId,
          provider: 'ytmusic',
          title: title,
          artist: artist,
          artistId: 0,
          albumTitle: entry['im:collection']?.['im:name']?.label || '',
          albumCover: thumb,
          albumId: '',
          releaseDate: '',
          genre: '',
          duration: 0,
          audioQuality: { maximumBitDepth: 16, maximumSamplingRate: 44100, isHiRes: false },
          version: null,
          label: '',
          labelId: 0,
          upc: '',
          mediaCount: 1,
          parental_warning: false,
          streamable: true,
          purchasable: false,
          previewable: true,
          genreId: 0,
          genreSlug: '',
          genreColor: '',
          releaseDateStream: '',
          releaseDateDownload: '',
          maximumChannelCount: 2,
          images: {
            small: thumb,
            thumbnail: thumb,
            large: thumb,
            back: null
          },
          isrc: '',
        } as Track;
      });
    } catch (error) {
      console.warn('[ItunesClient] getCostaRicaTrending error:', error);
      return [];
    }
  }

  static async getAlbumTracks(collectionId: number): Promise<Track[]> {
    const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`iTunes API error: ${response.status}`);
      const data = await response.json();
      // First item is the collection, rest are tracks
      const tracks = data.results.filter((item: any) => item.wrapperType === 'track');
      return tracks.map((item: any) => this.mapToTrack(item));
    } catch (error) {
      console.warn('[ItunesClient] getAlbumTracks error:', error);
      return [];
    }
  }

  private static mapToAlbum(item: any): Album {
    const highResCover = item.artworkUrl100?.replace('100x100', '600x600') || '';
    return {
      id: item.collectionId.toString(),
      name: item.collectionName,
      description: item.copyright || '',
      year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : null,
      type: 'album',
      playCount: null,
      language: '',
      explicitContent: item.collectionExplicitness === 'explicit',
      artists: {
        primary: [{
          id: item.artistId?.toString() || '',
          name: item.artistName,
          role: 'Primary',
          type: 'artist',
          image: [],
          url: item.artistViewUrl || ''
        }],
        featured: [],
        all: []
      },
      songCount: item.trackCount,
      url: item.collectionViewUrl,
      image: [],
      images: {
        small: item.artworkUrl60 || '',
        thumbnail: item.artworkUrl100 || '',
        large: highResCover,
        back: null
      }
    };
  }

  private static mapToArtist(item: any): Artist {
    return {
      id: item.artistId.toString(),
      name: item.artistName,
      url: item.artistLinkUrl || '',
      followerCount: null,
      isVerified: false,
      dominantLanguage: '',
      dominantType: '',
      role: '',
      image: [],
      images: {
        small: '',
        thumbnail: '',
        large: '',
        back: null
      }
    };
  }

  private static mapToTrack(item: any): Track {
    const thumb = item.artworkUrl100 || '';
    const artist = item.artistName || 'Unknown Artist';
    const title = item.trackName || item.collectionName || 'Unknown';
    // Smart ID: itunes:numericId:Artist - Title
    const smartId = `itunes:${item.trackId || item.collectionId}:${artist} - ${title}`;
    
    return {
      id: smartId,
      provider: 'ytmusic',
      title: title,
      artist: artist,
      artistId: item.artistId || 0,
      albumTitle: item.collectionName || '',
      albumCover: thumb.replace('100x100', '600x600'),
      albumId: item.collectionId?.toString() || '',
      releaseDate: item.releaseDate || '',
      genre: item.primaryGenreName || '',
      duration: item.trackTimeMillis || 0,
      audioQuality: { maximumBitDepth: 16, maximumSamplingRate: 44100, isHiRes: false },
      version: null,
      label: '',
      labelId: 0,
      upc: '',
      mediaCount: 1,
      parental_warning: item.trackExplicitness === 'explicit',
      streamable: true,
      purchasable: false,
      previewable: true,
      genreId: 0,
      genreSlug: '',
      genreColor: '',
      releaseDateStream: '',
      releaseDateDownload: '',
      maximumChannelCount: 2,
      images: {
        small: item.artworkUrl60 || '',
        thumbnail: item.artworkUrl100 || '',
        large: thumb.replace('100x100', '600x600'),
        back: null
      },
      isrc: '',
    };
  }
}
