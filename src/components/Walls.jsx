import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useStore } from '../store/useStore'
import { ROOM_CONFIGS, decodeWallId, encodeWallId, wallTileCount } from '../utils/roomConfig'
import * as THREE from 'three'

const TILE_SIZE = 1
const DEFAULT_COLOR = new THREE.Color('#cccccc')
const HOVER_COLOR = new THREE.Color('#00f2ff')

// Verilen instanceId için konumu ve rotasyonu hesaplar (hem kare hem dikdörtgen config)
function applyInstanceTransform(id, config, tempObj, scale = 1) {
  const { gx, gz } = config
  const { h, face, j } = decodeWallId(id, config)
  const y       = h * TILE_SIZE + TILE_SIZE / 2
  const OFFSET_X = gx / 2
  const OFFSET_Z = gz / 2

  tempObj.scale.set(scale, scale, scale)

  switch (face) {
    case 0: // North (z = -gz/2)
      tempObj.position.set(j * TILE_SIZE - OFFSET_X + TILE_SIZE / 2, y, -OFFSET_Z)
      tempObj.rotation.set(0, 0, 0)
      break
    case 1: // South (z = +gz/2)
      tempObj.position.set(j * TILE_SIZE - OFFSET_X + TILE_SIZE / 2, y, OFFSET_Z)
      tempObj.rotation.set(0, Math.PI, 0)
      break
    case 2: // West (x = -gx/2)
      tempObj.position.set(-OFFSET_X, y, j * TILE_SIZE - OFFSET_Z + TILE_SIZE / 2)
      tempObj.rotation.set(0, Math.PI / 2, 0)
      break
    case 3: // East (x = +gx/2)
      tempObj.position.set(OFFSET_X, y, j * TILE_SIZE - OFFSET_Z + TILE_SIZE / 2)
      tempObj.rotation.set(0, -Math.PI / 2, 0)
      break
    default: break
  }
  tempObj.updateMatrix()
}

function WallsInner({ config, hiddenWalls }) {
  const { setHoveredTile } = useStore()
  const meshRef    = useRef()
  const hoveredRef = useRef(-1)
  const readyRef   = useRef(false)
  const [ready, setReady] = useState(false)
  const COUNT    = wallTileCount(config)
  const hiddenSet = useMemo(() => new Set(hiddenWalls), [hiddenWalls])

  const texture = useTexture('/textures/duvar.png')
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16

  const tempObj = useMemo(() => new THREE.Object3D(), [])

  // İlk kurulum: tüm tile'ları yerleştir
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    for (let id = 0; id < COUNT; id++) {
      applyInstanceTransform(id, config, tempObj, 1)
      mesh.setMatrixAt(id, tempObj.matrix)
      mesh.setColorAt(id, DEFAULT_COLOR)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    readyRef.current = true
    setReady(true)
  }, [tempObj, COUNT, config])

  // Kapı güncellemesi
  useEffect(() => {
    if (!readyRef.current) return
    const mesh = meshRef.current
    if (!mesh) return

    for (let id = 0; id < COUNT; id++) {
      applyInstanceTransform(id, config, tempObj, 1)
      mesh.setMatrixAt(id, tempObj.matrix)
    }

    hiddenWalls.forEach(id => {
      if (id < 0 || id >= COUNT) return
      tempObj.position.set(0, -9999, 0)
      tempObj.scale.set(0, 0, 0)
      tempObj.rotation.set(0, 0, 0)
      tempObj.updateMatrix()
      mesh.setMatrixAt(id, tempObj.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [hiddenWalls, tempObj, COUNT, config])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh || !readyRef.current) return

    state.raycaster.setFromCamera({ x: 0, y: 0 }, state.camera)
    const intersects = state.raycaster.intersectObject(mesh)
    const rawHit = intersects.length > 0 ? intersects[0].instanceId : -1
    const hit = rawHit >= 0 && hiddenSet.has(rawHit) ? -1 : rawHit

    if (hoveredRef.current === hit) return

    if (hoveredRef.current >= 0 && mesh.instanceColor) {
      mesh.setColorAt(hoveredRef.current, DEFAULT_COLOR)
    }

    if (hit >= 0) {
      if (mesh.instanceColor) mesh.setColorAt(hit, HOVER_COLOR)

      const mat = new THREE.Matrix4()
      mesh.getMatrixAt(hit, mat)
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      mat.decompose(pos, quat, new THREE.Vector3())

      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat)
      pos.add(normal.multiplyScalar(0.01))

      setHoveredTile({
        id: `wall-${hit}`,
        position: pos.toArray(),
        rotation: new THREE.Euler().setFromQuaternion(quat).toArray(),
      })
    } else {
      const stored = useStore.getState().hoveredTile
      if (stored && typeof stored.id === 'string' && stored.id.startsWith('wall-')) {
        setHoveredTile(null)
      }
    }

    hoveredRef.current = hit
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, COUNT]} visible={ready}>
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

export function Walls() {
  const hiddenWalls    = useStore((state) => state.hiddenWalls)
  const currentRoomType = useStore((state) => state.currentRoomType)
  const config = ROOM_CONFIGS[currentRoomType] ?? ROOM_CONFIGS.room
  // key forces remount when room type changes so instance count resets cleanly
  return <WallsInner key={currentRoomType} config={config} hiddenWalls={hiddenWalls} />
}
