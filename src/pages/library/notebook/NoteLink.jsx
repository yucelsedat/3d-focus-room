// focus-room eklentisi: sayfadaki link kartı. Kart canvas tile'daki kartın kendisidir (LinkCard,
// YoutubeCard, InstaCard) — canvas'ın mantıksal ölçüsünde çizilip kâğıda sığacak kadar küçültülür,
// böylece iki yüzey aynı görünür. Kartın kapladığı yükseklik satır aralığının katıdır, alttaki yazı
// çizgiden kaymaz. Tıklayınca link yeni sekmede açılır; sağ tık (ya da basılı tutma) siler.
import { useLayoutEffect, useRef, useState } from 'react'

import { InstaCard, LinkCard, YoutubeCard } from '../../../components/canvas/cards.jsx'
import { usePress } from '../usePress.js'
import { docPage, notebook } from '../theme.js'

// Canvas'taki kart ölçüleri (canvasUtils buildPasteItems ile aynı) ve kâğıttaki en geniş hâli
const CARDS = {
  link: { w: 480, h: 300, radius: 4, max: 320, Card: LinkCard },
  youtube: { w: 480, h: 270, radius: 4, max: 320, Card: YoutubeCard },
  insta: { w: 320, h: 560, radius: 22, max: 190, Card: InstaCard },
}
// Kartın üstünde ve altında kalan boşluk (gölge ve bant sığsın)
const PAD = 8

export function NoteLink({ link, onLongPress, hand = false }) {
  const spec = CARDS[link.kind] ?? CARDS.link
  const boxRef = useRef(null)
  const [room, setRoom] = useState(null)
  const LH = hand ? notebook.lineHeight : docPage.lineHeight

  // Kart bulunduğu yerin genişliğini aşmaz (dar ekranda küçülür)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setRoom(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const width = Math.max(80, Math.min(spec.max, room ?? spec.max))
  const scale = width / spec.w
  const height = Math.round(spec.h * scale)
  const blockHeight = Math.ceil((height + PAD * 2) / LH) * LH
  const press = usePress({ onPress: () => window.open(link.url, '_blank', 'noopener'), onLongPress })
  const { Card } = spec
  const label = link.title || link.url

  return (
    <div ref={boxRef} style={{ ...styles.block, height: blockHeight }}>
      <button
        type="button"
        {...press}
        aria-label={onLongPress ? `${label} — aç, silmek için sağ tıkla` : `${label} — aç`}
        title={link.url}
        className="nb-link-card"
        style={{
          ...styles.card,
          width,
          height,
          borderRadius: spec.radius * scale,
          marginTop: Math.floor((blockHeight - height) / 2),
          transform: hand ? 'rotate(-0.8deg)' : undefined,
        }}
      >
        <span style={{ ...styles.scaled, width: spec.w, height: spec.h, transform: `scale(${scale})` }}>
          <Card item={{ ...link, type: link.kind }} />
        </span>
        {hand && <span style={styles.tape} aria-hidden="true" />}
      </button>
    </div>
  )
}

const styles = {
  block: {
    position: 'relative',
    width: '100%',
  },
  card: {
    position: 'relative',
    display: 'block',
    margin: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    boxShadow: '1px 2px 4px rgba(59, 47, 26, 0.28)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  // Canvas ölçüsündeki kart sol üstten küçültülür
  scaled: {
    position: 'absolute',
    top: 0,
    left: 0,
    display: 'block',
    transformOrigin: '0 0',
    pointerEvents: 'none',
  },
  // Not defterinde kâğıda bantlanmış gibi (fotoğraflardaki bant)
  tape: {
    position: 'absolute',
    top: -6,
    left: '50%',
    marginLeft: -23,
    width: 46,
    height: 14,
    backgroundColor: 'rgba(222, 205, 150, 0.6)',
    transform: 'rotate(4deg)',
    pointerEvents: 'none',
  },
}
