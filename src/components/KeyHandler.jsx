import { useEffect } from 'react'
import { useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'
import '../utils/pointerLock' // oyunun kilitlediği elemanı baştan izlemeye başla (defter yeniden kilidi)

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

  // Defterin el yazısı fontunu önceden ısıt — ilk açılışta satır yükseklikleri zıplamasın
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

  // B — oda defteri. Yalnızca açar: defter açıkken "b" yazılabilsin, kapatma X/Esc ile.
  useEffect(() => {
    return subscribeKeys(
      (state) => state.notebook,
      (pressed) => {
        if (pressed && !isTyping() && !notebookOpen && !activeModal && !roomModal && !menuModal && !canvasEditorOpen) {
          openNotebook()
        }
      }
    )
  }, [subscribeKeys, notebookOpen, activeModal, roomModal, menuModal, canvasEditorOpen, openNotebook])

  return null
}
