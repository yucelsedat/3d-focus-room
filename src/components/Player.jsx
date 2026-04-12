import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'
import * as THREE from 'three'

const MOVE_SPEED = 5

export function Player() {
  const activeModal = useStore((state) => state.activeModal)
  const [, getKeys] = useKeyboardControls()
  const forward = useRef(new THREE.Vector3())
  const side = useRef(new THREE.Vector3())
  const direction = useRef(new THREE.Vector3())

  useFrame((state, delta) => {
    const { forward: moveForward, backward, left, right } = getKeys()

    // Calculate forward vector from camera direction
    state.camera.getWorldDirection(forward.current)
    forward.current.y = 0
    if (forward.current.lengthSq() > 0) {
      forward.current.normalize()
    } else {
      forward.current.set(0, 0, -1)
    }

    // Calculate side vector (right)
    side.current.crossVectors(state.camera.up, forward.current).normalize()

    // Reset direction
    direction.current.set(0, 0, 0)

    // Combine based on input
    if (moveForward) direction.current.add(forward.current)
    if (backward) direction.current.sub(forward.current)
    if (left) direction.current.add(side.current)
    if (right) direction.current.sub(side.current)

    if (direction.current.lengthSq() > 0) {
      direction.current.normalize().multiplyScalar(MOVE_SPEED * delta)
      const newPos = state.camera.position.clone().add(direction.current)
      
      const LIMIT = 9.8
      if (newPos.x > LIMIT) newPos.x = LIMIT
      if (newPos.x < -LIMIT) newPos.x = -LIMIT
      if (newPos.z > LIMIT) newPos.z = LIMIT
      if (newPos.z < -LIMIT) newPos.z = -LIMIT

      state.camera.position.copy(newPos)
    }
  })

  return <PointerLockControls enabled={!activeModal} />
}
