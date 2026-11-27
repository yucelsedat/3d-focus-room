// Metin tile'ında blokların ekrandaki yerleri (blok seçimi, sürükleme, boşluğa dokunma)

// Bloğun ekrandaki parçaları (kolon kolon)
export function rowRects(el) {
  return el ? [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0) : []
}

// Ekrandaki noktadaki blok; yoksa null
export function blockAtPoint(rows, order, x, y) {
  for (const id of order) {
    if (rowRects(rows(id)).some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return id
  }
  return null
}
