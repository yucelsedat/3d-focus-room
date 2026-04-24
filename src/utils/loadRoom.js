import { useStore } from '../store/useStore'

export async function loadRoom(id, name) {
  const {
    setWorldMedia, setHiddenWalls, setHiddenOuterWalls,
    setFloorTexture, setCurrentRoom, setSpecialDoors, setOuterSpecialDoors,
  } = useStore.getState()

  await fetch(`/api/rooms/${id}/activate`, { method: 'POST' })
  const [media, doors, floor, specialDoors] = await Promise.all([
    fetch('/api/media').then(r => r.json()),
    fetch('/api/doors').then(r => r.json()),
    fetch('/api/floor').then(r => r.json()),
    fetch('/api/special-doors').then(r => r.json()),
  ])

  const innerDoors = doors.filter(d => !d.isOuter).map(d => d.id)
  const outerDoors = doors.filter(d =>  d.isOuter).map(d => d.id)

  const innerSpecial = specialDoors.filter(sd => !sd.isOuter)
  const outerSpecial = specialDoors.filter(sd =>  sd.isOuter)

  setWorldMedia(media)
  setHiddenWalls([...innerDoors, ...innerSpecial.flatMap(sd => sd.instanceIds)])
  setHiddenOuterWalls([...outerDoors, ...outerSpecial.flatMap(sd => sd.instanceIds)])
  setFloorTexture(floor.texture)
  setSpecialDoors(innerSpecial)
  setOuterSpecialDoors(outerSpecial)
  setCurrentRoom(id, name)
}
