import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useStore } from '../store/useStore'
import * as THREE from 'three'

const GRID_SIZE = 40
const WALL_HEIGHT = 5
const TILE_SIZE = 1
const COUNT = GRID_SIZE * WALL_HEIGHT * 4
const DEFAULT_COLOR = new THREE.Color('#cccccc')
const HOVER_COLOR = new THREE.Color('#00f2ff')
const OFFSET = (GRID_SIZE / 2) * TILE_SIZE

// Verilen instanceId için konumu ve rotasyonu hesaplar
function applyInstanceTransform(id, tempObj, scale = 1) {
  const h    = Math.floor(id / (GRID_SIZE * 4))
  const j    = Math.floor((id % (GRID_SIZE * 4)) / 4)
  const face = id % 4
  const y    = h * TILE_SIZE + TILE_SIZE / 2
  const pos  = j * TILE_SIZE - OFFSET + TILE_SIZE / 2

  tempObj.scale.set(scale, scale, scale)

  switch (face) {
    case 0: tempObj.position.set(pos,    y, -OFFSET); tempObj.rotation.set(0, 0,            0); break
    case 1: tempObj.position.set(pos,    y,  OFFSET); tempObj.rotation.set(0, Math.PI,      0); break
    case 2: tempObj.position.set(-OFFSET, y, pos);    tempObj.rotation.set(0, Math.PI / 2,  0); break
    case 3: tempObj.position.set( OFFSET, y, pos);    tempObj.rotation.set(0, -Math.PI / 2, 0); break
    default: break
  }
  tempObj.updateMatrix()
}

export function Walls() {
  const { setHoveredTile, hiddenWalls } = useStore()
  const meshRef = useRef()
  const hoveredRef = useRef(-1)
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const hiddenSet = useMemo(() => new Set(hiddenWalls), [hiddenWalls])

  const texture = useTexture('/textures/duvar.png')
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16

  const tempObj = useMemo(() => new THREE.Object3D(), [])

  // Tek seferlik kurulum: tüm tile'ları yerleştir
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    let i = 0

    for (let h = 0; h < WALL_HEIGHT; h++) {
      const y = h * TILE_SIZE + TILE_SIZE / 2
      for (let j = 0; j < GRID_SIZE; j++) {
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

  // Kapı güncellemesi: hiddenWalls değiştiğinde sadece ilgili tile'ları güncelle
  useEffect(() => {
    if (!readyRef.current) return
    const mesh = meshRef.current
    if (!mesh) return

    // Önceki gizli tile'ları geri getir (tüm tile'lar için gereksiz yapmamak adına
    // sadece count aralığındaki tüm ID'leri normalize ederek yeniden uygula)
    // En basit yol: hiddenWalls içinde olmayan ve önceden gizlenmiş olabilecek ID'leri bulmak yerine
    // tüm ID'leri restore edip sonra yeni gizlenecekleri hide etmek.
    for (let id = 0; id < COUNT; id++) {
      applyInstanceTransform(id, tempObj, 1)
      mesh.setMatrixAt(id, tempObj.matrix)
    }

    // Kapı tile'larını gizle
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
  }, [hiddenWalls, tempObj])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh || !readyRef.current) return

    state.raycaster.setFromCamera({ x: 0, y: 0 }, state.camera)
    const intersects = state.raycaster.intersectObject(mesh)
    const rawHit = intersects.length > 0 ? intersects[0].instanceId : -1
    // Gizli (kapı) tile'larını hover'dan dışla
    const hit = rawHit >= 0 && hiddenSet.has(rawHit) ? -1 : rawHit

    if (hoveredRef.current === hit) return

    // Reset previously hovered wall
    if (hoveredRef.current >= 0 && mesh.instanceColor) {
      mesh.setColorAt(hoveredRef.current, DEFAULT_COLOR)
    }

    // Apply to newly hovered wall
    if (hit >= 0) {
      if (mesh.instanceColor) mesh.setColorAt(hit, HOVER_COLOR)

      const mat = new THREE.Matrix4()
      mesh.getMatrixAt(hit, mat)
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      mat.decompose(pos, quat, new THREE.Vector3())

      // Push slightly along wall normal so media sits on the surface
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
