// Seyir defteri: components/notebook/DrawingMode.tsx + StrokeLayer.tsx — sayfaya elle çizim.
// Çizim modunda sayfa yazılmaz, çevrilmez; dokunuşlar araçlara gider: el (kaydır), kalem, silgi ve
// seçim (alan çek ya da çizgiye tıkla; seçili çizgiler sürüklenir, kopyalanır, kesilir, çoğaltılır,
// silinir). Sayfa sol üst köşesinden büyür (Ctrl+tekerlek ya da iki parmak); çizgi kalınlığı
// sayfada sabittir. Çizgiler içerik biriminde ({ c: renk, w: kalınlık, p: [x, y, ...] }).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { TornPaperMenu } from '../TornPaperMenu.jsx'
import { fonts, HAND_TAIL, notebook, notebookFills } from '../theme.js'
import { PasteButton } from './BlockSelection.jsx'
import { BAR_HEIGHT } from './DocumentBar.jsx'
import {
  DRAW_COLORS,
  DRAW_SIZES,
  drawColorOf,
  drawWidthOf,
  strokeHit,
  strokeInRect,
  strokePath,
  strokesBounds,
} from './drawing.js'
import { HandDrawing, HandIcon } from './HandIcon.jsx'

const MAX_ZOOM = 8
// İki parmakla küçültülen sayfa bundan az büyümüş kalırsa tam yerine oturur
const SNAP_ZOOM = 1.05
// Bundan küçük çekilen alan (px) tıklama sayılır, seçim olmaz
const MIN_AREA = 24
// Silginin ekrandaki yarıçapı (px); zoom ne olursa olsun ekranda aynı boyda
const ERASER_RADIUS = 12
// Seçim aracıyla tıklanan yerin bu kadar yakınındaki (ekranda, px) çizgiler seçilir
const TAP_RADIUS = 12
// Seçili çizgilerin çevresindeki kesik çizgili kutunun payı ve çizgisi (ekranda, px)
const SELECTION_PAD = 6
const BOX_LINE = 1.5

// 2.5 → "2,5×"
function zoomLabel(k) {
  return `${String(Math.round(k * 10) / 10).replace('.', ',')}×`
}

function StrokePaths({ strokes }) {
  return strokes.map((s, i) => (
    <path
      key={i}
      d={strokePath(s.p)}
      stroke={drawColorOf(s.c)}
      strokeWidth={s.w}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ))
}

// Kalıcı çizgiler: yazıların üstünde, sayfanın kendisiyle birlikte kayar. hidden: ayrı katmanda
// çizilen (seçili) çizgiler
export function StrokeLayer({ strokes, hidden }) {
  const shown = hidden && hidden.size > 0 ? strokes.filter((s) => !hidden.has(s)) : strokes
  if (shown.length === 0) return null
  return (
    <svg aria-hidden="true" style={styles.layer}>
      <StrokePaths strokes={shown} />
    </svg>
  )
}

