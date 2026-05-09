/**
 * Thin selector wrapper around useQueueStore.
 * Preserves the original public API so all call sites work without changes.
 */
import { useQueueStore } from '@/src/state/queueStore';
import type { RepeatMode } from '@/src/state/queueStore';

export type { RepeatMode };

export function useMusicQueue() {
  const store = useQueueStore();

  return {
    // State
    queue: {
      tracks: store.tracks,
      currentIndex: store.currentIndex,
      isShuffled: store.isShuffled,
      originalTracks: store.originalTracks,
    },
    tracks: store.tracks,
    currentIndex: store.currentIndex,
    isShuffled: store.isShuffled,
    queueLength: store.tracks.length,
    repeatMode: store.repeatMode,

    // Derived
    currentTrack:
      store.currentIndex >= 0 && store.currentIndex < store.tracks.length
        ? store.tracks[store.currentIndex]
        : null,

    // Actions
    setQueueTracks: store.setQueueTracks,
    addToQueue: store.addToQueue,
    addNext: store.addNext,
    removeFromQueue: store.removeFromQueue,
    moveQueueItem: store.moveQueueItem,
    getCurrentTrack: () =>
      store.currentIndex >= 0 && store.currentIndex < store.tracks.length
        ? store.tracks[store.currentIndex]
        : null,
    setCurrentIndex: store.setCurrentIndex,
    playNext: store.playNext,
    playPrevious: store.playPrevious,
    toggleShuffle: () => {
      store.toggleShuffle();
      return !store.isShuffled; // Return the *new* state to match old hook API
    },
    setRepeatMode: store.setRepeatMode,
    cycleRepeatMode: store.cycleRepeatMode,
    clearQueue: store.clearQueue,

    // Helpers (kept for backwards compatibility)
    hasNext: () => store.currentIndex < store.tracks.length - 1,
    hasPrevious: () => store.currentIndex > 0,
  };
}

