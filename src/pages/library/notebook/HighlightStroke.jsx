// Seyir defteri: components/notebook/HighlightStroke.tsx + DocHighlights.tsx.
// Fosforlu kalemle çekilmiş şerit: kesik keçe uç yüzünden iki ucu da yatık, kenarları hafif
// dalgalı. Kalem iki kez geçer; geçişlerin üst üste bindiği orta bant daha koyu görünür.
import { useLayoutEffect, useMemo, useRef } from 'react'

import { highlighterOf } from '../theme.js'
import { strokePaths } from './highlightPaths.js'

export function HighlightStroke({ width, height, color, strength, seed, style }) {
  const passes = useMemo(() => strokePaths(width, height, seed), [width, height, seed])
  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible', ...style }}
    >
      {passes.map((d) => (
        <path key={d} d={d} fill={color} fillOpacity={strength} />
      ))}
    </svg>
  )
}

// Boyanın ham yazıdaki [start, end) aralığının ekrandaki satır parçaları. Yazı parçaları
// data-raw (ham yazıdaki başlangıcı) ve data-len (ham uzunluğu) taşır; data-exact="0" ise ham
// hâli ekrandakinden farklıdır (kaçış, HTML varlığı), parça bütün olarak boyanır.
function rangeRects(root, start, end) {
  const rects = []
  for (const span of root.querySelectorAll('[data-raw]')) {
    const from = Number(span.dataset.raw)
    const to = from + Number(span.dataset.len)
    if (to <= start || from >= end) continue
    const range = document.createRange()
    if (span.dataset.exact === '0') {
      range.selectNodeContents(span)
    } else {
      const a = textPoint(span, Math.max(0, start - from))
      const b = textPoint(span, Math.min(to, end) - from)
      if (!a || !b) continue
      range.setStart(a.node, a.offset)
      range.setEnd(b.node, b.offset)
    }
    rects.push(...range.getClientRects())
  }
  return rects
}

function textPoint(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let left = offset
  let node = walker.nextNode()
  let last = null
  while (node) {
    if (left <= node.length) return { node, offset: left }
    left -= node.length
    last = node
    node = walker.nextNode()
  }
  return last ? { node: last, offset: last.length } : null
}

// Aynı satırdaki parçalar birleşir: satır başına tek şerit
function byLine(rects) {
  const lines = []
  for (const r of rects) {
    if (r.width < 1) continue
    const line = lines.find((l) => Math.abs(l.top - r.top) < r.height * 0.5)
    if (line) {
      line.left = Math.min(line.left, r.left)
      line.right = Math.max(line.right, r.right)
      line.height = Math.max(line.height, r.height)
    } else {
      lines.push({ top: r.top, left: r.left, right: r.right, height: r.height })
    }
  }
  return lines
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// PDF'te fosforlu kalemin boyası: yazının arkasında, satır satır elle çekilmiş şeritler. Katman
// çizimden sonra DOM'dan ölçülüp doğrudan SVG'ye yazılır; yazı ya da genişlik değişince yenilenir.
// rows: defterdeki gibi satır çizgisine oturan şerit — { lineHeight, top, height }: şerit satırın
// üstünden top kadar aşağıda, height boyunda (verilmezse yazının satır kutusuna göre)
export function HighlightLayer({ rootRef, highlights, version, rows }) {
  const svgRef = useRef(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const svg = svgRef.current
    if (!root || !svg) return
    const draw = () => {
      svg.replaceChildren()
      if (highlights.length === 0) return
      const base = root.getBoundingClientRect()
      for (const h of highlights) {
        for (const line of byLine(rangeRects(root, h.start, h.end))) {
          const width = line.right - line.left + 6
          // Defterdeki oranla: satırın üstünden %24 aşağıda başlar, satırın %70'i boyunca
          const slot = rows ? Math.floor((line.top - base.top + line.height / 2) / rows.lineHeight) * rows.lineHeight : 0
          const height = rows ? rows.height : Math.round(line.height * 0.7)
          if (width < 4 || height < 2) continue
          const x = line.left - base.left - 3
          const y = rows ? slot + rows.top : line.top - base.top + line.height * 0.24
          const g = document.createElementNS(SVG_NS, 'g')
          g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
          for (const d of strokePaths(width, height, Math.round(x) * 7 + Math.round(y) + 1)) {
            const path = document.createElementNS(SVG_NS, 'path')
            path.setAttribute('d', d)
            path.setAttribute('fill', highlighterOf(h.color).color)
            path.setAttribute('fill-opacity', '0.4')
            g.appendChild(path)
          }
          svg.appendChild(g)
        }
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(root)
    document.fonts?.addEventListener?.('loadingdone', draw)
    return () => {
      ro.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', draw)
    }
  }, [rootRef, highlights, version, rows])

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
    />
  )
}