// Çizim modunun yüzeyi: sayfanın üstünü örter, araçların dokunuşlarını alır. Çizilmekte olan
// çizgi, seçili çizgiler, seçim kutusu ve silgi burada çizilir.
export function DrawingSurface({
  scrollRef,
  zoom,
  onZoom,
  tool,
  pen,
  strokes,
  selected,
  onSelectedChange,
  drawing,
}) {
  const surfaceRef = useRef(null)
  const liveRef = useRef(null)
  const eraserRef = useRef(null)
  const gesture = useRef(null)
  const pointers = useRef(new Map())
  const pendingAnchor = useRef(null)
  // Seçim kutusu (alan çekilirken parmağın başladığı ve olduğu yer) ve seçili çizgilerin kayması
  const [area, setArea] = useState(null)
  const [drag, setDrag] = useState(null)
  const picked = strokes.filter((s) => selected.has(s))
  const bounds = strokesBounds(picked)

  // Ekrandaki nokta → sayfadaki nokta (içerik birimi)
  function toPage(e) {
    const rect = surfaceRef.current.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }
  }

  // Sayfa (x, y) noktası ekranda (cx, cy) noktasının altında kalarak k kat büyür
  function zoomAt(k, clientX, clientY) {
    const next = Math.min(MAX_ZOOM, Math.max(1, k))
    const rect = surfaceRef.current.getBoundingClientRect()
    pendingAnchor.current = { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom, clientX, clientY }
    onZoom(next)
  }

  // Zoom değişince sayfa, zoomun merkezi parmağın (imlecin) altında kalacak şekilde kaydırılır
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current
    const scroller = scrollRef.current
    if (!anchor || !scroller) return
    pendingAnchor.current = null
    const box = scroller.getBoundingClientRect()
    scroller.scrollLeft = anchor.x * zoom - (anchor.clientX - box.left)
    scroller.scrollTop = anchor.y * zoom - (anchor.clientY - box.top)
  }, [zoom, scrollRef])

  // Ctrl + tekerlek (trackpad'de iki parmakla sıkıştırma) sayfayı büyütür
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const k = zoom * Math.exp(-e.deltaY * 0.0025)
      zoomAt(k < SNAP_ZOOM ? 1 : k, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  function setLive(points, color, width) {
    const path = liveRef.current
    if (!path) return
    path.setAttribute('d', points.length >= 2 ? strokePath(points) : '')
    path.setAttribute('stroke', color)
    path.setAttribute('stroke-width', String(width))
  }

  function showEraser(p) {
    const el = eraserRef.current
    if (!el) return
    const r = ERASER_RADIUS / zoom
    el.style.display = p ? 'block' : 'none'
    if (p) {
      el.style.left = `${p.x - r}px`
      el.style.top = `${p.y - r}px`
      el.style.width = el.style.height = `${r * 2}px`
    }
  }

  function inBox(p) {
    if (!bounds) return false
    const slack = (SELECTION_PAD + TAP_RADIUS) / zoom
    return p.x >= bounds.x0 - slack && p.x <= bounds.x1 + slack && p.y >= bounds.y0 - slack && p.y <= bounds.y1 + slack
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
    // İki parmak: sayfa büyür, küçülür; tek parmakla başlamış iş bırakılır
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      setLive([], '', 0)
      showEraser(null)
      setArea(null)
      setDrag(null)
      gesture.current = { kind: 'pinch', k0: zoom, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
      return
    }
    if (pointers.current.size > 2) return
    const p = toPage(e)
    const start = { p, clientX: e.clientX, clientY: e.clientY, moved: false }
    if (tool === 'pen') {
      gesture.current = { kind: 'pen', ...start, points: [p.x, p.y], color: drawColorOf(pen.color), width: drawWidthOf(pen.size) }
    } else if (tool === 'eraser') {
      gesture.current = { kind: 'eraser', ...start, last: { x: e.clientX, y: e.clientY } }
      showEraser(p)
      drawing.eraseAt(p.x, p.y, ERASER_RADIUS / zoom)
    } else if (tool === 'select') {
      // Seçili çizgilerin kutusunun içinden başlayan sürükleme çizgileri taşır, dışından başlayan
      // yeni bir alan seçer
      gesture.current = inBox(p) && picked.length > 0 ? { kind: 'move', ...start } : { kind: 'area', ...start }
    } else {
      const scroller = scrollRef.current
      gesture.current = { kind: 'hand', ...start, left: scroller.scrollLeft, top: scroller.scrollTop }
    }
  }

  function onPointerMove(e) {
    const g = gesture.current
    if (!pointers.current.has(e.pointerId) || !g) {
      if (tool === 'eraser' && e.pointerType === 'mouse') showEraser(toPage(e))
      return
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b) return
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAt(g.k0 * (d / g.d0), (a.x + b.x) / 2, (a.y + b.y) / 2)
      return
    }
    if (Math.hypot(e.clientX - g.clientX, e.clientY - g.clientY) > 3) g.moved = true
    const p = toPage(e)
    if (g.kind === 'pen') {
      // Büyümüş sayfada noktalar sıklaşır, ince ayrıntı yumuşak çıkar
      const step = 0.8 / zoom
      const n = g.points.length
      const dx = p.x - g.points[n - 2]
      const dy = p.y - g.points[n - 1]
      if (dx * dx + dy * dy >= step * step) g.points.push(p.x, p.y)
      setLive(g.points, g.color, g.width)
    } else if (g.kind === 'eraser') {
      showEraser(p)
      if (Math.hypot(e.clientX - g.last.x, e.clientY - g.last.y) < 3) return
      g.last = { x: e.clientX, y: e.clientY }
      drawing.eraseAt(p.x, p.y, ERASER_RADIUS / zoom)
    } else if (g.kind === 'area') {
      setArea({ x0: g.p.x, y0: g.p.y, x1: p.x, y1: p.y })
    } else if (g.kind === 'move') {
      setDrag({ x: p.x - g.p.x, y: p.y - g.p.y })
    } else if (g.kind === 'hand') {
      const scroller = scrollRef.current
      scroller.scrollLeft = g.left - (e.clientX - g.clientX)
      scroller.scrollTop = g.top - (e.clientY - g.clientY)
    }
  }

  function onPointerUp(e) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      if (pointers.current.size === 0) {
        gesture.current = null
        if (zoom < SNAP_ZOOM) onZoom(1)
      }
      return
    }
    gesture.current = null
    const canceled = e.type === 'pointercancel'
    const p = toPage(e)
    if (g.kind === 'pen') {
      setLive([], '', 0)
      if (canceled) return
      const points = g.moved ? g.points : [g.p.x, g.p.y]
      drawing.add({ c: pen.color, w: g.width, p: points.map((v) => Math.round(v * 10) / 10) })
    } else if (g.kind === 'eraser') {
      if (e.pointerType !== 'mouse') showEraser(null)
      drawing.endErase()
    } else if (g.kind === 'area') {
      setArea(null)
      const dx = Math.abs(e.clientX - g.clientX)
      const dy = Math.abs(e.clientY - g.clientY)
      if (canceled) return
      if (dx < MIN_AREA && dy < MIN_AREA) {
        // Tıklama: değdiği çizgilerin seçimi açılır / kapanır
        const hit = strokes.filter((s) => strokeHit(s, p.x, p.y, TAP_RADIUS / zoom))
        if (hit.length === 0) {
          onSelectedChange(new Set())
          return
        }
        const next = new Set(selected)
        const allIn = hit.every((s) => next.has(s))
        for (const s of hit) {
          if (allIn) next.delete(s)
          else next.add(s)
        }
        onSelectedChange(next)
        return
      }
      const rect = { x0: Math.min(g.p.x, p.x), y0: Math.min(g.p.y, p.y), x1: Math.max(g.p.x, p.x), y1: Math.max(g.p.y, p.y) }
      onSelectedChange(new Set(strokes.filter((s) => strokeInRect(s, rect))))
    } else if (g.kind === 'move') {
      setDrag(null)
      const d = { x: p.x - g.p.x, y: p.y - g.p.y }
      if (canceled || !g.moved || (d.x === 0 && d.y === 0)) return
      onSelectedChange(new Set(drawing.move(picked, d.x, d.y)))
    }
  }

  const pad = SELECTION_PAD / zoom
  const box = area
    ? { x: Math.min(area.x0, area.x1), y: Math.min(area.y0, area.y1), w: Math.abs(area.x1 - area.x0), h: Math.abs(area.y1 - area.y0) }
    : bounds && tool === 'select'
      ? { x: bounds.x0 - pad + (drag?.x ?? 0), y: bounds.y0 - pad + (drag?.y ?? 0), w: bounds.x1 - bounds.x0 + pad * 2, h: bounds.y1 - bounds.y0 + pad * 2 }
      : null

  return (
    <div
      ref={surfaceRef}
      className="nb-draw-surface"
      data-tool={tool}
      style={styles.surface}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={(e) => e.pointerType === 'mouse' && !gesture.current && showEraser(null)}
    >
      <svg aria-hidden="true" style={styles.layer}>
        {/* Seçili çizgiler ayrı katmanda: sürüklenince kayar */}
        {picked.length > 0 && (
          <g transform={drag ? `translate(${drag.x} ${drag.y})` : undefined}>
            <StrokePaths strokes={picked} />
          </g>
        )}
        <path ref={liveRef} d="" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {box && (
          <rect
            x={box.x}
            y={box.y}
            width={Math.max(0, box.w)}
            height={Math.max(0, box.h)}
            rx={3 / zoom}
            fill={notebookFills.marqueeFill}
            stroke={notebookFills.marquee}
            strokeWidth={BOX_LINE / zoom}
            strokeDasharray={`${5 / zoom} ${4 / zoom}`}
          />
        )}
      </svg>
      <div ref={eraserRef} style={{ ...styles.eraser, borderWidth: 1.5 / zoom }} />
    </div>
  )
}

