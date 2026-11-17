import { useEffect, useRef, useState } from 'react'

import { colors, fonts, HAND_TAIL } from './theme.js'

// Defter açılırken ekranın ortasında yaprakları rüzgarda savrulan küçük bir defter (seyir defteri:
// components/notebook/NotebookLoader.tsx). Animasyon CSS'te döner; JS meşgulken takılmaz.
// done olunca en az MIN_VISIBLE ms görünmüş olarak solar ve onHidden çağrılır.

const PAGE_W = 64
const PAGE_H = 86
const COVER = 6
const LEAVES = 3
const CYCLE = 2400
const MIN_VISIBLE = 1000
const FADE_MS = 260

// Yaprak i: [ileri başlangıç, ileri bitiş, geri başlangıç, geri bitiş] — tur oranı olarak
function leafTimes(i) {
  const fwdStart = i * 0.1
  const backStart = 0.52 + (LEAVES - 1 - i) * 0.12
  return [fwdStart, fwdStart + 0.3, backStart, backStart + 0.24].map((t) => Math.round(t * 1000) / 10)
}

const keyframes = Array.from({ length: LEAVES }, (_, i) => {
  const [a, b, c, d] = leafTimes(i)
  // Sağda ilk savrulacak yaprak üstte durur; solda en son inen yaprak üste gelir
  const right = 10 + LEAVES - i
  const left = 10 + i
  return `@keyframes lib-leaf-${i} {
    0% { transform: perspective(${PAGE_W * 6}px) rotateY(0deg); z-index: ${right}; }
    ${a}% { transform: perspective(${PAGE_W * 6}px) rotateY(0deg); z-index: ${right}; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
    ${(a + b) / 2}% { z-index: ${left}; }
    ${b}% { transform: perspective(${PAGE_W * 6}px) rotateY(-180deg); z-index: ${left}; }
    ${c}% { transform: perspective(${PAGE_W * 6}px) rotateY(-180deg); z-index: ${left}; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
    ${(c + d) / 2}% { z-index: ${right}; }
    ${d}% { transform: perspective(${PAGE_W * 6}px) rotateY(0deg); z-index: ${right}; }
    100% { transform: perspective(${PAGE_W * 6}px) rotateY(0deg); z-index: ${right}; }
  }
  @keyframes lib-leaf-shade-${i} {
    0%, ${a}% { opacity: 0; }
    ${(a + b) / 2}% { opacity: 0.28; }
    ${b}%, ${c}% { opacity: 0; }
    ${(c + d) / 2}% { opacity: 0.28; }
    ${d}%, 100% { opacity: 0; }
  }`
}).join('\n')

export function NotebookLoader({ done, onHidden }) {
  const shownAt = useRef(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    shownAt.current = Date.now()
  }, [])

  useEffect(() => {
    if (!done) return
    const wait = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt.current))
    const t1 = setTimeout(() => setFading(true), wait)
    const t2 = setTimeout(() => onHidden?.(), wait + FADE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [done, onHidden])

  return (
    <div
      aria-busy={!done}
      aria-label="Defter açılıyor"
      style={{
        ...styles.overlay,
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: done ? 'none' : 'auto',
      }}
    >
      <style>{keyframes}</style>
      <div style={styles.book}>
        <div style={{ ...styles.page, ...styles.leftPage }}>
          <Lines />
        </div>
        <div style={{ ...styles.page, ...styles.rightPage }}>
          <Lines />
        </div>
        {Array.from({ length: LEAVES }, (_, i) => (
          <div
            key={i}
            style={{
              ...styles.page,
              ...styles.leaf,
              animation: `lib-leaf-${i} ${CYCLE}ms linear infinite`,
            }}
          >
            <Lines />
            <div style={{ ...styles.shade, animation: `lib-leaf-shade-${i} ${CYCLE}ms linear infinite` }} />
          </div>
        ))}
        <div style={styles.spine} />
      </div>
      <div style={styles.caption}>{`Defter açılıyor${HAND_TAIL}`}</div>
    </div>
  )
}

function Lines() {
  return (
    <div style={styles.lines}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ ...styles.line, ...(i === 5 ? styles.shortLine : null) }} />
      ))}
    </div>
  )
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B2620',
  },
  book: {
    position: 'relative',
    width: PAGE_W * 2 + COVER * 2,
    height: PAGE_H + COVER * 2,
    padding: COVER,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    borderRadius: 6,
    backgroundColor: colors.ink,
    boxShadow: '0 6px 12px rgba(0, 0, 0, 0.35)',
  },
  page: {
    position: 'relative',
    width: PAGE_W,
    height: PAGE_H,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  leftPage: {
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  rightPage: {
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  leaf: {
    position: 'absolute',
    top: COVER,
    left: COVER + PAGE_W,
    backgroundColor: colors.card,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    transformOrigin: 'left center',
  },
  shade: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#000',
    opacity: 0,
  },
  spine: {
    position: 'absolute',
    top: COVER,
    bottom: COVER,
    left: COVER + PAGE_W - 1,
    width: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    zIndex: 50,
  },
  lines: {
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 9px 0',
    gap: 10,
  },
  line: {
    height: 1,
    backgroundColor: colors.line,
  },
  shortLine: {
    width: '55%',
  },
  caption: {
    marginTop: 22,
    ...fonts.hand,
    fontSize: 24,
    color: 'rgba(244, 239, 230, 0.72)',
  },
}
