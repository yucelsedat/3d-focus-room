// Seyir defteri: components/notebook/PageTop.tsx — sayfanın üstü. Başlık elle yazılır;
// altında "Sayfa N · Not defteri". Yazılan başlık tek satıra sığmazsa küçülüp iki satıra, ona da
// sığmazsa daha da küçülüp üç satıra iner; başlık alanı hep tek satırın yüksekliğindedir.
import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

import { colors, docPage, fonts, HAND_TAIL, notebook } from '../theme.js'
import { HandIcon } from './HandIcon.jsx'
import { DOC_ROW_LEFT, DOC_ROW_RIGHT } from './docLayout.js'

// Not defterinde başlık el yazısıyla: tek satırda büyük, uzadıkça küçülüp iki, üç satıra iner
const TITLE_HEIGHT = 62
const TITLE_TIERS = [
  { lines: 1, fontSize: 46, lineHeight: 62 },
  { lines: 2, fontSize: 28, lineHeight: 29 },
  { lines: 3, fontSize: 19, lineHeight: 20 },
]

// PDF'te başlık Fraunces'le, daha küçük kademelerle yazılır
const DOC_TITLE_HEIGHT = 46
const DOC_TITLE_TIERS = [
  { lines: 1, fontSize: 30, lineHeight: 44 },
  { lines: 2, fontSize: 20, lineHeight: 22 },
  { lines: 3, fontSize: 14, lineHeight: 15 },
]

// Sayfanın üstündeki el çizimi düğmeler: solda geri; sağdakiler (okuma modu, blok seçimi, çizim,
// sayfa ayarları) sonraki fazlarda gelir
// tight: ajandada sağda sekiz düğme olabilir; dar ekrana sığsınlar diye aralar daralır
export function PageTopBar({ onBack, tight = false, children }) {
  return (
    <div style={styles.top}>
      {/* Duvardaki defter tile'ında geri yoktur; sağdaki düğmeler yine sağda kalsın diye yer tutulur */}
      {onBack ? <HandIcon shape="back" label="Geri dön" size={28} onPress={onBack} /> : <span />}
      <div style={{ ...styles.topActions, ...(tight ? { gap: 7 } : null) }}>{children}</div>
    </div>
  )
}

// heading: { title, meta, now }. document: PDF'te başlık beyaz kâğıdın üstünde basılı harflerle
export function PageHeading({ heading, onTitleChange, onTitleSubmit, readOnly = false, document = true }) {
  return (
    <div style={document ? styles.docHeader : styles.header}>
      <div style={styles.titleRow}>
        {heading && onTitleChange ? (
          <TitleInput title={heading.title} onChange={onTitleChange} onSubmit={onTitleSubmit} readOnly={readOnly} document={document} />
        ) : (
          <FittedTitle style={document ? styles.docTitle : styles.title} text={heading ? heading.title + HAND_TAIL : ''} />
        )}
        {heading?.now && (
          <div style={styles.today}>
            <span style={styles.todayDot} />
            <span style={styles.todayText}>{heading.now + HAND_TAIL}</span>
          </div>
        )}
      </div>
      {heading && <div style={document ? styles.docMeta : styles.meta}>{document ? heading.meta : heading.meta + HAND_TAIL}</div>}
    </div>
  )
}

// "2. Hafta Değerlendirme" gibi uzun başlıklar tek satıra sığacak kadar (en çok %60'ına) küçülür
function FittedTitle({ style, text }) {
  const ref = useRef(null)
  const [scale, setScale] = useState(1)
  const fit = useEffectEvent(() => {
    const el = ref.current
    if (!el) return
    // Yazının kendi eni (bloğun eni değil); küçültülmüşse ölçekten geri hesaplanır
    const range = document.createRange()
    range.selectNodeContents(el)
    const full = range.getBoundingClientRect().width / scale
    const next = full > el.clientWidth ? Math.max(0.6, el.clientWidth / full) : 1
    if (Math.abs(next - scale) > 0.01) setScale(next)
  })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    fit()
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])
  return (
    <div ref={ref} style={{ ...style, fontSize: style.fontSize * scale }}>
      {text}
    </div>
  )
}

