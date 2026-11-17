import { useLayoutEffect, useRef, useState } from 'react'

import { BOOK_RATIO, coverTitleStyle } from './coverStyle.js'
import { colors, fonts, type } from './theme.js'
import { usePress } from './usePress.js'

// Satırlarına sığmayan yazının harfleri küçülür (RN adjustsFontSizeToFit gibi). Boy yalnızca
// yazıya, stiline ve genişliğe bağlıdır: yazı sınırsız satırla ölçülür, sığana kadar adım adım
// küçültülür; sonra satır sayısında kırpılır.
export function FitText({ children, style, numberOfLines, minimumFontScale }) {
  const ref = useRef(null)
  const base = style.fontSize ?? 14
  const lineRatio = parseFloat(style.lineHeight) / base || 1.15
  const [size, setSize] = useState(base)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const min = base * minimumFontScale
    const fit = () => {
      const prev = { clamp: el.style.webkitLineClamp, display: el.style.display, wrap: el.style.overflowWrap }
      el.style.webkitLineClamp = 'unset'
      el.style.display = 'block'
      // Ölçerken kelimeler bölünmez: satıra sığmayan kelime de küçültme sebebidir
      el.style.overflowWrap = 'normal'
      // Tek kelime satıra sığmıyorsa (dar kapakta "Toplantılar") bölünmesin diye biraz daha küçülür
      const wordMin = base * Math.min(minimumFontScale, 0.45)
      let s = base
      for (;;) {
        el.style.fontSize = `${s}px`
        el.style.lineHeight = `${s * lineRatio}px`
        const lines = Math.round(el.scrollHeight / (s * lineRatio))
        // scrollWidth/clientWidth tamsayıya yuvarlanır; 1 px'ten az taşan kelime "sığıyor" görünür
        // ama çizerken bölünürdü. Yazının gerçek (kesirli) genişliği kutununkiyle karşılaştırılır.
        const range = document.createRange()
        range.selectNodeContents(el)
        const wordFits = range.getBoundingClientRect().width <= el.getBoundingClientRect().width + 0.01
        if (lines <= numberOfLines && wordFits) break
        const floor = wordFits ? min : wordMin
        if (s <= floor) break
        s = Math.max(floor, s - 0.5)
      }
      el.style.webkitLineClamp = prev.clamp
      el.style.display = prev.display
      el.style.overflowWrap = prev.wrap
      setSize(s)
    }
    fit()
    // Fraunces geç yüklenirse ölçü değişir: her font yüklemesi bitince yeniden ölçülür
    let alive = true
    const refit = () => alive && fit()
    document.fonts?.ready.then(refit)
    document.fonts?.addEventListener?.('loadingdone', refit)
    return () => {
      alive = false
      document.fonts?.removeEventListener?.('loadingdone', refit)
    }
  }, [children, base, lineRatio, numberOfLines, minimumFontScale, width])

  return (
    <div
      ref={ref}
      style={{
        ...style,
        fontSize: size,
        lineHeight: `${size * lineRatio}px`,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: numberOfLines,
        overflow: 'hidden',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </div>
  )
}

// Önü dönük duran defter: solda sırt, sağda lastik bant (telli defterde solda spiral), ortada
// kâğıt etiket. Kapağın arkasından sayfaların kenarı görünür. PDF köşesi kıvrık bir belge dosyası.
export function BookCover({
  width,
  title,
  children,
  color = colors.ink,
  band = colors.accent,
  binding = 'band',
  subtitle,
  hint,
  onPress,
  onLongPress,
  // Kitaplıkta düzenlerken kapak tıklanmaz; sürükleme dışarıdan yönetilir
  interactive = true,
}) {
  const height = width * BOOK_RATIO
  const spiral = binding === 'spiral'
  const press = usePress({ onPress, onLongPress, disabled: !interactive || !onPress })
  const label = (
    <>
      {children ?? (
        <FitText style={coverTitleStyle(width)} numberOfLines={2} minimumFontScale={0.7}>
          {title ?? ''}
        </FitText>
      )}
      {subtitle && (
        <div style={{ ...styles.subtitle, ...(width < 160 ? styles.subtitleSmall : null) }}>{subtitle}</div>
      )}
    </>
  )

  const Wrapper = onPress && interactive ? 'button' : 'div'
  const wrapperProps =
    Wrapper === 'button'
      ? { type: 'button', 'aria-label': title, title: hint, ...press, className: 'lib-book-press' }
      : { className: 'lib-book-static' }

  if (binding === 'file') {
    return (
      <Wrapper {...wrapperProps} style={{ ...styles.reset, width, height }}>
        <FileCover width={width} height={height} color={color} band={band}>
          {label}
        </FileCover>
      </Wrapper>
    )
  }
  return (
    <Wrapper {...wrapperProps} style={{ ...styles.reset, width, height }}>
      <div style={styles.pages} />
      <div style={{ ...styles.cover, ...(spiral ? styles.spiralCover : null), backgroundColor: color }}>
        {spiral ? (
          <div style={{ ...styles.hinge, left: width * 0.15 }} />
        ) : (
          <>
            <div style={{ ...styles.spine, width: width * 0.09 }} />
            <div style={{ ...styles.hinge, left: width * 0.11 }} />
            <div style={{ ...styles.band, right: width * 0.13, backgroundColor: band }} />
          </>
        )}
        <div
          style={{
            ...styles.label,
            marginTop: height * 0.22,
            width: width * 0.62,
            ...(spiral ? { marginLeft: width * 0.08 } : null),
          }}
        >
          {label}
        </div>
      </div>
      {spiral && <Spiral width={width} height={height} />}
    </Wrapper>
  )
}

// PDF: sağ üst köşesi içe kıvrılmış bir belge dosyası. Gövdesi kapağın renginde, kıvrık köşe
// açık tonda; ortada adın yazıldığı kâğıt etiket, altında birkaç satır izi ve sol altta lastik
// bandın renginde "PDF" etiketi.
function FileCover({ width, height, color, band, children }) {
  const fold = width * 0.26
  const r = Math.max(2, width * 0.03)
  const body = `M${r} 0 H${width - fold} L${width} ${fold} V${height - r} Q${width} ${height} ${width - r} ${height} H${r} Q0 ${height} 0 ${height - r} V${r} Q0 0 ${r} 0 Z`
  const corner = `M${width - fold} 0 V${fold - r} Q${width - fold} ${fold} ${width - fold + r} ${fold} H${width} Z`
  const small = width < 160
  return (
    <div style={styles.file}>
      <svg
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
        width={width + 4}
        height={height + 5}
        aria-hidden="true"
      >
        {/* Gölge: gövdenin biraz sağa ve aşağı kaymış koyu kopyası */}
        <path d={body} fill="rgba(0, 0, 0, 0.4)" transform="translate(3 4)" />
        <path d={body} fill={color} />
        <path d={corner} fill="rgba(255, 255, 255, 0.42)" />
        <path d={corner} fill="none" stroke="rgba(0, 0, 0, 0.18)" strokeWidth={1} />
      </svg>
      <div style={{ ...styles.label, position: 'relative', marginTop: height * 0.22, width: width * 0.66 }}>
        {children}
      </div>
      <div style={{ ...styles.fileLines, left: width * 0.12, right: width * 0.12, bottom: height * 0.2 }}>
        <div style={styles.fileLine} />
        <div style={{ ...styles.fileLine, width: '72%' }} />
      </div>
      <div
        style={{
          ...styles.fileBadge,
          ...(small ? styles.fileBadgeSmall : null),
          left: width * 0.1,
          bottom: height * 0.07,
          backgroundColor: band,
        }}
      >
        <span style={{ ...styles.fileBadgeText, color, fontSize: small ? 8 : 12 }}>PDF</span>
      </div>
    </div>
  )
}

// Telli defterin spirali: kapağın sol kenarındaki deliklerden geçip kenarın üstünden arkaya
// dolanan tel halkalar
function Spiral({ width, height }) {
  const pitch = Math.max(7, width * 0.085)
  const count = Math.floor((height - pitch) / pitch)
  const top = (height - (count - 1) * pitch) / 2
  const hole = width * 0.075
  const out = width * 0.045
  const wire = Math.max(1.4, width * 0.022)
  const drawWidth = hole + out + wire * 2

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: -out - wire, pointerEvents: 'none', overflow: 'visible' }}
      width={drawWidth}
      height={height}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => {
        const y = top + i * pitch
        const x = hole + out + wire
        const edge = wire
        const loop = `M${x} ${y} C${x - hole * 0.6} ${y - pitch * 0.55} ${edge} ${y - pitch * 0.5} ${edge} ${y - pitch * 0.05}`
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={Math.max(1.2, width * 0.018)} fill="rgba(0, 0, 0, 0.55)" />
            <path d={loop} stroke="#8E949C" strokeWidth={wire} strokeLinecap="round" fill="none" />
            <path
              d={loop}
              stroke="#E4E7EB"
              strokeWidth={wire * 0.4}
              strokeLinecap="round"
              fill="none"
              transform={`translate(${-wire * 0.15} ${-wire * 0.2})`}
            />
          </g>
        )
      })}
    </svg>
  )
}

