import { useEffect } from 'react'
import { useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'

export function KeyHandler() {
  const [subscribeKeys] = useKeyboardControls()
  const { openModal, hoveredTile, activeModal, roomModal, openRoomModal, closeRoomModal } = useStore()

  // Release pointer lock whenever a modal is active
  useEffect(() => {
    if ((activeModal || roomModal) && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [activeModal, roomModal])

  useEffect(() => {
    return subscribeKeys(
      (state) => state.edit,
      (pressed) => {
        if (pressed && hoveredTile && !activeModal && !roomModal) {
          openModal(hoveredTile)
        }
      }
    )
  }, [subscribeKeys, hoveredTile, activeModal, roomModal, openModal])

  useEffect(() => {
    return subscribeKeys(
      (state) => state.room,
      (pressed) => {
        if (pressed && !activeModal) {
          roomModal ? closeRoomModal() : openRoomModal()
        }
      }
    )
  }, [subscribeKeys, activeModal, roomModal, openRoomModal, closeRoomModal])

  return null
}
