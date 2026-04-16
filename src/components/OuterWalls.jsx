import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useStore } from '../store/useStore'
import * as THREE from 'three'

const OUTER_GRID_SIZE = 120   // -60 ile +60 arası: 120 tile
const WALL_HEIGHT     = 5
const TILE_SIZE       = 1
const COUNT           = OUTER_GRID_SIZE * WALL_HEIGHT * 4  // 2400
const OFFSET          = 60   // OUTER_LIMIT ile aynı
const DEFAULT_COLOR   = new THREE.Color('#aaaaaa')
const HOVER_COLOR     = new THREE.Color('#00f2ff')

export function OuterWalls() {
  const { setHoveredTile } = useStore()
  const meshRef    = useRef()
  const hoveredRef = useRef(-1)
  const readyRef   = useRef(false)
  const [ready, setReady] = useState(false)

  const texture = useTexture('/textures/duvar.png')
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16

  const tempObj = useMemo(() => new THREE.Object3D(), [])

  // Tek seferlik kurulum
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    let i = 0
    for (let h = 0; h < WALL_HEIGHT; h++) {
      const y = h * TILE_SIZE + TILE_SIZE / 2
      for (let j = 0; j < OUTER_GRID_SIZE; j++) {
        const pos = j * TILE_SIZE - OFFSET + TILE_SIZE / 2
        const placements = [
          [pos,     y, -OFFSET, 0],
          [pos,     y,  OFFSET, Math.PI],
          [-OFFSET, y,  pos,    Math.PI / 2],
          [ OFFSET, y,  pos,   -Math.PI / 2],
        ]
        for (const [x, py, z, rotY] of placements) {
          tempObj.position.set(x, py, z)
          tempObj.rotation.set(0, rotY, 0)
          tempObj.scale.set(1, 1, 1)
          tempObj.updateMatrix()
          mesh.setMatrixAt(i, tempObj.matrix)
          mesh.setColorAt(i, DEFAULT_COLOR)
          i++
        }
      }
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    readyRef.current = true
    setReady(true)
  }, [tempObj])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh || !readyRef.current) return

    state.raycaster.setFromCamera({ x: 0, y: 0 }, state.camera)
    const intersects = state.raycaster.intersectObject(mesh)
    const hit = intersects.length > 0 ? intersects[0].instanceId : -1

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
