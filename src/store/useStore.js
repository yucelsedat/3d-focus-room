import { create } from 'zustand'

export const useStore = create((set) => ({
  activeModal: false,
  canvasEditorOpen: false,
  canvasEditorMediaId: null,
  selectedTile: null, // { id, position, rotation }
  modalEdit: null,    // { type: 'roomsession-loop', mediaId, loop, model, effort, permissionMode } — EditModal düzenleme modu
  loopSpecEdits: {},  // mediaId → güncellenen loop spec (LoopFlow paneli kaydettikten sonra kendini tazeler)
  hoveredTile: null,  // { id, position, rotation }
  worldMedia: [],
  roomModal: false,
  menuModal: true,    // uygulama açılışında menü göster
  hiddenWalls: [],        // iç duvar gizli tile ID'leri
  hiddenOuterWalls: [],   // 1. bahçe duvarı (±30) gizli tile ID'leri
  hiddenOuterWalls2: [],  // 2. bahçe duvarı (±40) gizli tile ID'leri
  floorTexture: 'zemin.jpg',
  currentRoomId: 'default',
  currentRoomName: 'Varsayılan Oda',
  currentRoomType: 'room',
  rooms: [],
  specialDoors: [],
  outerSpecialDoors: [],   // 1. bahçe duvarı özel kapıları
  outerSpecialDoors2: [],  // 2. bahçe duvarı özel kapıları
  roomHistory: [],

  setCanvasEditorOpen: (open) => set({ canvasEditorOpen: open }),
  openCanvasEditor: (id) => set({ canvasEditorOpen: true, canvasEditorMediaId: id }),
  closeCanvasEditor: () => set({ canvasEditorOpen: false, canvasEditorMediaId: null }),

  openModal: (tile, edit = null) => set({ activeModal: true, selectedTile: tile, modalEdit: edit }),
  closeModal: () => set({ activeModal: false, selectedTile: null, modalEdit: null }),
  applyLoopSpecEdit: (mediaId, loop) => set((state) => ({ loopSpecEdits: { ...state.loopSpecEdits, [String(mediaId)]: loop } })),

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

  setHiddenOuterWalls2: (ids) => set({ hiddenOuterWalls2: ids }),
  addOuterDoor2: (ids) => set((state) => ({ hiddenOuterWalls2: [...new Set([...state.hiddenOuterWalls2, ...ids])] })),
  removeOuterDoor2: (ids) => set((state) => ({ hiddenOuterWalls2: state.hiddenOuterWalls2.filter(id => !ids.includes(id)) })),

  setCurrentRoom: (id, name, type = 'room') => set({ currentRoomId: id, currentRoomName: name, currentRoomType: type }),
  addToHistory: (id, name) => set(state => {
    const filtered = state.roomHistory.filter(r => r.id !== id)
    return { roomHistory: [...filtered, { id, name }].slice(-30) }
  }),
  setRooms: (rooms) => set({ rooms }),
  setSpecialDoors: (specialDoors) => set({ specialDoors }),
  setOuterSpecialDoors: (outerSpecialDoors) => set({ outerSpecialDoors }),
  setOuterSpecialDoors2: (outerSpecialDoors2) => set({ outerSpecialDoors2 }),
}))
