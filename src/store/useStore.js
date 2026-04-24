import { create } from 'zustand'

export const useStore = create((set) => ({
  activeModal: false,
  selectedTile: null, // { id, position, rotation }
  hoveredTile: null,  // { id, position, rotation }
  worldMedia: [],
  roomModal: false,
  menuModal: true,    // uygulama açılışında menü göster
  hiddenWalls: [],       // iç duvar gizli tile ID'leri
  hiddenOuterWalls: [],  // dış sınır duvarı gizli tile ID'leri
  floorTexture: 'zemin.png',
  currentRoomId: 'default',
  currentRoomName: 'Varsayılan Oda',
  rooms: [],
  specialDoors: [],
  outerSpecialDoors: [],

  openModal: (tile) => set({ activeModal: true, selectedTile: tile }),
  closeModal: () => set({ activeModal: false, selectedTile: null }),

  openRoomModal: () => set({ roomModal: true }),
  closeRoomModal: () => set({ roomModal: false }),

  openMenuModal:  () => set({ menuModal: true }),
  closeMenuModal: () => set({ menuModal: false }),

  setHoveredTile: (tile) => set({ hoveredTile: tile }),
  setWorldMedia: (media) => set({ worldMedia: media }),
  addMedia: (item) => set((state) => ({ worldMedia: [...state.worldMedia, item] })),
  removeMedia: (id) => set((state) => ({ worldMedia: state.worldMedia.filter((m) => m.id !== id) })),
  updateMedia: (updatedItem) => set((state) => ({ worldMedia: state.worldMedia.map(m => m.id === updatedItem.id ? updatedItem : m) })),

  setFloorTexture: (texture) => set({ floorTexture: texture }),
  setHiddenWalls: (ids) => set({ hiddenWalls: ids }),
  addDoor: (ids) => set((state) => ({ hiddenWalls: [...new Set([...state.hiddenWalls, ...ids])] })),
  removeDoor: (ids) => set((state) => ({ hiddenWalls: state.hiddenWalls.filter(id => !ids.includes(id)) })),

  setHiddenOuterWalls: (ids) => set({ hiddenOuterWalls: ids }),
  addOuterDoor: (ids) => set((state) => ({ hiddenOuterWalls: [...new Set([...state.hiddenOuterWalls, ...ids])] })),
  removeOuterDoor: (ids) => set((state) => ({ hiddenOuterWalls: state.hiddenOuterWalls.filter(id => !ids.includes(id)) })),

  setCurrentRoom: (id, name) => set({ currentRoomId: id, currentRoomName: name }),
  setRooms: (rooms) => set({ rooms }),
  setSpecialDoors: (specialDoors) => set({ specialDoors }),
  setOuterSpecialDoors: (outerSpecialDoors) => set({ outerSpecialDoors }),
}))
