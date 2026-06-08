export const ROOM_CONFIGS = {
  room:  { gx: 40, gz: 40, wh: 5 },
  cadde: { gx: 60, gz: 15, wh: 5 },
}

// Square rooms use legacy j*4+face encoding for backward compat.
// Rect rooms use face-linear encoding: h * perimeter + faceStart[face] + j
export function encodeWallId(h, face, j, { gx, gz }) {
  if (gx === gz) return h * gx * 4 + j * 4 + face
  const perimeter = 2 * (gx + gz)
  const faceStarts = [0, gx, 2 * gx, 2 * gx + gz]
  return h * perimeter + faceStarts[face] + j
}

export function decodeWallId(id, { gx, gz }) {
  if (gx === gz) {
    return {
      h:    Math.floor(id / (gx * 4)),
      j:    Math.floor((id % (gx * 4)) / 4),
      face: id % 4,
    }
  }
  const perimeter = 2 * (gx + gz)
  const faceStarts = [0, gx, 2 * gx, 2 * gx + gz, perimeter]
  const h = Math.floor(id / perimeter)
  const pos = id % perimeter
  let face = 3, j = 0
  for (let f = 0; f < 4; f++) {
    if (pos < faceStarts[f + 1]) { face = f; j = pos - faceStarts[f]; break }
  }
  return { h, face, j }
}

// Returns all tile IDs that make up a 2×3 door anchored at anchorId
export function getDoorInstanceIds(anchorId, config) {
  const { gx, gz } = config
  const { face, j } = decodeWallId(anchorId, config)
  const faceWidth = face < 2 ? gx : gz
  const ids = []
  for (let dh = 0; dh < 3; dh++) {
    for (let dj = 0; dj < 2; dj++) {
      const jj = j + dj
      if (jj < faceWidth) ids.push(encodeWallId(dh, face, jj, config))
    }
  }
  return ids
}

// Returns the anchor ID on the opposite wall (for back-door of child rooms)
export function getReturnAnchorId(anchorId, config) {
  const { face, j } = decodeWallId(anchorId, config)
  const oppFace = [1, 0, 3, 2][face]
  return encodeWallId(0, oppFace, j, config)
}

export function wallTileCount({ gx, gz, wh }) {
  return 2 * (gx + gz) * wh
}

export function defaultFloorTexture(roomType) {
  return roomType === 'cadde' ? 'asfalt.jpg' : 'zemin.png'
}
