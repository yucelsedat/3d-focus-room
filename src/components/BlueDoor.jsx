import { useStore } from '../store/useStore'

const TILE_SIZE = 1

function doorWorldPos(anchorId, isOuter = false) {
  const gridSize   = isOuter ? 120 : 40
  const wallOffset = isOuter ? 60  : 20
  const face = anchorId % 4
  const j    = Math.floor((anchorId % (gridSize * 4)) / 4)
  const pos  = j - wallOffset + TILE_SIZE / 2 + TILE_SIZE / 2
  const y    = 1.5
  switch (face) {
    case 0: return { position: [pos, y, -wallOffset], rotation: [0, 0,            0] }
    case 1: return { position: [pos, y,  wallOffset], rotation: [0, Math.PI,      0] }
    case 2: return { position: [-wallOffset, y, pos], rotation: [0, Math.PI / 2,  0] }
    case 3: return { position: [ wallOffset, y, pos], rotation: [0,-Math.PI / 2,  0] }
    default: return { position: [0, y, 0], rotation: [0, 0, 0] }
  }
}

export function BlueDoors() {
  const specialDoors      = useStore(s => s.specialDoors)
  const outerSpecialDoors = useStore(s => s.outerSpecialDoors)

  return (
    <>
      {specialDoors.map(sd => {
        const { position, rotation } = doorWorldPos(sd.anchorId, false)
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
        const { position, rotation } = doorWorldPos(sd.anchorId, true)
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
