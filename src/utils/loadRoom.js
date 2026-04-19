import { useStore } from '../store/useStore'

export async function loadRoom(id, name) {
  const {
    setWorldMedia, setHiddenWalls, setFloorTexture,
    setCurrentRoom, setSpecialDoors,
  } = useStore.getState()

  await fetch(`/api/rooms/${id}/activate`, { method: 'POST' })
  const [media, doors, floor, specialDoors] = await Promise.all([
    fetch('/api/media').then(r => r.json()),
    fetch('/api/doors').then(r => r.json()),
    fetch('/api/floor').then(r => r.json()),
    fetch('/api/special-doors').then(r => r.json()),
  ])
  const specialIds = specialDoors.flatMap(sd => sd.instanceIds)
  setWorldMedia(media)
  setHiddenWalls([...doors, ...specialIds])
  setFloorTexture(floor.texture)
  setSpecialDoors(specialDoors)
  setCurrentRoom(id, name)
}
