import * as THREE from 'three'

// Senkron canvas'taki oda linkiyle gidilen odada aynı grubun üyesi varsa oyuncu
// onun tam önüne ışınlanır: canvas merkezinin karşısında, yüzeyden SPAWN_DIST tile
// uzakta, zeminde ve canvas'a bakarak.
export const SPAWN_DIST = 5

// media: worldMedia satırı ({ position, rotation, width, height }) →
// { pos: [x, z], look: [x, y, z] } | null (zemin/tavana yatık canvas'ta yön yok)
export function spawnInFrontOf(media) {
  const [px, py, pz] = media.position
  const [rx, ry, rz, order] = media.rotation
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order || 'XYZ'))
  // MediaOverlay: içerik group(position, rotation) içinde ((w-1)/2, (h-1)/2) kadar kaydırılır
  const center = new THREE.Vector3((media.width - 1) / 2, (media.height - 1) / 2, 0).applyQuaternion(q).add(new THREE.Vector3(px, py, pz))
  // ön yüz yerel +Z (CanvasMesh'teki <Html> z=+0.01'de)
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
  normal.y = 0
  if (normal.lengthSq() < 1e-6) return null
  normal.normalize()
  return {
    pos: [center.x + normal.x * SPAWN_DIST, center.z + normal.z * SPAWN_DIST],
    look: [center.x, center.y, center.z],
  }
}

// Hedef odadaki aynı senkron gruptan ilk canvas (kaynağın kendisi hariç)
export function findSyncTarget(worldMedia, syncGroupId, fromId) {
  return worldMedia.find(m => m.type === 'canvas' && m.syncGroupId === syncGroupId && m.id !== fromId) || null
}
