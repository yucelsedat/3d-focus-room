// Seyir defteri: components/notebook/Paper.tsx — dokulu defter kâğıdı (sayfa listesi gibi el yazılı
// yapraklar için): kâğıt rengi, sabit tohumlu lekeler, kenar gölgesi ve kırmızı kenar boşluğu.
import { useMemo } from 'react'

import { notebook } from '../theme.js'

const SPECKS = 260
const SPECK_LEVELS = [0.055, 0.08, 0.105, 0.13]
// Lekeler bu ölçüde bir karoya çizilir, kâğıt boyunca yinelenir
const TILE_W = 420
const TILE_H = 900

function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function circlePath(x, y, r) {
  const left = (x - r).toFixed(1)
  const cy = y.toFixed(1)
  const rr = r.toFixed(2)
  const d = (2 * r).toFixed(2)
  return `M${left} ${cy}a${rr} ${rr} 0 1 0 ${d} 0a${rr} ${rr} 0 1 0 -${d} 0`
}

export function Paper({ children, seed = 42, margin = true }) {
  // Aynı saydamlıktaki lekeler tek bir yola çizilir; SVG karo arka plan olarak yinelenir
  const background = useMemo(() => {
    const rand = seeded(seed)
    const paths = SPECK_LEVELS.map(() => '')
    for (let i = 0; i < SPECKS; i++) {
      const x = rand() * TILE_W
      const y = rand() * TILE_H
      const r = 0.3 + rand() * 0.8
      const level = Math.min(SPECK_LEVELS.length - 1, Math.floor(rand() * SPECK_LEVELS.length))
      paths[level] += circlePath(x, y, r)
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">${paths
      .map((d, i) => `<path d="${d}" fill="${notebook.paperEdge}" opacity="${SPECK_LEVELS[i]}"/>`)
      .join('')}</svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }, [seed])

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: notebook.paper,
        backgroundImage: `radial-gradient(75% 70% at 50% 45%, rgba(138, 115, 72, 0) 60%, rgba(138, 115, 72, 0.22) 100%), ${background}`,
      }}
    >
      {margin && (
        <>
          <div style={{ ...styles.margin, left: notebook.marginX - 0.6, width: 1.2 }} />
          <div style={{ ...styles.margin, left: notebook.marginX + 4 - 0.4, width: 0.8, opacity: 0.7 }} />
        </>
      )}
      {children}
    </div>
  )
}

const styles = {
  margin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: notebook.margin,
    pointerEvents: 'none',
  },
}

// Kareli ve noktalı kâğıdın aralığı: iki kare bir satır, satır çizgileri kare çizgilerine denk gelir
const GRID = notebook.lineHeight / 2
const GRID_EDGE = GRID - 0.5

// Karşıdan karşıya ince bir çizgi: [from, to) aralığı çizginin rengi, gerisi saydam
function band(direction, from, to) {
  return `linear-gradient(${direction}, transparent ${from}px, ${notebook.rule} ${from}px, ${notebook.rule} ${to}px, transparent ${to}px)`
}

// Satır çizgisi satırın en altında
const LINE_STYLE = {
  backgroundImage: band('to bottom', notebook.lineHeight - 0.95, notebook.lineHeight - 0.05),
  backgroundSize: `100% ${notebook.lineHeight}px`,
}

// Karenin sağ ve alt kenarı; yan yana dizilince ızgara olur
const GRID_STYLE = {
  backgroundImage: `${band('to bottom', GRID_EDGE - 0.35, GRID_EDGE + 0.35)}, ${band('to right', GRID_EDGE - 0.35, GRID_EDGE + 0.35)}`,
  backgroundSize: `${GRID}px ${GRID}px`,
}

// Karenin sağ alt köşesinde bir nokta
const DOT_STYLE = {
  backgroundImage: `radial-gradient(circle 1.5px at ${GRID_EDGE}px ${GRID_EDGE}px, ${notebook.rule} 1.1px, transparent 1.5px)`,
  backgroundSize: `${GRID}px ${GRID}px`,
}

// Kaydırılan içeriğin arkasında, içerik boyunca satır çizgileri (kareli kâğıtta kareler, noktalı
// kâğıtta noktalar; düz kâğıt boş kalır). Çizgiler yinelenen gradyan arka plandır.
export function RuledLines({ paper = 'oxford' }) {
  const style = paper === 'grid' ? GRID_STYLE : paper === 'dot' ? DOT_STYLE : paper === 'ruled' || paper === 'oxford' ? LINE_STYLE : null
  if (!style) return null
  return <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundRepeat: 'repeat', ...style }} />
}
