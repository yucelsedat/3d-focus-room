import { useEffect } from 'react'
import { useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'

export function KeyHandler() {
  const [subscribeKeys] = useKeyboardControls()
  const {
    openModal, hoveredTile,
    activeModal, roomModal, openRoomModal, closeRoomModal,
    menuModal, openMenuModal, closeMenuModal,
  } = useStore()

  // Release pointer lock whenever any modal is active
  useEffect(() => {
    if ((activeModal || roomModal || menuModal) && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [activeModal, roomModal, menuModal])

  // E — edit tile
  useEffect(() => {
    return subscribeKeys(
      (state) => state.edit,
      (pressed) => {
        if (pressed && hoveredTile && !activeModal && !roomModal && !menuModal) {
          openModal(hoveredTile)
        }
      }
    )
  }, [subscribeKeys, hoveredTile, activeModal, roomModal, menuModal, openModal])

  // R — room settings
  useEffect(() => {
    return subscribeKeys(
      (state) => state.room,
      (pressed) => {
        if (pressed && !activeModal && !menuModal) {
          roomModal ? closeRoomModal() : openRoomModal()
        }
      }
    )
  }, [subscribeKeys, activeModal, roomModal, menuModal, openRoomModal, closeRoomModal])

  // Q — main menu
  useEffect(() => {
    return subscribeKeys(
      (state) => state.menu,
      (pressed) => {
        if (pressed && !activeModal && !roomModal) {
          menuModal ? closeMenuModal() : openMenuModal()
        }
      }
    )
  }, [subscribeKeys, activeModal, roomModal, menuModal, openMenuModal, closeMenuModal])

  return null
}
