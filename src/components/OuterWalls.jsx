import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useStore } from '../store/useStore'
import * as THREE from 'three'

const OUTER_GRID_SIZE = 120
const WALL_HEIGHT     = 5
const TILE_SIZE       = 1
const COUNT           = OUTER_GRID_SIZE * WALL_HEIGHT * 4  // 2400
const OFFSET          = 60
const DEFAULT_COLOR   = new THREE.Color('#aaaaaa')
const HOVER_COLOR     = new THREE.Color('#00f2ff')

function applyOuterInstanceTransform(id, tempObj, scale = 1) {
  const h    = Math.floor(id / (OUTER_GRID_SIZE * 4))
  const j    = Math.floor((id % (OUTER_GRID_SIZE * 4)) / 4)
  const face = id % 4
  const y    = h * TILE_SIZE + TILE_SIZE / 2
  const pos  = j * TILE_SIZE - OFFSET + TILE_SIZE / 2

  tempObj.scale.set(scale, scale, scale)
  switch (face) {
    case 0: tempObj.position.set(pos,    y, -OFFSET); tempObj.rotation.set(0, 0,              0); break
    case 1: tempObj.position.set(pos,    y,  OFFSET); tempObj.rotation.set(0, Math.PI,        0); break
    case 2: tempObj.position.set(-OFFSET, y, pos);    tempObj.rotation.set(0, Math.PI / 2,    0); break
    case 3: tempObj.position.set( OFFSET, y, pos);    tempObj.rotation.set(0, -Math.PI / 2,   0); break
  }
  tempObj.updateMatrix()
}

export function OuterWalls() {
  const { setHoveredTile, hiddenOuterWalls } = useStore()
  const meshRef    = useRef()
  const hoveredRef = useRef(-1)
  const readyRef   = useRef(false)
  const [ready, setReady] = useState(false)

  const texture = useTexture('/textures/duvar.png')
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16

  const tempObj = useMemo(() => new THREE.Object3D(), [])
  const hiddenSet = useMemo(() => new Set(hiddenOuterWalls), [hiddenOuterWalls])

  // İlk kurulum
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    for (let id = 0; id < COUNT; id++) {
      applyOuterInstanceTransform(id, tempObj, 1)
      mesh.setMatrixAt(id, tempObj.matrix)
      mesh.setColorAt(id, DEFAULT_COLOR)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    readyRef.current = true
    setReady(true)
  }, [tempObj])

  // Gizli tile'ları güncelle
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !readyRef.current) return

    for (let id = 0; id < COUNT; id++) {
      applyOuterInstanceTransform(id, tempObj, 1)
      mesh.setMatrixAt(id, tempObj.matrix)
    }
    hiddenOuterWalls.forEach(id => {
      if (id < 0 || id >= COUNT) return
      tempObj.position.set(0, -9999, 0)
      tempObj.scale.set(0, 0, 0)
      tempObj.rotation.set(0, 0, 0)
      tempObj.updateMatrix()
      mesh.setMatrixAt(id, tempObj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [hiddenOuterWalls, tempObj])

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
      const pos  = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      mat.decompose(pos, quat, new THREE.Vector3())

      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat)
      pos.add(normal.multiplyScalar(0.01))

      setHoveredTile({
        id: `outer-${hit}`,
        position: pos.toArray(),
        rotation: new THREE.Euler().setFromQuaternion(quat).toArray(),
      })
    } else {
      const stored = useStore.getState().hoveredTile
      if (stored && typeof stored.id === 'string' && stored.id.startsWith('outer-')) {
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
