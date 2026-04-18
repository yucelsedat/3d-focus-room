import { useStore } from '../store/useStore'

const GRID_SIZE  = 40
const WALL_OFFSET = 20
const TILE_SIZE  = 1

function doorWorldPos(anchorId) {
  const face = anchorId % 4
  const j    = Math.floor((anchorId % (GRID_SIZE * 4)) / 4)
  // 2-tile-wide door center: j*1 - 20 + 0.5 + 0.5 = j - 19
  const pos  = j - WALL_OFFSET + TILE_SIZE
  const y    = 1.5  // center of 3-tile-tall door (h=0,1,2 at y=0.5,1.5,2.5)
  switch (face) {
    case 0: return { position: [pos, y, -WALL_OFFSET], rotation: [0, 0, 0] }
    case 1: return { position: [pos, y,  WALL_OFFSET], rotation: [0, Math.PI, 0] }
    case 2: return { position: [-WALL_OFFSET, y, pos], rotation: [0, Math.PI / 2, 0] }
    case 3: return { position: [ WALL_OFFSET, y, pos], rotation: [0, -Math.PI / 2, 0] }
    default: return { position: [0, y, 0], rotation: [0, 0, 0] }
  }
}

export function BlueDoors() {
  const specialDoors = useStore(s => s.specialDoors)

  return (
    <>
      {specialDoors.map(sd => {
        const { position, rotation } = doorWorldPos(sd.anchorId)
        return (
          <mesh key={sd.id} position={position} rotation={rotation}>
            <planeGeometry args={[2, 3]} />
            <meshStandardMaterial
              color="#3b82f6"
              transparent
              opacity={0.55}
              emissive="#1d4ed8"
              emissiveIntensity={0.4}
              side={2}
            />
          </mesh>
        )
      })}
    </>
  )
}
