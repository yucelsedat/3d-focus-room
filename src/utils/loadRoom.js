import { useStore } from '../store/useStore'

export async function loadRoom(id, name) {
  const {
    setWorldMedia, setHiddenWalls, setHiddenOuterWalls, setHiddenOuterWalls2,
    setFloorTexture, setCurrentRoom, setSpecialDoors, setOuterSpecialDoors, setOuterSpecialDoors2,
    addToHistory,
  } = useStore.getState()

  const activateRes = await fetch(`/api/rooms/${id}/activate`, { method: 'POST' })
  const { room: activatedRoom } = await activateRes.json()
  const roomType = activatedRoom?.roomType ?? 'room'

  const [media, doors, floor, specialDoors] = await Promise.all([
    fetch('/api/media').then(r => r.json()),
    fetch('/api/doors').then(r => r.json()),
    fetch('/api/floor').then(r => r.json()),
    fetch('/api/special-doors').then(r => r.json()),
  ])

  const innerDoors  = doors.filter(d => d.layer === 0).map(d => d.id)
  const outerDoors  = doors.filter(d => d.layer === 1).map(d => d.id)
  const outer2Doors = doors.filter(d => d.layer === 2).map(d => d.id)

  const innerSpecial  = specialDoors.filter(sd => sd.layer === 0)
  const outerSpecial  = specialDoors.filter(sd => sd.layer === 1)
  const outer2Special = specialDoors.filter(sd => sd.layer === 2)

  setWorldMedia(media)
  setHiddenWalls([...innerDoors, ...innerSpecial.flatMap(sd => sd.instanceIds)])
  setHiddenOuterWalls([...outerDoors, ...outerSpecial.flatMap(sd => sd.instanceIds)])
  setHiddenOuterWalls2([...outer2Doors, ...outer2Special.flatMap(sd => sd.instanceIds)])
  setFloorTexture(floor.texture)
  setSpecialDoors(innerSpecial)
  setOuterSpecialDoors(outerSpecial)
  setOuterSpecialDoors2(outer2Special)
  setCurrentRoom(id, name, roomType)
  addToHistory(id, name)

  localStorage.setItem('lastRoomId', id)
  localStorage.setItem('lastRoomName', name)
}
