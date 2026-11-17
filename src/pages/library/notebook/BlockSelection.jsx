// Seyir defteri: components/notebook/BlockSelection.tsx + BottomBar SelectionBar + PageTop
// PasteButton. Blok seçimi açıkken sayfanın üstünü örten saydam katman: bloklara tek tek tıklayarak
// ya da sürükleyerek kesik çizgili bir alan çekip seçilir. Alan kaydırma alanının kenarına dayanınca
// sayfa kayar, alan da onunla uzar.
import { useEffect, useRef, useState } from 'react'

import { colors, fonts, HAND_TAIL, notebook, notebookFills } from '../theme.js'
import { BAR_HEIGHT } from './DocumentBar.jsx'
import { HandIcon } from './HandIcon.jsx'

const EDGE = 56
const MAX_SPEED = 14

// extents(): blokların kaydırılan içerikteki yerleri [{ top, height }], sayfadaki sırasıyla
// selected: seçili blokların sıraları (Set)
export function BlockSelection({ scrollRef, extents, selected, onTap, onSweep }) {
  const layerRef = useRef(null)
  const [marquee, setMarquee] = useState(null)
  const state = useRef(null)

  function blockAt(list, y) {
    return list.findIndex((e) => y >= e.top && y < e.top + e.height)
  }

  // İçerikteki konum: katmanın sol üstüne göre (katman kaydırılan içerikle birlikte kayar)
  function point(e) {
    const rect = layerRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function sweep(s) {
    const y0 = Math.min(s.anchor.y, s.finger.y)
    const y1 = Math.max(s.anchor.y, s.finger.y)
    const list = extents()
    const indices = []
    let key = ''
    list.forEach((e, i) => {
      const inside = e.height > 0 && e.top < y1 && e.top + e.height > y0
      if (inside || s.base.has(i)) {
        indices.push(i)
        key += `${i},`
      }
    })
    if (key === s.lastKey) return
    s.lastKey = key
    onSweep(indices)
  }

  function onPointerDown(e) {
    if (e.button !== 0) return
    const p = point(e)
    state.current = { anchor: p, finger: p, start: { x: e.clientX, y: e.clientY }, sweeping: false, base: new Set(selected), lastKey: '', clientY: e.clientY, id: e.pointerId }
  }

  function onPointerMove(e) {
    const s = state.current
    if (!s || e.pointerId !== s.id) return
    s.clientY = e.clientY
    s.finger = point(e)
    if (!s.sweeping) {
      if (Math.hypot(e.clientX - s.start.x, e.clientY - s.start.y) < 8) return
      s.sweeping = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setMarquee({ ...s.anchor, fx: s.finger.x, fy: s.finger.y })
    sweep(s)
  }

  function onPointerUp(e) {
    const s = state.current
    if (!s || e.pointerId !== s.id) return
    state.current = null
    setMarquee(null)
    if (!s.sweeping) onTap(blockAt(extents(), s.anchor.y))
  }

  // Parmak kenarda durdukça sayfa kayar; alan da kayan sayfayla birlikte uzar
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const step = (now) => {
      const s = state.current
      const scroller = scrollRef.current
      const dt = (now - last) / 16
      last = now
      if (s?.sweeping && scroller) {
        const box = scroller.getBoundingClientRect()
        const v = s.clientY - box.top
        let speed = 0
        if (v < EDGE) speed = -MAX_SPEED * Math.min(1, (EDGE - v) / EDGE)
        else if (v > box.height - EDGE) speed = MAX_SPEED * Math.min(1, (v - box.height + EDGE) / EDGE)
        if (speed !== 0) {
          const before = scroller.scrollTop
          scroller.scrollTop = before + speed * dt
          const moved = scroller.scrollTop - before
          if (moved !== 0) {
            s.finger = { ...s.finger, y: s.finger.y + moved }
            setMarquee({ ...s.anchor, fx: s.finger.x, fy: s.finger.y })
            sweep(s)
          }
        }
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  })

  return (
    <div
      ref={layerRef}
      className="nb-select-layer"
      style={styles.layer}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {marquee && (
        <div
          style={{
            ...styles.marquee,
            left: Math.min(marquee.x, marquee.fx),
            top: Math.min(marquee.y, marquee.fy),
            width: Math.abs(marquee.fx - marquee.x),
            height: Math.abs(marquee.fy - marquee.y),
          }}
        />
      )}
    </div>
  )
}

// Üst kenarda elle çekilmiş ince çizgi
function BarRule() {
  return (
    <svg style={styles.rule} width="100%" height={6} viewBox="0 0 400 6" preserveAspectRatio="none" aria-hidden="true">
      <path d="M6 3.2 Q120 1.8 220 3.4 T394 2.6" stroke={notebook.graphite} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.55} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Blok seçiminin alt çubuğu: seçili blok sayısı (ya da az önce yapılan iş), kopyala, kes, çoğalt, sil
export function SelectionBar({ count, notice, onCopy, onCut, onDuplicate, onDelete, noun = 'blok', idle = 'blok seç' }) {
  const none = count === 0
  const label = notice ?? (none ? idle : `${count} ${noun}`)
  return (
    <div style={styles.bar}>
      <BarRule />
      <div style={styles.selectionRow}>
        <span style={{ ...styles.count, ...(none && !notice ? styles.countIdle : null) }}>{label + HAND_TAIL}</span>
        <div style={styles.selectionIcons}>
          <HandIcon shape="copy" label="Kopyala" onPress={onCopy} size={30} disabled={none} />
          <HandIcon shape="cut" label="Kes" onPress={onCut} size={30} disabled={none} />
          <HandIcon shape="duplicate" label="Çoğalt" onPress={onDuplicate} size={30} disabled={none} />
          <HandIcon shape="trash" label="Sil" onPress={onDelete} size={30} color={none ? undefined : colors.accent} disabled={none} />
        </div>
      </div>
    </div>
  )
}

// Panodakini yapıştırır; sağ tıkla (ya da basılı tutunca) pano boşaltılır. Yanında bir nokta atar.
export function PasteButton({ onPress, onLongPress, label = 'Kopyalanan blokları yapıştır' }) {
  const timer = useRef(0)
  const fired = useRef(false)
  return (
    <span
      style={styles.pasteWrap}
      onContextMenu={(e) => {
        e.preventDefault()
        onLongPress()
      }}
      onPointerDown={() => {
        fired.current = false
        timer.current = setTimeout(() => {
          fired.current = true
          onLongPress()
        }, 500)
      }}
      onPointerUp={() => clearTimeout(timer.current)}
      onPointerLeave={() => clearTimeout(timer.current)}
      onClickCapture={(e) => {
        if (fired.current) {
          e.stopPropagation()
          fired.current = false
        }
      }}
    >
      <HandIcon shape="paste" label={label} size={28} color={colors.accent} onPress={onPress} />
      <span style={styles.badge} aria-hidden="true">
        <span className="nb-paste-halo" style={styles.badgeHalo} />
        <span style={styles.badgeDot} />
      </span>
    </span>
  )
}

const styles = {
  // Blokların ve resimlerin üstünde
  layer: {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    cursor: 'crosshair',
    touchAction: 'none',
    userSelect: 'none',
  },
  marquee: {
    position: 'absolute',
    border: `1.5px dashed ${notebookFills.marquee}`,
    borderRadius: 3,
    backgroundColor: notebookFills.marqueeFill,
    pointerEvents: 'none',
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
  selectionRow: {
    height: BAR_HEIGHT,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '0 10px 0 18px',
  },
  count: {
    flexShrink: 1,
    marginRight: 8,
    ...fonts.handBold,
    fontSize: 22,
    color: notebook.graphite,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  countIdle: {
    ...fonts.hand,
    color: 'rgba(56, 56, 61, 0.5)',
  },
  selectionIcons: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  pasteWrap: {
    position: 'relative',
    display: 'inline-flex',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 9,
    height: 9,
    pointerEvents: 'none',
  },
  badgeHalo: {
    position: 'absolute',
    inset: 0,
    borderRadius: 4.5,
    backgroundColor: colors.accent,
  },
  badgeDot: {
    position: 'absolute',
    inset: 0,
    borderRadius: 4.5,
    backgroundColor: colors.accent,
    border: `1.5px solid ${notebook.paper}`,
    boxSizing: 'border-box',
  },
}
