// Seyir defteri: components/board/BoardCard.tsx — panoya raptiyeyle tutturulmuş not: kendi
// kâğıdında, panoya asılırken aldığı eğiklikle durur. Kart, not sayfasının küçültülmüşüdür.
import { fonts, HAND_TAIL, notebook } from '../theme.js'
import { boardNotePreview } from './boardNotes.js'
import { PIN_SIZE, Pushpin } from './Pushpin.jsx'

// Satır aralığı, yazı ve kenar boşluğu aynı oranda küçülür
const SCALE = 0.56
const LINE = Math.round(notebook.lineHeight * SCALE)
const MARGIN_X = Math.round(notebook.marginX * SCALE)
const BODY_SIZE = 14
const TITLE_SIZE = 21
const TITLE_HEIGHT = Math.round(LINE * 1.5)
// Raptiyenin altında kalan üst boşluk ve kartın en altında yazısız kalan şerit
const TOP = Math.round(PIN_SIZE * 0.55)
const BOTTOM = 8
// Kart sayfa gibi biraz uzun
export const CARD_RATIO = 1.18

// onPress verilmezse (düzenlerken) kart açılmaz; sağ tık / basılı tutma seçenekleri açar
export function BoardCard({ note, width, onPress, onLongPress }) {
  const height = Math.round(width * CARD_RATIO)
  const { text, images, files } = boardNotePreview(note.contents)
  const title = note.title.trim()
  const header = TOP + (title ? TITLE_HEIGHT : 0)
  const lines = Math.max(1, Math.floor((height - header - BOTTOM) / LINE))
  const ruled = note.paper === 'oxford' || note.paper === 'ruled'
  const label = title || text.split('\n')[0] || 'Pano notu'

  return (
    <button
      type="button"
      onClick={onPress}
      onContextMenu={
        onLongPress
          ? (e) => {
              e.preventDefault()
              onLongPress()
            }
          : undefined
      }
      disabled={!onPress}
      aria-label={label}
      title={onPress ? 'Notu aç — sağ tıkla seçenekler' : undefined}
      className="lib-board-card"
      style={{ ...styles.card, width, height, transform: `rotate(${note.tilt}deg)` }}
    >
      <span style={styles.paper}>
        {ruled &&
          Array.from({ length: lines }, (_, i) => <span key={i} style={{ ...styles.rule, top: header + (i + 1) * LINE - 0.5 }} />)}
        {note.paper === 'oxford' && (
          <>
            <span style={{ ...styles.margin, left: MARGIN_X - 0.5, width: 1 }} />
            <span style={{ ...styles.margin, left: MARGIN_X + 3 - 0.35, width: 0.7, opacity: 0.7 }} />
          </>
        )}

        <span style={{ ...styles.content, paddingTop: TOP }}>
          {title !== '' && <span style={styles.title}>{title + HAND_TAIL}</span>}
          {text !== '' && <span style={{ ...styles.body, WebkitLineClamp: lines }}>{text + HAND_TAIL}</span>}
        </span>

        {(images > 0 || files.length > 0) && (
          <span style={styles.attachments}>
            {images > 0 && <ImageGlyph />}
            {files.length > 0 && <ClipGlyph />}
          </span>
        )}
      </span>

      <span style={styles.pin}>
        <Pushpin id={String(note.id)} color={note.pin} />
      </span>
    </button>
  )
}

function ImageGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={notebook.graphite} strokeWidth={1.8} strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  )
}

function ClipGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={notebook.graphite} strokeWidth={1.8} strokeLinecap="round">
      <path d="M8 12.5l6.5-6.5a3 3 0 0 1 4.2 4.2l-8 8a5 5 0 0 1-7-7L12 3.5" />
    </svg>
  )
}

const styles = {
  card: {
    position: 'relative',
    display: 'block',
    margin: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    transformOrigin: 'center top',
  },
  paper: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: notebook.paper,
    boxShadow: '2px 7px 10px rgba(0, 0, 0, 0.38)',
  },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0.8,
    backgroundColor: notebook.rule,
  },
  margin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: notebook.margin,
  },
  content: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: MARGIN_X + 7,
    paddingRight: 8,
  },
  title: {
    height: TITLE_HEIGHT,
    ...fonts.handBold,
    fontSize: TITLE_SIZE,
    lineHeight: `${TITLE_HEIGHT}px`,
    color: 'rgba(56, 56, 61, 0.9)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  body: {
    ...fonts.hand,
    fontSize: BODY_SIZE,
    lineHeight: `${LINE}px`,
    color: notebook.graphite,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  attachments: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    display: 'flex',
    gap: 4,
    opacity: 0.6,
  },
  pin: {
    position: 'absolute',
    top: -PIN_SIZE * 0.42,
    left: '50%',
    marginLeft: -PIN_SIZE / 2,
  },
}
