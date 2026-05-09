import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SearchHistoryState {
  history: string[];
}

export interface SearchHistoryActions {
  addSearch: (query: string) => void;
  removeSearch: (query: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 20;

export const useSearchHistoryStore = create<SearchHistoryState & SearchHistoryActions>()(
  persist(
    (set) => ({
      history: [],
      addSearch: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set((state) => {
          // Remove if it already exists to bring it to the front
          const filtered = state.history.filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
          return {
            history: [trimmed, ...filtered].slice(0, MAX_HISTORY),
          };
        });
      },
      removeSearch: (query: string) =>
        set((state) => ({
          history: state.history.filter((q) => q !== query),
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'openspot_search_history',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