// Çizim modunda üst çubuk: büyütme (kapatma çipiyle), yapıştır (panoda çizim varsa), seçim, fırça
export function DrawingActions({ zoom, onResetZoom, selecting, onSelectingChange, clipboardStrokes, onPaste, onClearClipboard, onClose }) {
  return (
    <>
      {zoom > 1 && (
        <button type="button" onClick={onResetZoom} aria-label="Büyütmeyi kapat" className="lib-hand-icon" style={styles.chip}>
          <HandDrawing shape="close" size={24} />
          <span style={styles.chipText}>{zoomLabel(zoom) + HAND_TAIL}</span>
        </button>
      )}
      {clipboardStrokes > 0 && <PasteButton label="Kopyalanan çizimi yapıştır" onPress={onPaste} onLongPress={onClearClipboard} />}
      <HandIcon
        shape="select"
        label={selecting ? 'Çizim seçimini kapat' : 'Çizim seç'}
        size={28}
        selected={selecting}
        color={selecting ? notebookFills.selectionInk : undefined}
        onPress={() => onSelectingChange(!selecting)}
      />
      <HandIcon
        shape="brush"
        label="Çizim modunu kapat"
        size={28}
        selected
        color={notebookFills.selectionInk}
        fill={notebookFills.drawingFill}
        onPress={onClose}
      />
    </>
  )
}

