// Seyir defteri: components/notebook/PageTop.tsx — sayfanın üstü (belge modu). Başlık elle yazılır;
// altında "Sayfa N · Not defteri". Yazılan başlık tek satıra sığmazsa küçülüp iki satıra, ona da
// sığmazsa daha da küçülüp üç satıra iner; başlık alanı hep tek satırın yüksekliğindedir.
import { useLayoutEffect, useRef, useState } from 'react'

import { docPage, fonts, HAND_TAIL } from '../theme.js'
import { HandIcon } from './HandIcon.jsx'
import { DOC_ROW_LEFT, DOC_ROW_RIGHT } from './docLayout.js'

const DOC_TITLE_HEIGHT = 46
const DOC_TITLE_TIERS = [
  { lines: 1, fontSize: 30, lineHeight: 44 },
  { lines: 2, fontSize: 20, lineHeight: 22 },
  { lines: 3, fontSize: 14, lineHeight: 15 },
]

// Sayfanın üstündeki el çizimi düğmeler: solda geri; sağdakiler (okuma modu, blok seçimi, çizim,
// sayfa ayarları) sonraki fazlarda gelir
export function PageTopBar({ onBack, children }) {
  return (
    <div style={styles.top}>
      <HandIcon shape="back" label="Geri dön" size={28} onPress={onBack} />
      <div style={styles.topActions}>{children}</div>
    </div>
  )
}

// heading: { title, meta, now }
export function PageHeading({ heading, onTitleChange, onTitleSubmit, readOnly = false }) {
  return (
    <div style={styles.header}>
      <div style={styles.titleRow}>
        {heading && onTitleChange ? (
          <TitleInput title={heading.title} onChange={onTitleChange} onSubmit={onTitleSubmit} readOnly={readOnly} />
        ) : (
          <div style={styles.docTitle}>{heading ? heading.title + HAND_TAIL : ''}</div>
        )}
      </div>
      {heading && <div style={styles.docMeta}>{heading.meta}</div>}
    </div>
  )
}

// Başlığın hangi kademeye sığdığı görünmez kopyalarla ölçülür: her kademenin boyunda yazı dizilir,
// satır sayısı kademenin satırlarını aşmayan ilk kademe seçilir
function TitleInput({ title, onChange, onSubmit, readOnly }) {
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
    let chosen = { tier: DOC_TITLE_TIERS.length - 1, lines: 3 }
    for (let i = 0; i < DOC_TITLE_TIERS.length; i++) {
      const t = DOC_TITLE_TIERS[i]
      mirror.style.fontSize = `${t.fontSize}px`
      mirror.style.lineHeight = `${t.lineHeight}px`
      const lines = Math.round(mirror.scrollHeight / t.lineHeight)
      if (lines <= t.lines) {
        chosen = { tier: i, lines: Math.max(1, lines) }
        break
      }
      if (i === DOC_TITLE_TIERS.length - 1) chosen = { tier: i, lines: t.lines }
    }
    setFit((prev) => (prev.tier === chosen.tier && prev.lines === chosen.lines ? prev : chosen))
  }

  // Genişlik değişince (ve ilk çizimde) yeniden ölçülür
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure(latestTitle.current))
    ro.observe(el)
    return () => ro.disconnect()
    // measure yalnızca DOM'a ve setState'e dokunur
     
  }, [])

  function change(text) {
    const clean = text.replace(/\s*\n\s*/g, ' ')
    latestTitle.current = clean
    measure(clean)
    onChange(clean)
  }

  const tier = DOC_TITLE_TIERS[fit.tier]
  // Satırlar alanın ortasında durur
  const padTop = Math.max(0, (DOC_TITLE_HEIGHT - fit.lines * tier.lineHeight) / 2)

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
        className="nb-title-input"
        style={{
          ...styles.titleInput,
          fontSize: tier.fontSize,
          lineHeight: `${tier.lineHeight}px`,
          paddingTop: padTop,
        }}
      />
      <div ref={mirrorRef} aria-hidden="true" style={styles.titleMirror} />
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
    paddingLeft: DOC_ROW_LEFT,
    paddingRight: DOC_ROW_RIGHT,
    paddingBottom: 16,
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
