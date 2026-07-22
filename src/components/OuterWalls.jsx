import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useStore } from '../store/useStore'
import * as THREE from 'three'

const WALL_HEIGHT   = 6
const TILE_SIZE     = 1
const DEFAULT_COLOR = new THREE.Color('#aaaaaa')
const HOVER_COLOR   = new THREE.Color('#00f2ff')

// İki bahçe duvarı halkası. layer 1 = oda duvarından 10 tile ileride (±30),
// layer 2 = 1. duvardan 10 tile ileride (±40).
const RINGS = [
  { idPrefix: 'outer',  gridSize: 60, offset: 30, defer: ['wall-'] },
  { idPrefix: 'outer2', gridSize: 80, offset: 40, defer: ['wall-', 'outer-'] },
]

function applyRingTransform(id, tempObj, gridSize, offset, scale = 1) {
  const h    = Math.floor(id / (gridSize * 4))
  const j    = Math.floor((id % (gridSize * 4)) / 4)
  const face = id % 4
  const y    = h * TILE_SIZE + TILE_SIZE / 2
  const pos  = j * TILE_SIZE - offset + TILE_SIZE / 2

  tempObj.scale.set(scale, scale, scale)
  switch (face) {
    case 0: tempObj.position.set(pos,     y, -offset); tempObj.rotation.set(0, 0,            0); break
    case 1: tempObj.position.set(pos,     y,  offset); tempObj.rotation.set(0, Math.PI,      0); break
    case 2: tempObj.position.set(-offset, y,  pos);    tempObj.rotation.set(0, Math.PI / 2,  0); break
    case 3: tempObj.position.set( offset, y,  pos);    tempObj.rotation.set(0, -Math.PI / 2, 0); break
  }
  tempObj.updateMatrix()
}

function OuterWallRing({ idPrefix, gridSize, offset, defer, hiddenIds }) {
  const setHoveredTile = useStore((s) => s.setHoveredTile)
  const meshRef    = useRef()
  const hoveredRef = useRef(-1)
  const readyRef   = useRef(false)
  const lastRayRef = useRef(0)
  const [ready, setReady] = useState(false)

  const COUNT     = gridSize * WALL_HEIGHT * 4
  const selfPrefix = `${idPrefix}-`

  const texture = useTexture('/textures/duvar.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
  })

  const tempObj   = useMemo(() => new THREE.Object3D(), [])
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds])

  // İlk kurulum
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    for (let id = 0; id < COUNT; id++) {
      applyRingTransform(id, tempObj, gridSize, offset, 1)
      mesh.setMatrixAt(id, tempObj.matrix)
      mesh.setColorAt(id, DEFAULT_COLOR)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    readyRef.current = true
    setReady(true)
  }, [tempObj, COUNT, gridSize, offset])

  // Gizli tile'ları güncelle
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !readyRef.current) return

    for (let id = 0; id < COUNT; id++) {
      applyRingTransform(id, tempObj, gridSize, offset, 1)
      mesh.setMatrixAt(id, tempObj.matrix)
    }
    hiddenIds.forEach(id => {
      if (id < 0 || id >= COUNT) return
      tempObj.position.set(0, -9999, 0)
      tempObj.scale.set(0, 0, 0)
      tempObj.rotation.set(0, 0, 0)
      tempObj.updateMatrix()
      mesh.setMatrixAt(id, tempObj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [hiddenIds, tempObj, COUNT, gridSize, offset])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh || !readyRef.current) return

    // Instance'lara her karede ray atmak pahalı — ~20fps'e throttle et
    if (state.clock.elapsedTime - lastRayRef.current < 0.05) return
    lastRayRef.current = state.clock.elapsedTime

    state.raycaster.setFromCamera({ x: 0, y: 0 }, state.camera)
    const intersects = state.raycaster.intersectObject(mesh)
    const rawHit = intersects.length > 0 ? intersects[0].instanceId : -1
    const hit = rawHit >= 0 && hiddenSet.has(rawHit) ? -1 : rawHit

    if (hoveredRef.current === hit) return

    if (hoveredRef.current >= 0 && mesh.instanceColor) {
      mesh.setColorAt(hoveredRef.current, DEFAULT_COLOR)
    }

    if (hit >= 0) {
      // Daha öncelikli bir duvar (iç oda / daha yakın halka) hover'daysa yazma
      const stored = useStore.getState().hoveredTile
      if (stored && typeof stored.id === 'string' && defer.some(p => stored.id.startsWith(p))) {
        hoveredRef.current = -1
        return
      }

      if (mesh.instanceColor) mesh.setColorAt(hit, HOVER_COLOR)

      const mat = new THREE.Matrix4()
      mesh.getMatrixAt(hit, mat)
      const pos  = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      mat.decompose(pos, quat, new THREE.Vector3())

      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat)
      pos.add(normal.multiplyScalar(0.01))

      setHoveredTile({
        id: `${idPrefix}-${hit}`,
        position: pos.toArray(),
        rotation: new THREE.Euler().setFromQuaternion(quat).toArray(),
      })
    } else {
      const stored = useStore.getState().hoveredTile
      if (stored && typeof stored.id === 'string' && stored.id.startsWith(selfPrefix)) {
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

export function OuterWalls() {
  const hiddenOuterWalls  = useStore((s) => s.hiddenOuterWalls)
  const hiddenOuterWalls2 = useStore((s) => s.hiddenOuterWalls2)
  const hidden = [hiddenOuterWalls, hiddenOuterWalls2]

  return (
    <>
      {RINGS.map((ring, i) => (
        <OuterWallRing key={ring.idPrefix} {...ring} hiddenIds={hidden[i]} />
      ))}
    </>
  )
}
