import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useStore } from '../store/useStore'
import { loadRoom } from '../utils/loadRoom'
import { ROOM_CONFIGS, encodeWallId, decodeWallId } from '../utils/roomConfig'
import * as THREE from 'three'

function isTyping() {
  const el = document.activeElement
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

const MOVE_SPEED      = 5
const FOV_NORMAL      = 75
const FOV_ZOOM        = 20
const FOV_SPEED       = 8
const TILE_SIZE       = 1
const OUTER_CONFIG    = { gx: 120, gz: 120, wh: 6 }
const OUTER_OFFSET    = 60
const FAR_LIMIT       = 200
const GROUND_Y        = 2.5
const MAX_FLY_Y       = 80
const FLY_UP_SPEED    = 8
const FLY_DOWN_SPEED  = 8
const FAST_FALL_SPEED = 20
const DOUBLE_TAP_MS   = 300

// Kapı açık mı? (h=1 veya h=2 tile'ı hidden set'te mi)
function canPassThrough(hiddenSet, face, posAlongWall, config) {
  const { gx, gz } = config
  const faceWidth = face < 2 ? gx : gz
  const halfSpan  = face < 2 ? gx / 2 : gz / 2
  const j = Math.floor(posAlongWall + halfSpan)
  for (let h = 1; h <= 2; h++) {
    if (j >= 0 && j < faceWidth) {
      if (hiddenSet.has(encodeWallId(h, face, j, config))) return true
    }
  }
  return false
}

function canPassThroughOuter(hiddenOuterSet, face, posAlongWall) {
  const j = Math.floor(posAlongWall + OUTER_OFFSET)
  for (let h = 1; h <= 2; h++) {
    if (j >= 0 && j < 120) {
      if (hiddenOuterSet.has(encodeWallId(h, face, j, OUTER_CONFIG))) return true
    }
  }
  return false
}

export function Player() {
  const activeModal        = useStore((state) => state.activeModal)
  const canvasEditorOpen   = useStore((state) => state.canvasEditorOpen)
  const hiddenWalls        = useStore((state) => state.hiddenWalls)
  const hiddenOuterWalls   = useStore((state) => state.hiddenOuterWalls)
  const specialDoors       = useStore((state) => state.specialDoors)
  const outerSpecialDoors  = useStore((state) => state.outerSpecialDoors)
  const currentRoomType    = useStore((state) => state.currentRoomType)
  const rooms              = useStore((state) => state.rooms)

  const [, getKeys] = useKeyboardControls()
  const zoomActive  = useRef(false)

  useEffect(() => {
    const onDown = (e) => { if (e.code === 'KeyC') zoomActive.current = true }
    const onUp   = (e) => { if (e.code === 'KeyC') zoomActive.current = false }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [])

  const forward    = useRef(new THREE.Vector3())
  const side       = useRef(new THREE.Vector3())
  const direction  = useRef(new THREE.Vector3())

  const hiddenSetRef         = useRef(new Set())
  const hiddenOuterSetRef    = useRef(new Set())
  const teleporting          = useRef(false)
  const specialDoorsRef      = useRef([])
  const outerSpecialDoorsRef = useRef([])
  const currentRoomTypeRef   = useRef('room')
  const roomsRef             = useRef([])

  const flyY             = useRef(GROUND_Y)
  const flyVelocityY     = useRef(0)
  const isFalling        = useRef(false)
  const lastSpaceTime    = useRef(0)
  const prevSpacePressed = useRef(false)

  useFrame((state, delta) => {
    if (teleporting.current || isTyping()) return

    hiddenSetRef.current        = new Set(hiddenWalls)
    hiddenOuterSetRef.current   = new Set(hiddenOuterWalls)
    specialDoorsRef.current     = specialDoors
    outerSpecialDoorsRef.current = outerSpecialDoors
    currentRoomTypeRef.current  = currentRoomType
    roomsRef.current            = rooms

    const { forward: moveForward, backward, left, right, jump, crouch } = getKeys()

    // --- Dikey hareket (uçma) ---
    const now = performance.now()

    if (jump && !prevSpacePressed.current) {
      const timeSinceLast = now - lastSpaceTime.current
      if (timeSinceLast < DOUBLE_TAP_MS && flyY.current > GROUND_Y) {
        isFalling.current    = true
        flyVelocityY.current = -FAST_FALL_SPEED
      }
      lastSpaceTime.current = now
    }
    prevSpacePressed.current = jump

    if (isFalling.current) {
      flyY.current += flyVelocityY.current * delta
      if (flyY.current <= GROUND_Y) {
        flyY.current         = GROUND_Y
        flyVelocityY.current = 0
        isFalling.current    = false
      }
    } else {
      if (jump && !crouch) {
        flyY.current = Math.min(MAX_FLY_Y, flyY.current + FLY_UP_SPEED * delta)
      } else if (crouch && !jump) {
        flyY.current = Math.max(GROUND_Y, flyY.current - FLY_DOWN_SPEED * delta)
      }
    }

    state.camera.position.y = flyY.current

    const targetFov = zoomActive.current ? FOV_ZOOM : FOV_NORMAL
    state.camera.fov += (targetFov - state.camera.fov) * Math.min(FOV_SPEED * delta, 1)
    state.camera.updateProjectionMatrix()

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

    const config  = ROOM_CONFIGS[currentRoomTypeRef.current] ?? ROOM_CONFIGS.room
    const { gx, gz } = config
    const OFFSET_X = gx / 2   // West/East duvar sınırı
    const OFFSET_Z = gz / 2   // North/South duvar sınırı

    const hs = hiddenSetRef.current

    // --- İç duvar collision ---
    // Oyuncu duvar tepesinin üzerindeyse (uçarak geçiyor) collision atla
    const aboveInnerWall = flyY.current > config.wh + GROUND_Y

    if (!aboveInnerWall) {
      // North/South duvarlar: x ekseninde span kontrol, z sınırında dur
      const inXSpan = nx > -OFFSET_X && nx < OFFSET_X

      if (inXSpan) {
        if (prev.z > -OFFSET_Z && nz <= -OFFSET_Z) {
          if (!canPassThrough(hs, 0, nx, config)) nz = -OFFSET_Z + 0.01
        }
        if (prev.z < -OFFSET_Z && nz >= -OFFSET_Z) {
          if (!canPassThrough(hs, 0, nx, config)) nz = -OFFSET_Z - 0.01
        }
      }
      if (inXSpan) {
        if (prev.z < OFFSET_Z && nz >= OFFSET_Z) {
          if (!canPassThrough(hs, 1, nx, config)) nz = OFFSET_Z - 0.01
        }
        if (prev.z > OFFSET_Z && nz <= OFFSET_Z) {
          if (!canPassThrough(hs, 1, nx, config)) nz = OFFSET_Z + 0.01
        }
      }

      // West/East duvarlar: z ekseninde span kontrol, x sınırında dur
      const inZSpan = nz > -OFFSET_Z && nz < OFFSET_Z

      if (inZSpan) {
        if (prev.x > -OFFSET_X && nx <= -OFFSET_X) {
          if (!canPassThrough(hs, 2, nz, config)) nx = -OFFSET_X + 0.01
        }
        if (prev.x < -OFFSET_X && nx >= -OFFSET_X) {
          if (!canPassThrough(hs, 2, nz, config)) nx = -OFFSET_X - 0.01
        }
      }
      if (inZSpan) {
        if (prev.x < OFFSET_X && nx >= OFFSET_X) {
          if (!canPassThrough(hs, 3, nz, config)) nx = OFFSET_X - 0.01
        }
        if (prev.x > OFFSET_X && nx <= OFFSET_X) {
          if (!canPassThrough(hs, 3, nz, config)) nx = OFFSET_X + 0.01
        }
      }
    }

    // --- İç özel kapı geçişi ---
    for (const sd of specialDoorsRef.current) {
      const { face, j } = decodeWallId(sd.anchorId, config)

      // Hedef odanın boyutlarını bul (spawn pozisyonu için)
      const targetRoom   = roomsRef.current.find(r => r.id === sd.targetRoomId)
      const targetConfig = ROOM_CONFIGS[targetRoom?.roomType] ?? ROOM_CONFIGS.room
      const tOffX = targetConfig.gx / 2
      const tOffZ = targetConfig.gz / 2

      let crossed = false
      let spawnX = 0, spawnZ = 0

      if (face === 0 && prev.z > -OFFSET_Z && nz <= -OFFSET_Z) {
        const pj = Math.floor(nx + OFFSET_X)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = Math.max(-tOffX + 1, Math.min(tOffX - 1, nx))
          spawnZ = tOffZ - 2
        }
      }
      if (face === 1 && prev.z < OFFSET_Z && nz >= OFFSET_Z) {
        const pj = Math.floor(nx + OFFSET_X)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = Math.max(-tOffX + 1, Math.min(tOffX - 1, nx))
          spawnZ = -(tOffZ - 2)
        }
      }
      if (face === 2 && prev.x > -OFFSET_X && nx <= -OFFSET_X) {
        const pj = Math.floor(nz + OFFSET_Z)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = tOffX - 2
          spawnZ = Math.max(-tOffZ + 1, Math.min(tOffZ - 1, nz))
        }
      }
      if (face === 3 && prev.x < OFFSET_X && nx >= OFFSET_X) {
        const pj = Math.floor(nz + OFFSET_Z)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = -(tOffX - 2)
          spawnZ = Math.max(-tOffZ + 1, Math.min(tOffZ - 1, nz))
        }
      }

      if (crossed) {
        teleporting.current = true
        const fromRoomId = useStore.getState().currentRoomId
        loadRoom(sd.targetRoomId, sd.targetRoomName).then(() => {
          const { specialDoors: tDoors, outerSpecialDoors: tOuterDoors } = useStore.getState()
          const returnDoor = [...tDoors, ...tOuterDoors].find(d => d.targetRoomId === fromRoomId)
          if (returnDoor) {
            const { face: rf, j: rj } = decodeWallId(returnDoor.anchorId, targetConfig)
            const rx = targetConfig.gx / 2
            const rz = targetConfig.gz / 2
            let sx, sz
            if      (rf === 0) { sx = rj - rx + 1; sz = -rz + 2 }
            else if (rf === 1) { sx = rj - rx + 1; sz =  rz - 2 }
            else if (rf === 2) { sx = -rx + 2;     sz = rj - rz + 1 }
            else               { sx =  rx - 2;     sz = rj - rz + 1 }
            flyY.current = GROUND_Y; flyVelocityY.current = 0; isFalling.current = false
            state.camera.position.set(sx, GROUND_Y, sz)
          } else {
            flyY.current = GROUND_Y; flyVelocityY.current = 0; isFalling.current = false
            state.camera.position.set(spawnX, GROUND_Y, spawnZ)
          }
          teleporting.current = false
        }).catch(err => {
          console.error('Teleport failed:', err)
          teleporting.current = false
        })
        return
      }
    }

    // --- Dış duvar collision ---
    const outerHs        = hiddenOuterSetRef.current
    const aboveOuterWall = flyY.current > OUTER_CONFIG.wh + GROUND_Y

    if (!aboveOuterWall) {
      if (prev.z > -OUTER_OFFSET && nz <= -OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 0, nx)) nz = -OUTER_OFFSET + 0.01
      }
      if (prev.z < -OUTER_OFFSET && nz >= -OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 0, nx)) nz = -OUTER_OFFSET - 0.01
      }
      if (prev.z < OUTER_OFFSET && nz >= OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 1, nx)) nz = OUTER_OFFSET - 0.01
      }
      if (prev.z > OUTER_OFFSET && nz <= OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 1, nx)) nz = OUTER_OFFSET + 0.01
      }
      if (prev.x > -OUTER_OFFSET && nx <= -OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 2, nz)) nx = -OUTER_OFFSET + 0.01
      }
      if (prev.x < -OUTER_OFFSET && nx >= -OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 2, nz)) nx = -OUTER_OFFSET - 0.01
      }
      if (prev.x < OUTER_OFFSET && nx >= OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 3, nz)) nx = OUTER_OFFSET - 0.01
      }
      if (prev.x > OUTER_OFFSET && nx <= OUTER_OFFSET) {
        if (!canPassThroughOuter(outerHs, 3, nz)) nx = OUTER_OFFSET + 0.01
      }
    }

    // --- Dış özel kapı geçişi ---
    for (const sd of outerSpecialDoorsRef.current) {
      const { face, j } = decodeWallId(sd.anchorId, OUTER_CONFIG)

      const targetRoom   = roomsRef.current.find(r => r.id === sd.targetRoomId)
      const targetConfig = ROOM_CONFIGS[targetRoom?.roomType] ?? ROOM_CONFIGS.room
      const tOffX = targetConfig.gx / 2
      const tOffZ = targetConfig.gz / 2

      let crossed = false
      let spawnX = 0, spawnZ = 0

      if (face === 0 && prev.z > -OUTER_OFFSET && nz <= -OUTER_OFFSET) {
        const pj = Math.floor(nx + OUTER_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = Math.max(-tOffX + 1, Math.min(tOffX - 1, nx))
          spawnZ = tOffZ - 2
        }
      }
      if (face === 1 && prev.z < OUTER_OFFSET && nz >= OUTER_OFFSET) {
        const pj = Math.floor(nx + OUTER_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = Math.max(-tOffX + 1, Math.min(tOffX - 1, nx))
          spawnZ = -(tOffZ - 2)
        }
      }
      if (face === 2 && prev.x > -OUTER_OFFSET && nx <= -OUTER_OFFSET) {
        const pj = Math.floor(nz + OUTER_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = tOffX - 2
          spawnZ = Math.max(-tOffZ + 1, Math.min(tOffZ - 1, nz))
        }
      }
      if (face === 3 && prev.x < OUTER_OFFSET && nx >= OUTER_OFFSET) {
        const pj = Math.floor(nz + OUTER_OFFSET)
        if (pj === j || pj === j + 1) {
          crossed = true
          spawnX = -(tOffX - 2)
          spawnZ = Math.max(-tOffZ + 1, Math.min(tOffZ - 1, nz))
        }
      }

      if (crossed) {
        teleporting.current = true
        const fromRoomId = useStore.getState().currentRoomId
        loadRoom(sd.targetRoomId, sd.targetRoomName).then(() => {
          const { specialDoors: tDoors, outerSpecialDoors: tOuterDoors } = useStore.getState()
          const returnDoor = [...tDoors, ...tOuterDoors].find(d => d.targetRoomId === fromRoomId)
          if (returnDoor) {
            const { face: rf, j: rj } = decodeWallId(returnDoor.anchorId, targetConfig)
            const rx = targetConfig.gx / 2
            const rz = targetConfig.gz / 2
            let sx, sz
            if      (rf === 0) { sx = rj - rx + 1; sz = -rz + 2 }
            else if (rf === 1) { sx = rj - rx + 1; sz =  rz - 2 }
            else if (rf === 2) { sx = -rx + 2;     sz = rj - rz + 1 }
            else               { sx =  rx - 2;     sz = rj - rz + 1 }
            flyY.current = GROUND_Y; flyVelocityY.current = 0; isFalling.current = false
            state.camera.position.set(sx, GROUND_Y, sz)
          } else {
            flyY.current = GROUND_Y; flyVelocityY.current = 0; isFalling.current = false
            state.camera.position.set(spawnX, GROUND_Y, spawnZ)
          }
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

  return <PointerLockControls enabled={!activeModal && !canvasEditorOpen} />
}
