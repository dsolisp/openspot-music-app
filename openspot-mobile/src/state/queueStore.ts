import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from '@/types/music';

export type RepeatMode = 'none' | 'all' | 'one';

interface QueueState {
  tracks: Track[];
  currentIndex: number;
  isShuffled: boolean;
  originalTracks: Track[];
  repeatMode: RepeatMode;
}

interface QueueActions {
  setQueueTracks: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  addNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  setCurrentIndex: (index: number) => Track | null;
  playNext: () => Track | null;
  playPrevious: () => Track | null;
  shuffleQueue: () => void;
  unshuffleQueue: () => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  cycleRepeatMode: () => void;
  clearQueue: () => void;
}

const INITIAL_STATE: QueueState = {
  tracks: [],
  currentIndex: -1,
  isShuffled: false,
  originalTracks: [],
  repeatMode: 'none',
};

/** Fisher-Yates shuffle, preserving the currently playing track at index 0. */
function shuffleTracks(tracks: Track[], currentIndex: number): { tracks: Track[]; newIndex: number } {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const currentTrack = tracks[currentIndex];
  const newIndex = currentTrack ? shuffled.findIndex((t) => t.id === currentTrack.id) : 0;
  return { tracks: shuffled, newIndex };
}

const REPEAT_CYCLE: RepeatMode[] = ['none', 'all', 'one'];

export const useQueueStore = create<QueueState & QueueActions>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setQueueTracks: (tracks, startIndex = 0) =>
        set({ tracks, currentIndex: startIndex, isShuffled: false, originalTracks: tracks }),

      addToQueue: (track) =>
        set((s) => ({
          // Deduplication: don't add if already in queue
          ...(s.tracks.some((t) => t.id === track.id)
            ? {}
            : {
                tracks: [...s.tracks, track],
                originalTracks: [...s.originalTracks, track],
              }),
        })),

      addNext: (track) =>
        set((s) => {
          const insertIndex = s.currentIndex >= 0 ? s.currentIndex + 1 : s.tracks.length;
          const nextTracks = [...s.tracks];
          nextTracks.splice(insertIndex, 0, track);
          const currentTrack = s.tracks[s.currentIndex];
          const origInsert = currentTrack
            ? s.originalTracks.findIndex((t) => t.id === currentTrack.id) + 1
            : s.originalTracks.length;
          const nextOriginal = [...s.originalTracks];
          nextOriginal.splice(origInsert, 0, track);
          return { tracks: nextTracks, originalTracks: nextOriginal };
        }),

      removeFromQueue: (index) =>
        set((s) => {
          if (index < 0 || index >= s.tracks.length) return s;
          const removed = s.tracks[index];
          const nextTracks = s.tracks.filter((_, i) => i !== index);
          const origIdx = s.originalTracks.findIndex((t) => t.id === removed.id);
          const nextOriginal = origIdx >= 0 ? s.originalTracks.filter((_, i) => i !== origIdx) : s.originalTracks;
          let nextIndex = s.currentIndex;
          if (nextTracks.length === 0) nextIndex = -1;
          else if (index === s.currentIndex) nextIndex = Math.min(index, nextTracks.length - 1);
          else if (index < s.currentIndex) nextIndex = s.currentIndex - 1;
          return { tracks: nextTracks, originalTracks: nextOriginal, currentIndex: nextIndex };
        }),

      moveQueueItem: (fromIndex, toIndex) =>
        set((s) => {
          if (
            fromIndex < 0 || toIndex < 0 ||
            fromIndex >= s.tracks.length || toIndex >= s.tracks.length ||
            fromIndex === toIndex
          ) return s;
          const next = [...s.tracks];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          let nextIndex = s.currentIndex;
          if (s.currentIndex === fromIndex) nextIndex = toIndex;
          else if (fromIndex < s.currentIndex && toIndex >= s.currentIndex) nextIndex--;
          else if (fromIndex > s.currentIndex && toIndex <= s.currentIndex) nextIndex++;
          return { tracks: next, originalTracks: s.isShuffled ? s.originalTracks : next, currentIndex: nextIndex };
        }),

      setCurrentIndex: (index) => {
        const { tracks } = get();
        if (index < 0 || index >= tracks.length) return null;
        set({ currentIndex: index });
        return tracks[index];
      },

      playNext: () => {
        const { tracks, currentIndex, repeatMode } = get();
        if (repeatMode === 'one') {
          // Stay on same track — caller re-seeks to 0
          return tracks[currentIndex] ?? null;
        }
        const nextIndex = currentIndex + 1;
        if (nextIndex >= tracks.length) {
          if (repeatMode === 'all' && tracks.length > 0) {
            set({ currentIndex: 0 });
            return tracks[0];
          }
          return null;
        }
        set({ currentIndex: nextIndex });
        return tracks[nextIndex];
      },

      playPrevious: () => {
        const { tracks, currentIndex } = get();
        const prevIndex = currentIndex - 1;
        if (prevIndex < 0) return null;
        set({ currentIndex: prevIndex });
        return tracks[prevIndex];
      },

      shuffleQueue: () =>
        set((s) => {
          if (s.tracks.length <= 1) return s;
          const { tracks: shuffled, newIndex } = shuffleTracks(s.tracks, s.currentIndex);
          return { tracks: shuffled, currentIndex: newIndex, isShuffled: true };
        }),

      unshuffleQueue: () =>
        set((s) => {
          const currentTrack = s.tracks[s.currentIndex];
          const newIndex = currentTrack
            ? s.originalTracks.findIndex((t) => t.id === currentTrack.id)
            : 0;
          return { tracks: [...s.originalTracks], currentIndex: Math.max(0, newIndex), isShuffled: false };
        }),

      toggleShuffle: () => {
        const { isShuffled, shuffleQueue, unshuffleQueue } = get();
        if (isShuffled) unshuffleQueue();
        else shuffleQueue();
      },

      setRepeatMode: (mode) => set({ repeatMode: mode }),

      cycleRepeatMode: () =>
        set((s) => {
          const idx = REPEAT_CYCLE.indexOf(s.repeatMode);
          return { repeatMode: REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length] };
        }),

      clearQueue: () => set(INITIAL_STATE),
    }),
    {
      name: 'openspot_music_queue',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist state fields, not action functions
      partialize: (s) => ({
        tracks: s.tracks,
        currentIndex: s.currentIndex,
        isShuffled: s.isShuffled,
        originalTracks: s.originalTracks,
        repeatMode: s.repeatMode,
      }),
    }
  )
);
