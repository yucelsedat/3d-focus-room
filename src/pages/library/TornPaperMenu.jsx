import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { colors, fonts, HAND_TAIL, notebook } from './theme.js'
import { usePortalBox, usePortalRoot } from './portalRoot.js'

// Yırtık kenarın dişlerinin derinliği; içerik bu kadar içeriden başlar
const TEAR = 6
// Kırmızı kenar boşluğu çizgisinin yeri ve satır yüksekliği; kâğıda başka içerik konunca
// (children) o da bu satırlara yazılır
export const PAPER_MARGIN = 30
export const PAPER_LINE = 46
const TITLE_SIZE = 30
const MESSAGE_SIZE = 21
const OPTION_SIZE = 27

// Her açılışta kâğıt aynı yerinden yırtılmış görünsün diye sabit tohumlu rastgele sayı üreteci
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

// Soldan sağa dişli bir kenar: base çizgisinin iki yanında TEAR kadar oynayan noktalar
function tornEdge(rand, width, base) {
  const points = []
  for (let x = 0; x < width; x += 5 + rand() * 9) points.push([x, base + (rand() - 0.5) * TEAR])
  points.push([width, base + (rand() - 0.5) * TEAR])
  return points
}

// Defterden yırtılmış kâğıt parçası: üstü ve altı dişli, yanları düz
function paperShape(width, height, seed) {
  const rand = seeded(seed)
  const top = tornEdge(rand, width, TEAR / 2)
  const bottom = tornEdge(rand, width, height - TEAR / 2).reverse()
  const toPath = (points) => points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
  return {
    outline: `M${toPath(top)} L${toPath(bottom)} Z`,
    // Yırtılan yerde kâğıdın lifleri açık renkte görünür
    edges: [`M${toPath(top)}`, `M${toPath(bottom)}`],
  }
}

export const CHECKBOX_SIZE = 24
const BOX_PATH =
  'M4 4.6 C8.4 4 13.4 4 18 4.4 C18.4 9 18.4 13.6 18.2 18.2 C13.6 18.6 8.8 18.6 4.2 18.4 C3.8 13.8 3.8 9.2 4.2 3.8'
const CHECK_PATH = 'M7.4 10.8 C8.6 12 9.6 13.2 10.6 14.6 C13.2 10.4 16.4 6.2 21.6 1.6'

// Kalem kâğıttan kalkmadan çizilmiş, ucu başlangıcı biraz geçen kare; işaretliyse taşan tik
export function HandCheckbox({ checked, tilt }) {
  return (
    <svg
      width={CHECKBOX_SIZE}
      height={CHECKBOX_SIZE}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ transform: `rotate(${tilt}deg)`, overflow: 'visible', display: 'block' }}
    >
      <g
        fill="none"
        stroke={notebook.graphite}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.92}
      >
        <path d={BOX_PATH} />
        {checked && <path d={CHECK_PATH} />}
      </g>
    </svg>
  )
}

