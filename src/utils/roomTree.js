// Oda ağacı yardımcıları — store'daki `rooms` listesi (serializeRoom şekli:
// { id, name, parent: {id,name}|null, children: [...] }) üzerinde çalışır.

// Kökten başlayarak odanın atalarını döndürür: [{ id, name }] (oda kendisi hariç)
export function getAncestors(rooms, currentId) {
  const ancestors = []
  let id = currentId
  const visited = new Set()
  while (true) {
    if (visited.has(id)) break
    visited.add(id)
    const room = rooms.find(r => r.id === id)
    if (!room?.parent) break
    ancestors.unshift({ id: room.parent.id, name: room.parent.name })
    id = room.parent.id
  }
  return ancestors
}

// En üstteki ata (kök oda); oda zaten kökse kendisi
export function getRootRoom(rooms, currentId) {
  const ancestors = getAncestors(rooms, currentId)
  if (ancestors.length) return ancestors[0]
  const self = rooms.find(r => r.id === currentId)
  return self ? { id: self.id, name: self.name } : { id: currentId, name: '' }
}
