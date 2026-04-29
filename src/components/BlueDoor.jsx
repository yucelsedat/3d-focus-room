import { useStore } from '../store/useStore'
import { ROOM_CONFIGS, decodeWallId } from '../utils/roomConfig'

const TILE_SIZE = 1
const OUTER_CONFIG = { gx: 120, gz: 120, wh: 5 }

function doorWorldPos(anchorId, config) {
  const { gx, gz } = config
  const { face, j } = decodeWallId(anchorId, config)
  const offsetX = gx / 2
  const offsetZ = gz / 2
  const posAlongX = j - offsetX + TILE_SIZE
  const posAlongZ = j - offsetZ + TILE_SIZE
  const y = 1.5
  switch (face) {
    case 0: return { position: [posAlongX, y, -offsetZ], rotation: [0, 0,           0] }
    case 1: return { position: [posAlongX, y,  offsetZ], rotation: [0, Math.PI,     0] }
    case 2: return { position: [-offsetX,  y, posAlongZ], rotation: [0, Math.PI / 2, 0] }
    case 3: return { position: [ offsetX,  y, posAlongZ], rotation: [0,-Math.PI / 2, 0] }
    default: return { position: [0, y, 0], rotation: [0, 0, 0] }
  }
}

export function BlueDoors() {
  const specialDoors      = useStore(s => s.specialDoors)
  const outerSpecialDoors = useStore(s => s.outerSpecialDoors)
  const currentRoomType   = useStore(s => s.currentRoomType)
  const innerConfig = ROOM_CONFIGS[currentRoomType] ?? ROOM_CONFIGS.room

  return (
    <>
      {specialDoors.map(sd => {
        const { position, rotation } = doorWorldPos(sd.anchorId, innerConfig)
        return (
          <mesh key={`inner-${sd.id}`} position={position} rotation={rotation}>
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
      {outerSpecialDoors.map(sd => {
        const { position, rotation } = doorWorldPos(sd.anchorId, OUTER_CONFIG)
        return (
          <mesh key={`outer-${sd.id}`} position={position} rotation={rotation}>
            <planeGeometry args={[2, 3]} />
            <meshStandardMaterial
              color="#8b5cf6"
              transparent
              opacity={0.55}
              emissive="#6d28d9"
              emissiveIntensity={0.4}
              side={2}
            />
          </mesh>
        )
      })}
    </>
  )
}
