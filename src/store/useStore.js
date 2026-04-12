import { create } from 'zustand'

export const useStore = create((set) => ({
  activeModal: false,
  selectedTile: null, // { id, position, rotation }
  hoveredTile: null,  // { id, position, rotation }
  worldMedia: [],
  
  openModal: (tile) => set({ activeModal: true, selectedTile: tile }),
  closeModal: () => set({ activeModal: false, selectedTile: null }),
  
  setHoveredTile: (tile) => set({ hoveredTile: tile }),
  setWorldMedia: (media) => set({ worldMedia: media }),
  addMedia: (item) => set((state) => ({ worldMedia: [...state.worldMedia, item] })),
  removeMedia: (id) => set((state) => ({ worldMedia: state.worldMedia.filter((m) => m.id !== id) })),
  updateMedia: (updatedItem) => set((state) => ({ worldMedia: state.worldMedia.map(m => m.id === updatedItem.id ? updatedItem : m) })),
}))
