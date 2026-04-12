import { useEffect } from 'react'
import { useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'

export function KeyHandler() {
  const [subscribeKeys] = useKeyboardControls()
  const { openModal, hoveredTile, activeModal } = useStore()

  // Release pointer lock whenever modal is active so the user can use the form
  useEffect(() => {
    if (activeModal && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [activeModal])

  useEffect(() => {
    return subscribeKeys(
      (state) => state.edit,
      (pressed) => {
        if (pressed && hoveredTile && !activeModal) {
          openModal(hoveredTile)
        }
      }
    )
  }, [subscribeKeys, hoveredTile, activeModal, openModal])

  return null
}
