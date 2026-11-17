// Seyir defteri: components/board/Cork.tsx — mantar dokusu: açık ve koyu taneler, kenarlara doğru
// koyulaşan gölge. Taneler bir karoya çizilip yinelenir; bulunduğu alanı doldurur.
import { useMemo } from 'react'

import { board } from '../theme.js'

const TILE = 360

function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

export function Cork() {
  const background = useMemo(() => {
    const rand = seeded(7)
    // Yoğunluk mobildekiyle aynı: her 450 px²'ye bir tane
    const count = Math.round((TILE * TILE) / 450)
    let circles = ''
    for (let i = 0; i < count; i++) {
      const light = rand() < 0.45
      const x = (rand() * TILE).toFixed(1)
      const y = (rand() * TILE).toFixed(1)
      const r = (0.5 + rand() * (light ? 1.4 : 1.1)).toFixed(2)
      const o = (0.18 + rand() * 0.35).toFixed(2)
      circles += `<circle cx="${x}" cy="${y}" r="${r}" fill="${light ? board.corkLight : board.corkDark}" opacity="${o}"/>`
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">${circles}</svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }, [])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundColor: board.cork,
        backgroundImage: `radial-gradient(75% 70% at 50% 45%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.3) 100%), ${background}`,
      }}
    />
  )
}