const styles = {
  reset: {
    position: 'relative',
    display: 'block',
    padding: 0,
    margin: 0,
    border: 0,
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'inherit',
  },
  file: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  fileLines: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  fileLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  fileBadge: {
    position: 'absolute',
    padding: '2px 6px',
    borderRadius: 3,
    lineHeight: 1.2,
  },
  fileBadgeSmall: {
    padding: '1px 4px',
    borderRadius: 2,
  },
  fileBadgeText: {
    ...fonts.bodyBold,
    letterSpacing: 1,
    display: 'block',
  },
  pages: {
    position: 'absolute',
    top: 3,
    right: -3,
    bottom: 0,
    left: 6,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: colors.card,
  },
  cover: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflow: 'hidden',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    boxShadow: '3px 4px 8px rgba(0, 0, 0, 0.45)',
  },
  spiralCover: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  hinge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 5,
  },
  label: {
    boxSizing: 'border-box',
    padding: '8px 6px',
    borderRadius: 2,
    border: `1px solid ${colors.line}`,
    backgroundColor: colors.paper,
    position: 'relative',
  },
  subtitle: {
    marginTop: 4,
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 3,
    textAlign: 'center',
    color: colors.inkSoft,
  },
  subtitleSmall: {
    marginTop: 2,
    fontSize: 9,
    letterSpacing: 1.5,
  },
}
