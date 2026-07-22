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
const OUTER_CONFIG    = { gx: 60, gz: 60, wh: 6 }
const OUTER_OFFSET    = 30
const OUTER2_CONFIG   = { gx: 80, gz: 80, wh: 6 }
const OUTER2_OFFSET   = 40
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

function canPassThroughRing(hiddenSet, face, posAlongWall, config, offset) {
  const j = Math.floor(posAlongWall + offset)
  for (let h = 1; h <= 2; h++) {
    if (j >= 0 && j < config.gx) {
      if (hiddenSet.has(encodeWallId(h, face, j, config))) return true
    }
  }
  return false
}

// Bir kare bahçe duvarı halkası için çarpışma; kapı (hidden tile) varsa geçirir.
// Güncellenmiş [nx, nz] döndürür.
function applyRingCollision(prev, nx, nz, hiddenSet, config, offset) {
  if (prev.z > -offset && nz <= -offset && !canPassThroughRing(hiddenSet, 0, nx, config, offset)) nz = -offset + 0.01
  if (prev.z < -offset && nz >= -offset && !canPassThroughRing(hiddenSet, 0, nx, config, offset)) nz = -offset - 0.01
  if (prev.z <  offset && nz >=  offset && !canPassThroughRing(hiddenSet, 1, nx, config, offset)) nz =  offset - 0.01
  if (prev.z >  offset && nz <=  offset && !canPassThroughRing(hiddenSet, 1, nx, config, offset)) nz =  offset + 0.01
  if (prev.x > -offset && nx <= -offset && !canPassThroughRing(hiddenSet, 2, nz, config, offset)) nx = -offset + 0.01
  if (prev.x < -offset && nx >= -offset && !canPassThroughRing(hiddenSet, 2, nz, config, offset)) nx = -offset - 0.01
  if (prev.x <  offset && nx >=  offset && !canPassThroughRing(hiddenSet, 3, nz, config, offset)) nx =  offset - 0.01
  if (prev.x >  offset && nx <=  offset && !canPassThroughRing(hiddenSet, 3, nz, config, offset)) nx =  offset + 0.01
  return [nx, nz]
}

export function Player() {
  const activeModal        = useStore((state) => state.activeModal)
  const canvasEditorOpen   = useStore((state) => state.canvasEditorOpen)
  const hiddenWalls        = useStore((state) => state.hiddenWalls)
  const hiddenOuterWalls   = useStore((state) => state.hiddenOuterWalls)
  const hiddenOuterWalls2  = useStore((state) => state.hiddenOuterWalls2)
  const specialDoors       = useStore((state) => state.specialDoors)
  const outerSpecialDoors  = useStore((state) => state.outerSpecialDoors)
  const outerSpecialDoors2 = useStore((state) => state.outerSpecialDoors2)
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

  const hiddenSetRef          = useRef(new Set())
  const hiddenOuterSetRef     = useRef(new Set())
  const hiddenOuter2SetRef    = useRef(new Set())
  const teleporting           = useRef(false)
  const specialDoorsRef       = useRef([])
  const outerSpecialDoorsRef  = useRef([])
  const outerSpecial2DoorsRef = useRef([])
  const currentRoomTypeRef   = useRef('room')
  const roomsRef             = useRef([])

  const flyY             = useRef(GROUND_Y)
  const flyVelocityY     = useRef(0)
  const isFalling        = useRef(false)
  const lastSpaceTime    = useRef(0)
  const prevSpacePressed = useRef(false)

  useFrame((state, delta) => {
    if (teleporting.current || isTyping()) return

    hiddenSetRef.current         = new Set(hiddenWalls)
    hiddenOuterSetRef.current    = new Set(hiddenOuterWalls)
    hiddenOuter2SetRef.current   = new Set(hiddenOuterWalls2)
    specialDoorsRef.current      = specialDoors
    outerSpecialDoorsRef.current = outerSpecialDoors
    outerSpecial2DoorsRef.current = outerSpecialDoors2
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

    // --- 1. bahçe duvarı (±30) collision ---
    if (flyY.current <= OUTER_CONFIG.wh + GROUND_Y) {
      [nx, nz] = applyRingCollision(prev, nx, nz, hiddenOuterSetRef.current, OUTER_CONFIG, OUTER_OFFSET)
    }
    // --- 2. bahçe duvarı (±40) collision ---
    if (flyY.current <= OUTER2_CONFIG.wh + GROUND_Y) {
      [nx, nz] = applyRingCollision(prev, nx, nz, hiddenOuter2SetRef.current, OUTER2_CONFIG, OUTER2_OFFSET)
    }

    // --- Bahçe duvarı özel kapı geçişi (her iki halka) ---
    // Verilen halkanın özel kapılarından biri geçildiyse teleport başlatır; true dönerse çık.
    const tryOuterTeleport = (doors, config, offset) => {
      for (const sd of doors) {
        const { face, j } = decodeWallId(sd.anchorId, config)

        const targetRoom   = roomsRef.current.find(r => r.id === sd.targetRoomId)
        const targetConfig = ROOM_CONFIGS[targetRoom?.roomType] ?? ROOM_CONFIGS.room
        const tOffX = targetConfig.gx / 2
        const tOffZ = targetConfig.gz / 2

        let crossed = false
        let spawnX = 0, spawnZ = 0

        if (face === 0 && prev.z > -offset && nz <= -offset) {
          const pj = Math.floor(nx + offset)
          if (pj === j || pj === j + 1) { crossed = true; spawnX = Math.max(-tOffX + 1, Math.min(tOffX - 1, nx)); spawnZ = tOffZ - 2 }
        }
        if (face === 1 && prev.z < offset && nz >= offset) {
          const pj = Math.floor(nx + offset)
          if (pj === j || pj === j + 1) { crossed = true; spawnX = Math.max(-tOffX + 1, Math.min(tOffX - 1, nx)); spawnZ = -(tOffZ - 2) }
        }
        if (face === 2 && prev.x > -offset && nx <= -offset) {
          const pj = Math.floor(nz + offset)
          if (pj === j || pj === j + 1) { crossed = true; spawnX = tOffX - 2; spawnZ = Math.max(-tOffZ + 1, Math.min(tOffZ - 1, nz)) }
        }
        if (face === 3 && prev.x < offset && nx >= offset) {
          const pj = Math.floor(nz + offset)
          if (pj === j || pj === j + 1) { crossed = true; spawnX = -(tOffX - 2); spawnZ = Math.max(-tOffZ + 1, Math.min(tOffZ - 1, nz)) }
        }

        if (crossed) {
          teleporting.current = true
          const fromRoomId = useStore.getState().currentRoomId
          loadRoom(sd.targetRoomId, sd.targetRoomName).then(() => {
            const st = useStore.getState()
            const returnDoor = [...st.specialDoors, ...st.outerSpecialDoors, ...st.outerSpecialDoors2]
              .find(d => d.targetRoomId === fromRoomId)
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
          return true
        }
      }
      return false
    }

    if (tryOuterTeleport(outerSpecialDoorsRef.current,  OUTER_CONFIG,  OUTER_OFFSET))  return
    if (tryOuterTeleport(outerSpecial2DoorsRef.current, OUTER2_CONFIG, OUTER2_OFFSET)) return

    nx = Math.max(-FAR_LIMIT, Math.min(FAR_LIMIT, nx))
    nz = Math.max(-FAR_LIMIT, Math.min(FAR_LIMIT, nz))

    state.camera.position.x = nx
    state.camera.position.z = nz
  })

  return <PointerLockControls enabled={!activeModal && !canvasEditorOpen} />
}
