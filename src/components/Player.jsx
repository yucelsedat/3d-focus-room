import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'
import { loadRoom } from '../utils/loadRoom'
import * as THREE from 'three'

function isTyping() {
  const el = document.activeElement
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

const MOVE_SPEED        = 5
const GRID_SIZE         = 40
const TILE_SIZE         = 1
const WALL_OFFSET       = GRID_SIZE / 2   // 20
const OUTER_GRID_SIZE   = 120
const OUTER_WALL_OFFSET = 60
const FAR_LIMIT         = 200             // mutlak sınır (dış duvar geçilince de geçerli)

function canPassThrough(hiddenWallsSet, face, posAlongWall) {
  const j = Math.floor(posAlongWall + WALL_OFFSET)
  for (let h = 1; h <= 2; h++) {
    if (j >= 0 && j < GRID_SIZE) {
      const id = (h * GRID_SIZE * 4) + (j * 4) + face
      if (hiddenWallsSet.has(id)) return true
    }
  }
  return false
}

function canPassThroughOuter(hiddenOuterSet, face, posAlongWall) {
  const j = Math.floor(posAlongWall + OUTER_WALL_OFFSET)
  for (let h = 1; h <= 2; h++) {
    if (j >= 0 && j < OUTER_GRID_SIZE) {
      const id = (h * OUTER_GRID_SIZE * 4) + (j * 4) + face
      if (hiddenOuterSet.has(id)) return true
    }
  }
  return false
}

export function Player() {
  const activeModal       = useStore((state) => state.activeModal)
  const hiddenWalls       = useStore((state) => state.hiddenWalls)
  const hiddenOuterWalls  = useStore((state) => state.hiddenOuterWalls)
  const specialDoors      = useStore((state) => state.specialDoors)
  const outerSpecialDoors = useStore((state) => state.outerSpecialDoors)
  const [, getKeys] = useKeyboardControls()
  const forward    = useRef(new THREE.Vector3())
  const side       = useRef(new THREE.Vector3())
  const direction  = useRef(new THREE.Vector3())
  const hiddenSetRef          = useRef(new Set())
  const hiddenOuterSetRef     = useRef(new Set())
  const teleporting           = useRef(false)
  const specialDoorsRef       = useRef([])
  const outerSpecialDoorsRef  = useRef([])

  useFrame((state, delta) => {
    if (teleporting.current || isTyping()) return

    hiddenSetRef.current        = new Set(hiddenWalls)
    hiddenOuterSetRef.current   = new Set(hiddenOuterWalls)
    specialDoorsRef.current     = specialDoors
    outerSpecialDoorsRef.current = outerSpecialDoors

    const { forward: moveForward, backward, left, right } = getKeys()

    state.camera.getWorldDirection(forward.current)
    forward.current.y = 0
    if (forward.current.lengthSq() > 0) {
      forward.current.normalize()
    } else {
      forward.current.set(0, 0, -1)
    }

    side.current.crossVectors(state.camera.up, forward.current).normalize()

    direction.current.set(0, 0, 0)
    if (moveForward) direction.current.add(forward.current)
    if (backward)    direction.current.sub(forward.current)
    if (left)        direction.current.add(side.current)
    if (right)       direction.current.sub(side.current)

    if (direction.current.lengthSq() === 0) return

    direction.current.normalize().multiplyScalar(MOVE_SPEED * delta)

    const prev = state.camera.position
    let nx = prev.x + direction.current.x
    let nz = prev.z + direction.current.z

    const hs = hiddenSetRef.current

    // --- İç duvar collision ---
    const inXSpan = nx > -WALL_OFFSET && nx < WALL_OFFSET
    const inZSpan = nz > -WALL_OFFSET && nz < WALL_OFFSET

    if (inXSpan) {
      if (prev.z > -WALL_OFFSET && nz <= -WALL_OFFSET) {
        if (!canPassThrough(hs, 0, nx)) nz = -WALL_OFFSET + 0.01
      }
      if (prev.z < -WALL_OFFSET && nz >= -WALL_OFFSET) {
        if (!canPassThrough(hs, 0, nx)) nz = -WALL_OFFSET - 0.01
      }
    }

    if (inXSpan) {
      if (prev.z < WALL_OFFSET && nz >= WALL_OFFSET) {
        if (!canPassThrough(hs, 1, nx)) nz = WALL_OFFSET - 0.01
      }
      if (prev.z > WALL_OFFSET && nz <= WALL_OFFSET) {
        if (!canPassThrough(hs, 1, nx)) nz = WALL_OFFSET + 0.01
      }
    }

    if (inZSpan) {
      if (prev.x > -WALL_OFFSET && nx <= -WALL_OFFSET) {
        if (!canPassThrough(hs, 2, nz)) nx = -WALL_OFFSET + 0.01
      }
      if (prev.x < -WALL_OFFSET && nx >= -WALL_OFFSET) {
        if (!canPassThrough(hs, 2, nz)) nx = -WALL_OFFSET - 0.01
      }
    }

    if (inZSpan) {
      if (prev.x < WALL_OFFSET && nx >= WALL_OFFSET) {
        if (!canPassThrough(hs, 3, nz)) nx = WALL_OFFSET - 0.01
      }
      if (prev.x > WALL_OFFSET && nx <= WALL_OFFSET) {
        if (!canPassThrough(hs, 3, nz)) nx = WALL_OFFSET + 0.01
      }
    }

    // --- İç özel kapı geçişi ---
    for (const sd of specialDoorsRef.current) {
      const face = sd.anchorId % 4
      const j    = Math.floor((sd.anchorId % (GRID_SIZE * 4)) / 4)
      let crossed = false
      let spawnX = 0, spawnZ = 0

      if (face === 0 && prev.z > -WALL_OFFSET && nz <= -WALL_OFFSET) {
        const pj = Math.floor(nx + WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = j - WALL_OFFSET + TILE_SIZE
          spawnZ = WALL_OFFSET - 2
        }
      }
      if (face === 1 && prev.z < WALL_OFFSET && nz >= WALL_OFFSET) {
        const pj = Math.floor(nx + WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = j - WALL_OFFSET + TILE_SIZE
          spawnZ = -(WALL_OFFSET - 2)
        }
      }
      if (face === 2 && prev.x > -WALL_OFFSET && nx <= -WALL_OFFSET) {
        const pj = Math.floor(nz + WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = WALL_OFFSET - 2
          spawnZ = j - WALL_OFFSET + TILE_SIZE
        }
      }
      if (face === 3 && prev.x < WALL_OFFSET && nx >= WALL_OFFSET) {
        const pj = Math.floor(nz + WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = -(WALL_OFFSET - 2)
          spawnZ = j - WALL_OFFSET + TILE_SIZE
        }
      }

      if (crossed) {
        teleporting.current = true
        loadRoom(sd.targetRoomId, sd.targetRoomName).then(() => {
          state.camera.position.set(spawnX, 2.5, spawnZ)
          teleporting.current = false
        }).catch(err => {
          console.error('Teleport failed:', err)
          teleporting.current = false
        })
        return
      }
    }

    // --- Dış duvar collision ---
    const outerHs = hiddenOuterSetRef.current

    if (prev.z > -OUTER_WALL_OFFSET && nz <= -OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 0, nx)) nz = -OUTER_WALL_OFFSET + 0.01
    }
    if (prev.z < -OUTER_WALL_OFFSET && nz >= -OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 0, nx)) nz = -OUTER_WALL_OFFSET - 0.01
    }
    if (prev.z < OUTER_WALL_OFFSET && nz >= OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 1, nx)) nz = OUTER_WALL_OFFSET - 0.01
    }
    if (prev.z > OUTER_WALL_OFFSET && nz <= OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 1, nx)) nz = OUTER_WALL_OFFSET + 0.01
    }
    if (prev.x > -OUTER_WALL_OFFSET && nx <= -OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 2, nz)) nx = -OUTER_WALL_OFFSET + 0.01
    }
    if (prev.x < -OUTER_WALL_OFFSET && nx >= -OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 2, nz)) nx = -OUTER_WALL_OFFSET - 0.01
    }
    if (prev.x < OUTER_WALL_OFFSET && nx >= OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 3, nz)) nx = OUTER_WALL_OFFSET - 0.01
    }
    if (prev.x > OUTER_WALL_OFFSET && nx <= OUTER_WALL_OFFSET) {
      if (!canPassThroughOuter(outerHs, 3, nz)) nx = OUTER_WALL_OFFSET + 0.01
    }

    // --- Dış özel kapı geçişi ---
    for (const sd of outerSpecialDoorsRef.current) {
      const face = sd.anchorId % 4
      const j    = Math.floor((sd.anchorId % (OUTER_GRID_SIZE * 4)) / 4)
      let crossed = false
      let spawnX = 0, spawnZ = 0

      if (face === 0 && prev.z > -OUTER_WALL_OFFSET && nz <= -OUTER_WALL_OFFSET) {
        const pj = Math.floor(nx + OUTER_WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = j - WALL_OFFSET + TILE_SIZE
          spawnZ = WALL_OFFSET - 2
        }
      }
      if (face === 1 && prev.z < OUTER_WALL_OFFSET && nz >= OUTER_WALL_OFFSET) {
        const pj = Math.floor(nx + OUTER_WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = j - WALL_OFFSET + TILE_SIZE
          spawnZ = -(WALL_OFFSET - 2)
        }
      }
      if (face === 2 && prev.x > -OUTER_WALL_OFFSET && nx <= -OUTER_WALL_OFFSET) {
        const pj = Math.floor(nz + OUTER_WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = WALL_OFFSET - 2
          spawnZ = j - WALL_OFFSET + TILE_SIZE
        }
      }
      if (face === 3 && prev.x < OUTER_WALL_OFFSET && nx >= OUTER_WALL_OFFSET) {
        const pj = Math.floor(nz + OUTER_WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = -(WALL_OFFSET - 2)
          spawnZ = j - WALL_OFFSET + TILE_SIZE
        }
      }

      if (crossed) {
        teleporting.current = true
        loadRoom(sd.targetRoomId, sd.targetRoomName).then(() => {
          state.camera.position.set(spawnX, 2.5, spawnZ)
          teleporting.current = false
        }).catch(err => {
          console.error('Outer teleport failed:', err)
          teleporting.current = false
        })
        return
      }
    }

    nx = Math.max(-FAR_LIMIT, Math.min(FAR_LIMIT, nx))
    nz = Math.max(-FAR_LIMIT, Math.min(FAR_LIMIT, nz))

    state.camera.position.x = nx
    state.camera.position.z = nz
  })

  return <PointerLockControls enabled={!activeModal} />
}
