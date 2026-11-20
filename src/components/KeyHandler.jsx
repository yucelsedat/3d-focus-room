import { useEffect } from 'react'
import { useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'
import { parseLibKey, useLibrary } from './notebook/libraryShelf'
import '../utils/pointerLock' // oyunun kilitlediği elemanı baştan izlemeye başla (defter yeniden kilidi)

// B'nin kararı (new-defter-system): elde kitaplık defteri varsa açılır; yoksa uyarı verilir.
// Elindeki defter kitaplıktan silinmişse (liste yüklüyse) elden bırakılır.
function openHeldNotebook(openNotebook) {
  const { heldNotebook: held, setHeldNotebook, showHudNotice } = useStore.getState()
  const id = parseLibKey(held)
  if (id === null) {
    if (held) setHeldNotebook(null)
    showHudNotice('Elinde bir defter yok', 'Canvas\'taki bir defter kartına tıklayıp eline al')
    return
  }
  const lib = useLibrary.getState()
  if (lib.state === 'ready' && !lib.byId[id]) {
    setHeldNotebook(null)
    showHudNotice('Elindeki defter kitaplıktan silinmiş', 'Canvas\'tan başka bir defter al')
    return
  }
  openNotebook()
}

function isTyping() {
  const el = document.activeElement
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function KeyHandler() {
  const [subscribeKeys] = useKeyboardControls()
  const {
    openModal, hoveredTile,
    activeModal, roomModal, openRoomModal, closeRoomModal,
    menuModal, openMenuModal, closeMenuModal,
    canvasEditorOpen, notebookOpen, openNotebook,
  } = useStore()

  // Release pointer lock whenever any modal or canvas editor is active
  useEffect(() => {
    if ((activeModal || roomModal || menuModal || canvasEditorOpen || notebookOpen) && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [activeModal, roomModal, menuModal, canvasEditorOpen, notebookOpen])

  // Defterin el yazısı fontunu (Caveat, kitaplık defterleri) önceden ısıt — ilk açılışta satırlar zıplamasın
  useEffect(() => {
    document.fonts?.load('400 24px Caveat').catch(() => {})
  }, [])

  // E — edit tile
  useEffect(() => {
    return subscribeKeys(
      (state) => state.edit,
      (pressed) => {
        if (pressed && !isTyping() && hoveredTile && !activeModal && !roomModal && !menuModal && !notebookOpen) {
          openModal(hoveredTile)
        }
      }
    )
  }, [subscribeKeys, hoveredTile, activeModal, roomModal, menuModal, notebookOpen, openModal])

  // R — room settings
  useEffect(() => {
    return subscribeKeys(
      (state) => state.room,
      (pressed) => {
        if (pressed && !isTyping() && !activeModal && !menuModal && !notebookOpen) {
          roomModal ? closeRoomModal() : openRoomModal()
        }
      }
    )
  }, [subscribeKeys, activeModal, roomModal, menuModal, notebookOpen, openRoomModal, closeRoomModal])

  // Q — main menu
  useEffect(() => {
    return subscribeKeys(
      (state) => state.menu,
      (pressed) => {
        if (pressed && !isTyping() && !activeModal && !roomModal && !notebookOpen) {
          menuModal ? closeMenuModal() : openMenuModal()
        }
      }
    )
  }, [subscribeKeys, activeModal, roomModal, menuModal, notebookOpen, openMenuModal, closeMenuModal])

  // B — elindeki defter. Yalnızca açar: defter açıkken "b" yazılabilsin, kapatma geri / Esc ile.
  useEffect(() => {
    return subscribeKeys(
      (state) => state.notebook,
      (pressed) => {
        if (pressed && !isTyping() && !notebookOpen && !activeModal && !roomModal && !menuModal && !canvasEditorOpen) {
          openHeldNotebook(openNotebook)
        }
      }
    )
  }, [subscribeKeys, notebookOpen, activeModal, roomModal, menuModal, canvasEditorOpen, openNotebook])

  return null
}