// El yazısıyla yazılmış seçenekler (ör. kitaplıktaki bir defterin), yırtık kâğıt parçasında.
// options: { label, onPress, danger?, checked? }
export function TornPaperMenu({ visible, title, message, options = [], children, onClose }) {
  const paperRef = useRef(null)
  const box = usePortalBox()
  const target = usePortalRoot()
  const [windowWidth, setViewport] = useState(() => window.innerWidth)
  const viewport = box?.width ?? windowWidth
  const width = Math.min(viewport - 64, 300)
  const [height, setHeight] = useState(0)
  const shape = useMemo(() => height > 0 && paperShape(width, height, 7), [width, height])

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useLayoutEffect(() => {
    if (!visible) return
    const el = paperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [visible])

  // Escape kapatır; açılınca ilk seçenek odak alır (yalnızca açılışta — yazarken odak sıçramasın)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!visible) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    const first = paperRef.current?.querySelector('input, button')
    first?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [visible])

  if (!visible) return null

  return createPortal(
    <div className="lib-torn-backdrop" style={styles.backdrop} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Kapat" style={styles.dismiss} onClick={onClose} />
      <div ref={paperRef} style={{ ...styles.paper, width }}>
        {shape && (
          // Gölge kâğıdın sağına ve altına taşar; çizim alanı kâğıttan biraz büyük
          <svg style={styles.drawing} width={width + 8} height={height + 8} aria-hidden="true">
            <defs>
              <clipPath id="lib-torn">
                <path d={shape.outline} />
              </clipPath>
            </defs>
            <path d={shape.outline} fill="#000" opacity={0.35} transform="translate(4 7)" />
            <path d={shape.outline} fill={notebook.paper} />
            <g clipPath="url(#lib-torn)">
              <line x1={PAPER_MARGIN} y1={0} x2={PAPER_MARGIN} y2={height} stroke={notebook.margin} strokeWidth={1.5} />
            </g>
            {shape.edges.map((d) => (
              <path key={d} d={d} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
            ))}
          </svg>
        )}

        <div style={styles.heading}>
          <div style={{ ...styles.hand, ...styles.title }}>{title + HAND_TAIL}</div>
          {message && <div style={{ ...styles.hand, ...styles.message }}>{message + HAND_TAIL}</div>}
        </div>
        <div style={{ position: 'relative' }}>{children}</div>
        {options.map((option, i) => (
          <button
            type="button"
            key={option.label}
            onClick={option.onPress}
            role={option.checked === undefined ? undefined : 'menuitemcheckbox'}
            aria-checked={option.checked === undefined ? undefined : option.checked}
            className="lib-torn-option"
            style={{
              ...styles.option,
              ...(option.checked !== undefined ? styles.checkOption : null),
              ...(i === options.length - 1 ? styles.lastOption : null),
            }}
          >
            {option.checked !== undefined && (
              <span style={styles.checkbox}>
                <HandCheckbox checked={option.checked} tilt={i % 2 === 0 ? -3 : 2} />
              </span>
            )}
            <span style={{ ...styles.hand, ...styles.optionText, ...(option.danger ? styles.danger : null) }}>
              {option.label + HAND_TAIL}
            </span>
          </button>
        ))}
      </div>
    </div>,
    target,
  )
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.55)',
  },
  dismiss: {
    position: 'absolute',
    inset: 0,
    border: 0,
    padding: 0,
    background: 'transparent',
    cursor: 'default',
  },
  paper: {
    position: 'relative',
    boxSizing: 'border-box',
    paddingTop: TEAR + 14,
    paddingBottom: TEAR + 18,
    transform: 'rotate(-2deg)',
  },
  drawing: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'visible',
    pointerEvents: 'none',
  },
  heading: {
    position: 'relative',
    paddingLeft: PAPER_MARGIN + 12,
    paddingRight: 16,
    paddingBottom: 6,
  },
  hand: {
    color: notebook.graphite,
  },
  title: {
    ...fonts.handBold,
    fontSize: TITLE_SIZE,
    lineHeight: 1.15,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
  },
  message: {
    ...fonts.hand,
    fontSize: MESSAGE_SIZE,
    lineHeight: 1.2,
  },
  // Seçenekler kâğıdın mavi satırlarının üstüne yazılır
  option: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-end',
    width: '100%',
    height: PAPER_LINE,
    boxSizing: 'border-box',
    margin: 0,
    padding: `0 0 2px ${PAPER_MARGIN + 12}px`,
    border: 0,
    borderTop: `1px solid ${notebook.rule}`,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  checkOption: {
    gap: 10,
    paddingLeft: PAPER_MARGIN + 8,
  },
  checkbox: {
    paddingBottom: 8,
  },
  lastOption: {
    borderBottom: `1px solid ${notebook.rule}`,
  },
  optionText: {
    ...fonts.handBold,
    fontSize: OPTION_SIZE,
    lineHeight: 1.2,
  },
  danger: {
    color: colors.accent,
  },
}
