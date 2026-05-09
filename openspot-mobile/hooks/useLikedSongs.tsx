import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { Track } from '../types/music';
import {
  getAllLikesOrderedNewestFirst,
  upsertLike,
  removeLikeByTrackId,
  clearAllLikes,
  trackToLikedSong,
  type LikedSong,
} from '@/src/storage/likesRepo';

export type { LikedSong };

interface LikedSongsContextType {
  likedSongs: LikedSong[];
  isLoading: boolean;
  isLiked: (trackId: string | number) => boolean;
  likeSong: (track: Track) => void;
  unlikeSong: (trackId: string | number) => void;
  toggleLike: (track: Track) => void;
  likedCount: number;
  recentlyLiked: LikedSong[];
  clearAllLiked: () => void;
  getLikedSongsAsTrack: () => Track[];
}

const LikedSongsContext = createContext<LikedSongsContextType | undefined>(undefined);

interface LikedSongsProviderProps {
  children: ReactNode;
}

export function LikedSongsProvider({ children }: LikedSongsProviderProps) {
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLikedSongs = async () => {
      try {
        const rows = await getAllLikesOrderedNewestFirst();
        setLikedSongs(rows);
      } catch (error) {
        console.error('Failed to load liked songs from SQLite:', error);
        setLikedSongs([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadLikedSongs();
  }, []);

  const isLiked = useCallback(
    (trackId: string | number): boolean => {
      const id = trackId.toString();
      return likedSongs.some((song) => song.id.toString() === id);
    },
    [likedSongs]
  );

  const likeSong = useCallback(
    (track: Track) => {
      if (isLiked(track.id)) return;

      const likedSong = trackToLikedSong(track);
      setLikedSongs((prev) => [likedSong, ...prev.filter((s) => s.id.toString() !== likedSong.id.toString())]);
      void upsertLike(likedSong).catch((e) => console.error('Failed to persist like', e));
    },
    [isLiked]
  );

  const unlikeSong = useCallback((trackId: string | number) => {
    const id = trackId.toString();
    setLikedSongs((prev) => prev.filter((song) => song.id.toString() !== id));
    void removeLikeByTrackId(trackId).catch((e) => console.error('Failed to remove like', e));
  }, []);

  const toggleLike = useCallback(
    (track: Track) => {
      if (isLiked(track.id)) {
        unlikeSong(track.id);
      } else {
        likeSong(track);
      }
    },
    [isLiked, likeSong, unlikeSong]
  );

  const likedCount = likedSongs.length;

  const recentlyLiked = likedSongs.slice(0, 10);

  const clearAllLiked = useCallback(() => {
    setLikedSongs([]);
    void clearAllLikes().catch((e) => console.error('Failed to clear likes', e));
  }, []);

  const getLikedSongsAsTrack = useCallback((): Track[] => {
    return likedSongs.map((song) => ({
      id: song.id,
      provider: 'ytmusic',
      title: song.title,
      artist: song.artist,
      artistId: 0,
      albumTitle: song.albumTitle || '',
      albumCover: song.images.large,
      albumId: '',
      releaseDate: '',
      genre: '',
      duration: song.duration || 0,
      audioQuality: {
        maximumBitDepth: 16,
        maximumSamplingRate: 44100,
        isHiRes: false,
      },
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
      images: song.images,
      isrc: '',
    }));
  }, [likedSongs]);

  const contextValue: LikedSongsContextType = {
    likedSongs,
    isLoading,
    isLiked,
    likeSong,
    unlikeSong,
    toggleLike,
    likedCount,
    recentlyLiked,
    clearAllLiked,
    getLikedSongsAsTrack,
  };

  return <LikedSongsContext.Provider value={contextValue}>{children}</LikedSongsContext.Provider>;
}

export function useLikedSongs(): LikedSongsContextType {
  const context = useContext(LikedSongsContext);
  if (context === undefined) {
    throw new Error('useLikedSongs must be used within a LikedSongsProvider');
  }
  return context;
}
