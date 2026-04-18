import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'
import { loadRoom } from '../utils/loadRoom'
import * as THREE from 'three'

const MOVE_SPEED  = 5
const GRID_SIZE   = 40
const TILE_SIZE   = 1
const WALL_OFFSET = GRID_SIZE / 2          // 20 — wall plane position
const OUTER_LIMIT = WALL_OFFSET + 40       // 60 — max range outside the room

// Returns true if the player can cross face at the given position along the wall.
// posAlongWall: world-space x (for front/back walls) or z (for left/right walls).
// hiddenWallsSet: Set of hidden instanceIds.
function canPassThrough(hiddenWallsSet, face, posAlongWall) {
  // Convert world coordinate to tile column index
  const j = Math.floor(posAlongWall + WALL_OFFSET)
  // Player camera is at y=2.5. Tiles covering that height: h=1 (center y=1.5) and h=2 (center y=2.5).
  // A door hides BOTH columns j and j+1 (2 wide). We check the single column j at player-height.
  // If that tile is hidden, the opening is there.
  for (let h = 1; h <= 2; h++) {
    if (j >= 0 && j < GRID_SIZE) {
      const id = (h * GRID_SIZE * 4) + (j * 4) + face
      if (hiddenWallsSet.has(id)) return true
    }
  }
  return false
}

export function Player() {
  const activeModal    = useStore((state) => state.activeModal)
  const hiddenWalls    = useStore((state) => state.hiddenWalls)
  const specialDoors   = useStore((state) => state.specialDoors)
  const [, getKeys] = useKeyboardControls()
  const forward    = useRef(new THREE.Vector3())
  const side       = useRef(new THREE.Vector3())
  const direction  = useRef(new THREE.Vector3())
  const hiddenSetRef     = useRef(new Set())
  const teleporting      = useRef(false)
  const specialDoorsRef  = useRef([])

  useFrame((state, delta) => {
    if (teleporting.current) return

    // Keep refs in sync without re-creating each frame
    hiddenSetRef.current   = new Set(hiddenWalls)
    specialDoorsRef.current = specialDoors

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

    // --- Wall collision ---
    const inXSpan = nx > -WALL_OFFSET && nx < WALL_OFFSET
    const inZSpan = nz > -WALL_OFFSET && nz < WALL_OFFSET

    // Front wall (face=0, z = -WALL_OFFSET)
    if (inXSpan) {
      if (prev.z > -WALL_OFFSET && nz <= -WALL_OFFSET) {
        if (!canPassThrough(hs, 0, nx)) nz = -WALL_OFFSET + 0.01
      }
      if (prev.z < -WALL_OFFSET && nz >= -WALL_OFFSET) {
        if (!canPassThrough(hs, 0, nx)) nz = -WALL_OFFSET - 0.01
      }
    }

    // Back wall (face=1, z = +WALL_OFFSET)
    if (inXSpan) {
      if (prev.z < WALL_OFFSET && nz >= WALL_OFFSET) {
        if (!canPassThrough(hs, 1, nx)) nz = WALL_OFFSET - 0.01
      }
      if (prev.z > WALL_OFFSET && nz <= WALL_OFFSET) {
        if (!canPassThrough(hs, 1, nx)) nz = WALL_OFFSET + 0.01
      }
    }

    // Left wall (face=2, x = -WALL_OFFSET)
    if (inZSpan) {
      if (prev.x > -WALL_OFFSET && nx <= -WALL_OFFSET) {
        if (!canPassThrough(hs, 2, nz)) nx = -WALL_OFFSET + 0.01
      }
      if (prev.x < -WALL_OFFSET && nx >= -WALL_OFFSET) {
        if (!canPassThrough(hs, 2, nz)) nx = -WALL_OFFSET - 0.01
      }
    }

    // Right wall (face=3, x = +WALL_OFFSET)
    if (inZSpan) {
      if (prev.x < WALL_OFFSET && nx >= WALL_OFFSET) {
        if (!canPassThrough(hs, 3, nz)) nx = WALL_OFFSET - 0.01
      }
      if (prev.x > WALL_OFFSET && nx <= WALL_OFFSET) {
        if (!canPassThrough(hs, 3, nz)) nx = WALL_OFFSET + 0.01
      }
    }

    // --- Special door crossing detection ---
    for (const sd of specialDoorsRef.current) {
      const face = sd.anchorId % 4
      const j    = Math.floor((sd.anchorId % (GRID_SIZE * 4)) / 4)
      let crossed = false
      let spawnX = 0, spawnZ = 0

      // Front wall (face=0, z=-20): walking inside→outside
      if (face === 0 && prev.z > -WALL_OFFSET && nz <= -WALL_OFFSET) {
        const pj = Math.floor(nx + WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = j - WALL_OFFSET + TILE_SIZE
          spawnZ = WALL_OFFSET - 2
        }
      }
      // Back wall (face=1, z=+20): walking inside→outside
      if (face === 1 && prev.z < WALL_OFFSET && nz >= WALL_OFFSET) {
        const pj = Math.floor(nx + WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = j - WALL_OFFSET + TILE_SIZE
          spawnZ = -(WALL_OFFSET - 2)
        }
      }
      // Left wall (face=2, x=-20): walking inside→outside
      if (face === 2 && prev.x > -WALL_OFFSET && nx <= -WALL_OFFSET) {
        const pj = Math.floor(nz + WALL_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = WALL_OFFSET - 2
          spawnZ = j - WALL_OFFSET + TILE_SIZE
        }
      }
      // Right wall (face=3, x=+20): walking inside→outside
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

    // Hard outer limit so the player doesn't walk into infinite void
    nx = Math.max(-OUTER_LIMIT, Math.min(OUTER_LIMIT, nx))
    nz = Math.max(-OUTER_LIMIT, Math.min(OUTER_LIMIT, nz))

    state.camera.position.x = nx
    state.camera.position.z = nz
  })

  return <PointerLockControls enabled={!activeModal} />
}
