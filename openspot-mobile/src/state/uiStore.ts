import { create } from 'zustand';

type UiState = {
  fullPlayerOpen: boolean;
  setFullPlayerOpen: (v: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  fullPlayerOpen: false,
  setFullPlayerOpen: (v) => set({ fullPlayerOpen: v }),
}));
