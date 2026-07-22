import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useStore } from '../store/useStore'
import { ROOM_CONFIGS } from '../utils/roomConfig'
import * as THREE from 'three'

const OUTDOOR_SIZE = 400

export function OutdoorFloor() {
  const floorTexture = useStore((state) => state.floorTexture)
  // Oda zemini (Grid) drei'nin useTexture cache'iyle URL bazında texture paylaşır.
  // O objenin repeat'ini mutate edersek oda zemini de bozulur; bu yüzden dış zemin
  // KENDİ bağımsız texture'ını yükler. Oda ile aynı görsel, ama her birim = 1 tile
  // olacak şekilde tile'lanır (oda grid'i ile hizalı).
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(`/textures/${floorTexture}`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(OUTDOOR_SIZE, OUTDOOR_SIZE)
    t.anisotropy = 4
    return t
  }, [floorTexture])
  useEffect(() => () => texture.dispose(), [texture])
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
  const lastRayRef = useRef(0)
  const [ready, setReady] = useState(false)
  const COUNT = gx * gz

  const texture = useTexture(`/textures/${floorTexture}`, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, 1)   // her tile 1×1: texture'ı bir kez göster (paylaşılan obje bozulmuşsa sıfırla)
    t.anisotropy = 4
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

    // Hover raycast'ini ~20fps'e throttle et — her karede tüm tile'lara
    // ray atmak CPU'yu sürekli yakar; hover/edit için bu hassasiyet fazlasıyla yeter
    if (state.clock.elapsedTime - lastRayRef.current < 0.05) return
    lastRayRef.current = state.clock.elapsedTime

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