// Başlığın hangi kademeye sığdığı görünmez kopyalarla ölçülür: her kademenin boyunda yazı dizilir,
// satır sayısı kademenin satırlarını aşmayan ilk kademe seçilir
function TitleInput({ title, onChange, onSubmit, readOnly, document }) {
  const tiers = document ? DOC_TITLE_TIERS : TITLE_TIERS
  const height = document ? DOC_TITLE_HEIGHT : TITLE_HEIGHT
  const boxRef = useRef(null)
  const mirrorRef = useRef(null)
  const latestTitle = useRef(title)
  const [measured, setFit] = useState({ tier: 0, lines: 1 })
  const fit = title === '' ? { tier: 0, lines: 1 } : measured

  // Görünmez kopyaya yazı konur, her kademenin boyunda kaç satır tuttuğu ölçülür
  function measure(text) {
    const mirror = mirrorRef.current
    if (!mirror) return
    mirror.textContent = text
    let chosen = { tier: tiers.length - 1, lines: 3 }
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i]
      mirror.style.fontSize = `${t.fontSize}px`
      mirror.style.lineHeight = `${t.lineHeight}px`
      const lines = Math.round(mirror.scrollHeight / t.lineHeight)
      if (lines <= t.lines) {
        chosen = { tier: i, lines: Math.max(1, lines) }
        break
      }
      if (i === tiers.length - 1) chosen = { tier: i, lines: t.lines }
    }
    setFit((prev) => (prev.tier === chosen.tier && prev.lines === chosen.lines ? prev : chosen))
  }

  // Genişlik değişince (ve ilk çizimde) yeniden ölçülür
  const remeasure = useEffectEvent(() => measure(latestTitle.current))
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => remeasure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function change(text) {
    const clean = text.replace(/\s*\n\s*/g, ' ')
    latestTitle.current = clean
    measure(clean)
    onChange(clean)
  }

  const tier = tiers[fit.tier]
  // Satırlar alanın ortasında durur
  const padTop = Math.max(0, (height - fit.lines * tier.lineHeight) / 2)

  return (
    <div ref={boxRef} style={styles.titleBox}>
      <textarea
        value={title}
        // Başlık tek paragraftır; yapıştırılan satır sonları boşluğa döner
        onChange={(e) => change(e.target.value)}
        readOnly={readOnly}
        placeholder={readOnly ? '' : 'Başlık'}
        aria-label="Sayfanın başlığı"
        maxLength={60}
        rows={1}
        spellCheck
        // Enter satır açmaz: başlık biter, sayfanın ilk satırında blok açılır
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (onSubmit) onSubmit()
            else e.currentTarget.blur()
          }
        }}
        className={document ? 'nb-title-input' : 'nb-title-input nb-hand-title'}
        style={{
          ...styles.titleInput,
          ...(document ? null : styles.handTitleInput),
          fontSize: tier.fontSize,
          lineHeight: `${tier.lineHeight}px`,
          paddingTop: padTop,
        }}
      />
      <div ref={mirrorRef} aria-hidden="true" style={{ ...styles.titleMirror, ...(document ? null : styles.handMirror) }} />
    </div>
  )
}

const styles = {
  top: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '4px 10px 0',
  },
  topActions: {
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
  },
  header: {
    paddingLeft: notebook.marginX + 12,
    paddingRight: 20,
    paddingBottom: 6,
    flexShrink: 0,
  },
  docHeader: {
    paddingLeft: DOC_ROW_LEFT,
    paddingRight: DOC_ROW_RIGHT,
    paddingBottom: 16,
  },
  // Harflerin kuyrukları satırdan taşar; fazlası eksi kenar boşluğuyla geri alınır
  title: {
    flexShrink: 1,
    minWidth: 0,
    margin: '-6px 0',
    ...fonts.handBold,
    fontSize: 46,
    lineHeight: '62px',
    color: 'rgba(56, 56, 61, 0.9)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  handTitleInput: {
    margin: '-6px 0',
    height: TITLE_HEIGHT,
    ...fonts.handBold,
    color: 'rgba(56, 56, 61, 0.9)',
    caretColor: notebook.graphite,
  },
  handMirror: {
    ...fonts.handBold,
  },
  meta: {
    ...fonts.hand,
    fontSize: 19,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  today: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexShrink: 0,
  },
  todayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.today,
  },
  todayText: {
    ...fonts.handBold,
    fontSize: 22,
    color: colors.today,
  },
  titleRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docTitle: {
    ...fonts.displayBold,
    fontSize: 30,
    lineHeight: '40px',
    color: docPage.ink,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  titleBox: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
  },
  titleInput: {
    display: 'block',
    width: '100%',
    height: DOC_TITLE_HEIGHT,
    boxSizing: 'border-box',
    margin: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    border: 0,
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    background: 'transparent',
    ...fonts.displayBold,
    color: docPage.ink,
    caretColor: docPage.ink,
  },
  // Kademeleri ölçen görünmez kopya başlığın genişliğinde dizilir
  titleMirror: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    ...fonts.displayBold,
  },
  docMeta: {
    marginTop: 2,
    ...fonts.bodyThin,
    fontSize: 12,
    letterSpacing: 1,
    color: docPage.muted,
  },
}
