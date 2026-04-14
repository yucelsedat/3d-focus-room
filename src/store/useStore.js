import { create } from 'zustand'

export const useStore = create((set) => ({
  activeModal: false,
  selectedTile: null, // { id, position, rotation }
  hoveredTile: null,  // { id, position, rotation }
  worldMedia: [],
  roomModal: false,
  hiddenWalls: [],    // gizli duvar instanceId'leri (kapılar)
  floorTexture: 'zemin.png',

  openModal: (tile) => set({ activeModal: true, selectedTile: tile }),
  closeModal: () => set({ activeModal: false, selectedTile: null }),

  openRoomModal: () => set({ roomModal: true }),
  closeRoomModal: () => set({ roomModal: false }),

  setHoveredTile: (tile) => set({ hoveredTile: tile }),
  setWorldMedia: (media) => set({ worldMedia: media }),
  addMedia: (item) => set((state) => ({ worldMedia: [...state.worldMedia, item] })),
  removeMedia: (id) => set((state) => ({ worldMedia: state.worldMedia.filter((m) => m.id !== id) })),
  updateMedia: (updatedItem) => set((state) => ({ worldMedia: state.worldMedia.map(m => m.id === updatedItem.id ? updatedItem : m) })),

  setFloorTexture: (texture) => set({ floorTexture: texture }),
  setHiddenWalls: (ids) => set({ hiddenWalls: ids }),
  addDoor: (ids) => set((state) => ({ hiddenWalls: [...new Set([...state.hiddenWalls, ...ids])] })),
  removeDoor: (ids) => set((state) => ({ hiddenWalls: state.hiddenWalls.filter(id => !ids.includes(id)) })),
}))