const TOOLS = [
  { tool: 'hand', shape: 'hand', label: 'Sayfayı kaydır' },
  { tool: 'pen', shape: 'pencil', label: 'Kalemle çiz' },
  { tool: 'eraser', shape: 'eraser', label: 'Silgi' },
]

// Çizim modunun alt çubuğu (seçim kapalıyken): araçlar, kalemin rengi ve kalınlığı, geri al, yinele
export function DrawingBar({ tool, onToolChange, pen, onPenPress, canUndo, canRedo, onUndo, onRedo }) {
  const width = drawWidthOf(pen.size)
  return (
    <div style={styles.bar}>
      <svg style={styles.rule} width="100%" height={6} viewBox="0 0 400 6" preserveAspectRatio="none" aria-hidden="true">
        <path d="M6 3.2 Q120 1.8 220 3.4 T394 2.6" stroke={notebook.graphite} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.55} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="nb-tool-row" style={styles.row}>
        {TOOLS.map((t) => (
          <span key={t.tool} style={{ ...styles.tool, ...(tool === t.tool ? styles.toolOn : null) }}>
            <HandIcon
              shape={t.shape}
              label={t.label}
              size={30}
              selected={tool === t.tool}
              color={tool === t.tool ? notebookFills.selectionInk : undefined}
              onPress={() => onToolChange(t.tool)}
            />
          </span>
        ))}
        <span style={styles.divider} />
        {/* Kalemin rengiyle boyanmış kare; ortasında kalınlığı kadar bir nokta */}
        <span style={styles.swatch}>
          <HandIcon shape="swatch" label="Kalemin rengi ve kalınlığı" size={30} fill={drawColorOf(pen.color)} onPress={onPenPress} />
          <span style={{ ...styles.sizeDot, width: width + 3, height: width + 3, borderRadius: (width + 3) / 2 }} />
        </span>
        <HandIcon shape="undo" label="Geri al" size={30} disabled={!canUndo} onPress={onUndo} />
        <HandIcon shape="redo" label="Yinele" size={30} disabled={!canRedo} onPress={onRedo} />
      </div>
    </div>
  )
}

