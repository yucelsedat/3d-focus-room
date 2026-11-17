// Seyir defteri: components/notebook/PageSidebar.tsx — sayfanın ayarları: üst çubuktaki üç noktaya
// basınca ekranın sağına dayalı, defterden yırtılmış bir şerit sağ üst köşeden içeri döner. Seçilen
// iş şerit kapanınca yapılır.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { colors, fonts, HAND_TAIL, notebook } from '../theme.js'
import { HandDrawing, HandIcon } from './HandIcon.jsx'

const TEAR = 7
const MARGIN = 34
const SHADOW = 14
const OPEN_MS = 300
const CLOSE_MS = 210
// El yazısına opacity verilmez; soluk yazı rengin saydamlığıyla yazılır
const FADED = 'rgba(56, 56, 61, 0.3)'

function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

// Defterden boydan boya yırtılmış şerit: sol kenarı dişli, öbür kenarları ekranın kenarında
function stripShape(width, height) {
  const rand = seeded(11)
  const points = []
  for (let y = 0; y < height; y += 5 + rand() * 9) points.push([TEAR / 2 + (rand() - 0.5) * TEAR, y])
  points.push([TEAR / 2 + (rand() - 0.5) * TEAR, height])
  const edge = points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
  return { outline: `M${width} 0 L${edge} L${width} ${height} Z`, edge: `M${edge}` }
}

// sections: [{ title, items: [{ label, hint?, icon, onPress, danger?, disabled? }] }]
export function PageSidebar({ visible, title, subtitle, sections, onClose }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const width = Math.min(Math.round(size.w * 0.8), 330)
  const height = size.h
  const shape = useMemo(() => stripShape(width, height), [width, height])
  const pending = useRef(null)
  // Kapanırken şerit dışarı dönene kadar pencere açık kalır
  const [shown, setShown] = useState(visible)
  const [open, setOpen] = useState(false)
  if (visible && !shown) setShown(true)

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Açılış: bir kare sonra içeri döner; kapanış: dışarı dönünce pencere kalkar, seçilen iş yapılır
  useLayoutEffect(() => {
    if (!shown) return
    if (visible) {
      const frame = requestAnimationFrame(() => setOpen(true))
      return () => cancelAnimationFrame(frame)
    }
    const frame = requestAnimationFrame(() => setOpen(false))
    const timer = setTimeout(() => {
      setShown(false)
      const action = pending.current
      pending.current = null
      action?.()
    }, CLOSE_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [visible, shown])

  useEffect(() => {
    if (!visible) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, onClose])

  if (!shown) return null

  function choose(item) {
    pending.current = item.onPress
    onClose()
  }

  const rest = open ? 0 : 1
  const duration = open ? OPEN_MS : CLOSE_MS
  const easing = open ? 'cubic-bezier(0.33, 1, 0.68, 1)' : 'cubic-bezier(0.5, 0, 0.75, 0)'

  return createPortal(
    <div style={styles.root} role="dialog" aria-modal="true" aria-label={title}>
      <div
        onClick={onClose}
        style={{ ...styles.backdrop, opacity: 1 - rest, transition: `opacity ${duration}ms ${easing}` }}
      />
      <div
        style={{
          ...styles.panel,
          width,
          // Sağ üst köşesinden menteşeli gibi döner: alt ucu dışarıdan gelir
          transform: `translateX(${rest * (width + SHADOW)}px) rotate(${-rest * 6}deg)`,
          transition: `transform ${duration}ms ${easing}`,
        }}
      >
        <svg style={styles.drawing} width={width + SHADOW} height={height} aria-hidden="true">
          <g transform={`translate(${SHADOW} 0)`}>
            <path d={shape.outline} fill="#000" opacity={0.3} transform="translate(-6 0)" />
            <path d={shape.outline} fill={notebook.paper} />
            <line x1={MARGIN} y1={0} x2={MARGIN} y2={height} stroke={notebook.margin} strokeWidth={1.5} />
            <path d={shape.edge} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
          </g>
        </svg>

        <div style={styles.header}>
          <div style={styles.titleRow}>
            <div style={styles.title}>{title + HAND_TAIL}</div>
            <HandIcon shape="close" label="Ayarları kapat" size={26} onPress={onClose} />
          </div>
          {subtitle ? <div style={styles.subtitle}>{subtitle + HAND_TAIL}</div> : null}
        </div>

        <div className="nb-scroll" style={styles.sections}>
          {sections.map((section) => (
            <div key={section.title} style={styles.section}>
              <div style={styles.sectionTitle}>{section.title.toLocaleUpperCase('tr')}</div>
              {section.items.map((item, i) => (
                <SidebarRow key={item.label} item={item} last={i === section.items.length - 1} onPress={() => choose(item)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Şeridin mavi satırlarına yazılmış bir iş: simgesi ve adı, altında ne yapacağı
function SidebarRow({ item, last, onPress }) {
  const ink = item.disabled ? FADED : item.danger ? colors.accent : notebook.graphite
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={item.disabled}
      aria-label={item.label}
      title={item.hint}
      className="nb-sidebar-row"
      style={{ ...styles.row, ...(last ? styles.lastRow : null), cursor: item.disabled ? 'default' : 'pointer' }}
    >
      <HandDrawing shape={item.icon} size={28} color={ink} />
      <span style={styles.rowText}>
        <span style={{ ...styles.label, color: ink }}>{item.label + HAND_TAIL}</span>
        {item.hint ? <span style={{ ...styles.hint, ...(item.disabled ? { color: FADED } : null) }}>{item.hint + HAND_TAIL}</span> : null}
      </span>
    </button>
  )
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 10,
    paddingBottom: 16,
    boxSizing: 'border-box',
    transformOrigin: 'right top',
  },
  drawing: {
    position: 'absolute',
    top: 0,
    left: -SHADOW,
    pointerEvents: 'none',
  },
  header: {
    position: 'relative',
    padding: `0 10px 18px ${MARGIN + 12}px`,
  },
  titleRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    minWidth: 0,
    ...fonts.handBold,
    fontSize: 34,
    lineHeight: 1.3,
    color: notebook.graphite,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  subtitle: {
    ...fonts.hand,
    fontSize: 19,
    color: 'rgba(56, 56, 61, 0.6)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sections: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  section: {
    paddingTop: 6,
  },
  // Bölümün adı el yazısından ayrılsın diye küçük, kalın ve aralıklı basma harfle
  sectionTitle: {
    paddingLeft: MARGIN + 12,
    paddingBottom: 8,
    ...fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: 'rgba(56, 56, 61, 0.45)',
  },
  row: {
    width: '100%',
    minHeight: 58,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    margin: 0,
    padding: `6px 16px 6px ${MARGIN + 8}px`,
    border: 0,
    borderTop: `1px solid ${notebook.rule}`,
    background: 'transparent',
    textAlign: 'left',
  },
  lastRow: {
    borderBottom: `1px solid ${notebook.rule}`,
  },
  rowText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  label: {
    ...fonts.handBold,
    fontSize: 25,
    lineHeight: 1.15,
  },
  hint: {
    ...fonts.hand,
    fontSize: 17,
    lineHeight: 1.2,
    color: 'rgba(56, 56, 61, 0.6)',
  },
}
