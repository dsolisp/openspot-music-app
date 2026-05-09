import { useState, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Track, Album, Artist, PlaylistSearchItem } from '../types/music';
import { MusicAPI } from '../lib/music-api';
import { openQueryKeys } from '@/src/state/queryKeys';
import { useSearchHistoryStore } from '@/src/state/searchHistoryStore';

interface UseSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: PlaylistSearchItem[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  searchType: 'track' | 'album' | 'artist' | 'playlist';
  setSearchType: (type: 'track' | 'album' | 'artist' | 'playlist') => void;
  searchTracks: (searchQuery: string, type?: 'track' | 'album' | 'artist' | 'playlist') => Promise<void>;
  loadMore: () => Promise<void>;
  clearResults: () => void;
  history: string[];
  removeHistoryItem: (query: string) => void;
  clearHistory: () => void;
}

export function useSearch(): UseSearchReturn {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchType, setSearchTypeState] = useState<'track' | 'album' | 'artist' | 'playlist'>('track');
  const queryClient = useQueryClient();
  const { history, removeSearch, clearHistory } = useSearchHistoryStore();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const trimmed = debouncedQuery.trim();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching, error } = useInfiniteQuery({
    queryKey: openQueryKeys.search(trimmed, searchType),
    queryFn: ({ pageParam = 1 }) => MusicAPI.search({ q: trimmed, type: searchType, page: pageParam as number }),
    getNextPageParam: (lastPage, pages) => lastPage.pagination?.hasMore ? pages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: trimmed.length > 0,
    staleTime: 60_000,
  });

  const busy = isLoading || (isFetching && !isFetchingNextPage);

  const results = data?.pages.flatMap(p => p.tracks) ?? [];
  const albums = data?.pages.flatMap(p => p.albums) ?? [];
  const artists = data?.pages.flatMap(p => p.artists) ?? [];
  const playlists = data?.pages.flatMap(p => p.playlists) ?? [];

  const searchTracks = useCallback(async (searchQuery: string, type?: 'track' | 'album' | 'artist' | 'playlist') => {
    if (!searchQuery.trim()) {
      setQuery('');
      return;
    }
    useSearchHistoryStore.getState().addSearch(searchQuery);
    if (type) {
      setSearchTypeState(type);
    }
    setQuery(searchQuery);
  }, []);

  const handleSetSearchType = useCallback((type: 'track' | 'album' | 'artist' | 'playlist') => {
    if (type !== searchType) {
      setSearchTypeState(type);
    }
  }, [searchType]);

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const clearResults = useCallback(() => {
    setQuery('');
    queryClient.removeQueries({ queryKey: ['search'], exact: false });
  }, [queryClient]);

  return {
    query,
    setQuery,
    results,
    albums,
    artists,
    playlists,
    isLoading: busy,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    hasMore: !!hasNextPage,
    searchType,
    setSearchType: handleSetSearchType,
    searchTracks,
    loadMore,
    clearResults,
    history,
    removeHistoryItem: removeSearch,
    clearHistory,
  };
}
