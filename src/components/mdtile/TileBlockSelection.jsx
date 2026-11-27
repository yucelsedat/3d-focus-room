// ── Metin tile'ında blok seçimi ───────────────────────────────────────────────
// Defterin blok seçiminin (BlockSelection) duvardaki karşılığı. Tile'ın yazısı kolonlara aktığından
// seçim iki boyutludur: bloğa dokununca seçilir / bırakılır, sürükleyince çekilen kesik çizgili alanın
// değdiği bütün bloklar seçilir. Kolonda bölünen bir bloğun her parçası ayrı sayılır.
//
// Ölçüler ekranda (client) yapılır: tile 3D'de dönük/ölçekli durduğundan bloğun ekrandaki kutuları
// doğrudan karşılaştırılır; kesik çizgili alan çizilirken tile'ın kendi ölçüsüne çevrilir (toLocal).
import { useRef, useState } from 'react'

import { notebookFills } from '../../pages/library/theme.js'
import { blockAtPoint, rowRects } from './geometry.js'

const TAP_SLOP = 8

// rows(id): bloğun kutusu (DOM öğesi)
export function TileBlockSelection({ rows, order, selected, onTap, onSweep, toLocal, style }) {
  const [marquee, setMarquee] = useState(null)
  const state = useRef(null)

  function sweep(s, x, y) {
    const x0 = Math.min(s.start.x, x)
    const x1 = Math.max(s.start.x, x)
    const y0 = Math.min(s.start.y, y)
    const y1 = Math.max(s.start.y, y)
    const ids = order.filter(
      (id) => s.base.has(id) || rowRects(rows(id)).some((r) => r.left < x1 && r.right > x0 && r.top < y1 && r.bottom > y0),
    )
    const key = ids.join(',')
    if (key === s.lastKey) return
    s.lastKey = key
    onSweep(ids)
  }

  function onPointerDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    state.current = { start: { x: e.clientX, y: e.clientY }, base: new Set(selected), sweeping: false, lastKey: '', id: e.pointerId }
  }

  function onPointerMove(e) {
    const s = state.current
    if (!s || e.pointerId !== s.id) return
    if (!s.sweeping) {
      if (Math.hypot(e.clientX - s.start.x, e.clientY - s.start.y) < TAP_SLOP) return
      s.sweeping = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // işaretçi bu arada kalktıysa
      }
    }
    const a = toLocal(s.start.x, s.start.y)
    const b = toLocal(e.clientX, e.clientY)
    setMarquee({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) })
    sweep(s, e.clientX, e.clientY)
  }

  function onPointerUp(e) {
    const s = state.current
    if (!s || e.pointerId !== s.id) return
    state.current = null
    setMarquee(null)
    if (!s.sweeping) onTap(blockAtPoint(rows, order, s.start.x, s.start.y))
  }

  function onPointerCancel() {
    state.current = null
    setMarquee(null)
  }

  return (
    <div
      // Dokununca odak katmana geçer: tile odakta kalır (çubuklar ve seçim kapanmaz)
      tabIndex={-1}
      style={{ ...styles.layer, ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {marquee && <div style={{ ...styles.marquee, left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
    </div>
  )
}

const styles = {
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 30,
    cursor: 'crosshair',
    touchAction: 'none',
    userSelect: 'none',
    pointerEvents: 'auto',
    outline: 'none',
  },
  marquee: {
    position: 'absolute',
    border: `1.5px dashed ${notebookFills.marquee}`,
    borderRadius: 3,
    backgroundColor: notebookFills.marqueeFill,
    pointerEvents: 'none',
  },
}