// Çizim kalemi: yırtık kâğıtta renkler ve kalınlıklar; sayfada çizim varsa altında "çizimi sil"
export function DrawPenMenu({ visible, pen, onChange, onClear, onClose }) {
  return (
    <TornPaperMenu
      visible={visible}
      title="Çizim kalemi"
      onClose={onClose}
      options={onClear ? [{ label: 'Sayfadaki çizimi sil', danger: true, onPress: onClear }] : []}
    >
      <div style={styles.section}>{'Renk' + HAND_TAIL}</div>
      <div style={styles.samples} role="radiogroup" aria-label="Renk">
        {DRAW_COLORS.map((c) => (
          <Sample key={c.key} label={c.name} selected={pen.color === c.key} onPress={() => onChange({ ...pen, color: c.key })}>
            <span style={{ ...styles.colorDot, backgroundColor: c.color }} />
          </Sample>
        ))}
      </div>
      <div style={styles.section}>{'Kalınlık' + HAND_TAIL}</div>
      <div style={styles.samples} role="radiogroup" aria-label="Kalınlık">
        {DRAW_SIZES.map((s) => (
          <Sample key={s.key} label={`${s.name} kalem`} selected={pen.size === s.key} onPress={() => onChange({ ...pen, size: s.key })}>
            <svg width={34} height={20} aria-hidden="true">
              <path d="M4 12 C12 7 20 15 30 8" stroke={drawColorOf(pen.color)} strokeWidth={s.width} strokeLinecap="round" fill="none" />
            </svg>
          </Sample>
        ))}
      </div>
    </TornPaperMenu>
  )
}

const SAMPLE = 50

function Sample({ label, selected, onPress, children }) {
  return (
    <button type="button" onClick={onPress} role="radio" aria-checked={selected} aria-label={label} title={label} className="lib-paper-icon" style={styles.sample}>
      {children}
      {selected && (
        <span style={styles.ring}>
          <HandDrawing shape="ring" size={SAMPLE} />
        </span>
      )}
    </button>
  )
}

const styles = {
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: 35,
  },
  surface: {
    position: 'absolute',
    inset: 0,
    zIndex: 40,
    touchAction: 'none',
    userSelect: 'none',
  },
  eraser: {
    position: 'absolute',
    display: 'none',
    borderStyle: 'solid',
    borderColor: 'rgba(56, 56, 61, 0.6)',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 32,
    width: 'auto',
    padding: '0 10px 0 4px',
    borderRadius: 16,
    backgroundColor: 'rgba(251, 247, 236, 0.92)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
  chipText: {
    ...fonts.handBold,
    fontSize: 20,
    color: notebook.graphite,
  },
  bar: {
    position: 'relative',
    flexShrink: 0,
    backgroundColor: notebook.paper,
  },
  rule: {
    position: 'absolute',
    top: -3,
    left: 0,
    pointerEvents: 'none',
  },
  row: {
    height: BAR_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    padding: '0 6px',
    overflowX: 'auto',
  },
  tool: {
    display: 'flex',
    borderRadius: 18,
  },
  toolOn: {
    backgroundColor: notebookFills.selectionTint,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(56, 56, 61, 0.2)',
  },
  swatch: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeDot: {
    position: 'absolute',
    backgroundColor: notebook.paper,
    pointerEvents: 'none',
  },
  section: {
    marginLeft: 42,
    ...fonts.hand,
    fontSize: 20,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  samples: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 2,
    padding: '0 12px 6px 42px',
  },
  sample: {
    position: 'relative',
    width: SAMPLE,
    height: SAMPLE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: SAMPLE / 2,
    background: 'transparent',
    cursor: 'pointer',
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  ring: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
}
