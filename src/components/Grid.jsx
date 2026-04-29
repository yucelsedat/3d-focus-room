import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useStore } from '../store/useStore'
import { ROOM_CONFIGS } from '../utils/roomConfig'
import * as THREE from 'three'

const OUTDOOR_SIZE = 400

export function OutdoorFloor() {
  const texture = useTexture('/textures/grass.png', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(OUTDOOR_SIZE / 4, OUTDOOR_SIZE / 4)
    t.anisotropy = 16
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[OUTDOOR_SIZE, OUTDOOR_SIZE]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}

const TILE_SIZE = 1
const DEFAULT_COLOR = new THREE.Color('#cccccc')
const HOVER_COLOR = new THREE.Color('#00f2ff')

function GridInner({ gx, gz, floorTexture }) {
  const setHoveredTile = useStore((state) => state.setHoveredTile)
  const meshRef = useRef()
  const hoveredRef = useRef(-1)
  const [ready, setReady] = useState(false)
  const COUNT = gx * gz

  const texture = useTexture(`/textures/${floorTexture}`, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 16
  })

  const tempObj = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    let i = 0
    for (let x = 0; x < gx; x++) {
      for (let z = 0; z < gz; z++) {
        tempObj.position.set(
          x * TILE_SIZE - gx / 2 + TILE_SIZE / 2,
          0,
          z * TILE_SIZE - gz / 2 + TILE_SIZE / 2
        )
        tempObj.rotation.set(-Math.PI / 2, 0, 0)
        tempObj.updateMatrix()
        mesh.setMatrixAt(i, tempObj.matrix)
        mesh.setColorAt(i, DEFAULT_COLOR)
        i++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    setReady(true)
  }, [tempObj, gx, gz])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh || !ready) return

    state.raycaster.setFromCamera({ x: 0, y: 0 }, state.camera)
    const intersects = state.raycaster.intersectObject(mesh)
    const hit = intersects.length > 0 ? intersects[0].instanceId : -1

    if (hoveredRef.current === hit) return

    if (hoveredRef.current >= 0) {
      mesh.setColorAt(hoveredRef.current, DEFAULT_COLOR)
    }

    if (hit >= 0) {
      mesh.setColorAt(hit, HOVER_COLOR)

      const mat = new THREE.Matrix4()
      mesh.getMatrixAt(hit, mat)
      const pos = new THREE.Vector3()
      mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3())

      setHoveredTile({
        id: hit,
        position: [pos.x, pos.y + 0.01, pos.z],
        rotation: [-Math.PI / 2, 0, 0],
      })
    } else {
      const stored = useStore.getState().hoveredTile
      if (stored && typeof stored.id === 'number') {
        setHoveredTile(null)
      }
    }

    hoveredRef.current = hit
    mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, COUNT]} visible={ready}>
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

export function Grid() {
  const floorTexture   = useStore((state) => state.floorTexture)
  const currentRoomType = useStore((state) => state.currentRoomType)
  const config = ROOM_CONFIGS[currentRoomType] ?? ROOM_CONFIGS.room
  // key forces remount when room type changes so geometry/count reset cleanly
  return <GridInner key={currentRoomType} gx={config.gx} gz={config.gz} floorTexture={floorTexture} />
}
