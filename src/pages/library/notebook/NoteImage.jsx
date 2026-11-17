// Seyir defteri: components/notebook/NoteImage.tsx + NoteFile.tsx — sayfadaki ekler.
// Resim: kâğıda bantlanmış fotoğraf. Tıklayınca köşelerden büyütülüp küçültülebilir, üstteki
// düğmeden döndürülebilir, kendisinden tutulup yana ve satır satır yukarı aşağı kaydırılabilir,
// ortadaki elle tam ekran açılır. Sağ tık (ya da basılı tutma) siler.
// Dosya: ataçla tutturulmuş küçük kâğıt etiket; tıklayınca açılır.
import { useRef, useState } from 'react'

import { docPage, fonts, notebook } from '../theme.js'
import { attachmentUrl } from './attachments.js'
import { HandIcon } from './HandIcon.jsx'
import { frameSize, IMAGE_BORDER, IMAGE_PAD, imageLeft } from './imageLayout.js'

const LH = notebook.lineHeight
const MIN_LINES = 2
const MAX_LINES = 14
const HANDLE = 14
const KNOB = 16
const BAR_LEN = 22
// Bu kadar dereceye yaklaşınca düz açıya (0, 90, 180...) yapışır
const SNAP_DEG = 4
// Yana kaydırırken sola, ortaya ya da sağa bu kadar yaklaşınca oraya yapışır
const SNAP_PX = 12
const LONG_PRESS = 450

const CORNERS = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
]

function snapAngle(deg) {
  const normalized = ((((deg + 180) % 360) + 360) % 360) - 180
  const nearest = Math.round(normalized / 90) * 90
  return Math.abs(normalized - nearest) <= SNAP_DEG ? nearest : normalized
}

// rows: { current, min, max } — resmin bloktaki satırı ve inip çıkabileceği satırlar
export function NoteImage({ image, maxWidth, readOnly = false, editing, onPress, onLongPress, onChange, rows, onMove, onOpen }) {
  const frameRef = useRef(null)
  const [draftHeight, setDraftHeight] = useState(null)
  const [draftRotation, setDraftRotation] = useState(null)
  const [draftX, setDraftX] = useState(null)
  const [draftRows, setDraftRows] = useState(0)
  const action = useRef(null)
  const pressTimer = useRef(0)

  const ratio = image.width / image.height
  const height = draftHeight ?? image.lines * LH - IMAGE_PAD
  const rotation = draftRotation ?? image.rotation
  const frame = frameSize(height, ratio, maxWidth)
  const room = Math.max(0, maxWidth - frame.w)
  const left = imageLeft(draftX ?? image.x, frame.w, maxWidth)
  const maxHeight = MAX_LINES * LH - IMAGE_PAD

  function begin(e, kind, extra) {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = frameRef.current.getBoundingClientRect()
    action.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      height,
      left,
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      rotation,
      moved: false,
      ...extra,
    }
  }

  function move(e) {
    const a = action.current
    if (!a) return
    const dx = e.clientX - a.startX
    const dy = e.clientY - a.startY
    if (Math.hypot(dx, dy) > 3) {
      a.moved = true
      clearTimeout(pressTimer.current)
    }
    if (a.kind === 'resize') {
      // Köşe dışarı çekilince büyür; satır düzeni bırakılınca oturur
      const grow = (dx * a.corner.x + dy * a.corner.y) / 2
      setDraftHeight(Math.min(maxHeight, Math.max(MIN_LINES * LH - IMAGE_PAD, a.height + grow)))
    } else if (a.kind === 'rotate') {
      const angle = (Math.atan2(e.clientY - a.center.y, e.clientX - a.center.x) * 180) / Math.PI + 90
      setDraftRotation(snapAngle(angle))
    } else if (a.kind === 'move' && editing && a.moved) {
      if (room > 0) {
        let x = (a.left + dx) / room
        for (const snap of [0, 0.5, 1]) if (Math.abs((x - snap) * room) < SNAP_PX) x = snap
        setDraftX(Math.min(1, Math.max(0, x)))
      }
      if (rows) {
        const r = Math.round(dy / LH)
        setDraftRows(Math.min(rows.max - rows.current, Math.max(rows.min - rows.current, r)))
      }
    }
  }

  function end() {
    const a = action.current
    action.current = null
    clearTimeout(pressTimer.current)
    if (!a) return
    if (a.kind === 'resize') {
      const lines = Math.min(MAX_LINES, Math.max(MIN_LINES, Math.round((draftHeight ?? a.height) / LH + IMAGE_PAD / LH)))
      setDraftHeight(null)
      if (lines !== image.lines) onChange({ ...image, lines })
    } else if (a.kind === 'rotate') {
      const next = draftRotation
      setDraftRotation(null)
      if (next !== null && next !== image.rotation) onChange({ ...image, rotation: Math.round(next * 10) / 10 })
    } else if (a.kind === 'move') {
      if (a.fired) return
      if (!a.moved) {
        onPress()
        return
      }
      const x = draftX ?? image.x
      const r = draftRows
      setDraftX(null)
      setDraftRows(0)
      if (r !== 0 && onMove) onMove(x, rows.current + r)
      else if (x !== image.x) onChange({ ...image, x })
    }
  }

  return (
    // Satırın geri kalanı tıklamayı alttaki yazıya ve eklere bırakır; yalnızca fotoğraf tıklanır
    <div style={{ height: image.lines * LH, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
      <div
        ref={frameRef}
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          width: frame.w,
          height: frame.h,
          marginLeft: left,
          transform: `translateY(${draftRows * LH}px)`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rotation}deg)` }}>
          <div
            role="button"
            tabIndex={0}
            aria-label={readOnly ? 'Resim. Büyütmek için tıkla' : editing ? 'Resim. Sürükleyince yerini değiştirir, silmek için sağ tıkla' : 'Resim. Düzenlemek için tıkla, silmek için sağ tıkla'}
            className="nb-photo"
            style={{ ...styles.photo, cursor: editing ? 'move' : 'pointer' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              if (readOnly) return
              begin(e, 'move')
              pressTimer.current = setTimeout(() => {
                if (action.current && !action.current.moved) {
                  action.current.fired = true
                  onLongPress()
                }
              }, LONG_PRESS)
            }}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onClick={() => readOnly && onOpen()}
            onDoubleClick={onOpen}
            onContextMenu={(e) => {
              if (readOnly) return
              e.preventDefault()
              onLongPress()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen()
              if (!readOnly && (e.key === 'Delete' || e.key === 'Backspace')) onLongPress()
            }}
          >
            <img
              src={attachmentUrl(image.name)}
              alt=""
              draggable={false}
              style={{ display: 'block', width: frame.w - IMAGE_BORDER * 2, height: frame.h - IMAGE_BORDER * 2, objectFit: 'cover' }}
            />
            <span style={styles.tape} />
          </div>

          {editing && !readOnly && (
            <>
              <span style={styles.selection} />
              <span style={{ ...styles.bar, left: frame.w / 2 - 0.75 }} />
              <span
                className="nb-image-handle"
                style={{ ...styles.knob, left: frame.w / 2 - KNOB / 2, cursor: 'grab' }}
                onPointerDown={(e) => begin(e, 'rotate')}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                title="Döndür"
              />
              {CORNERS.map((corner) => (
                <span
                  key={`${corner.x}${corner.y}`}
                  className="nb-image-handle"
                  title="Büyüt / küçült"
                  style={{
                    ...styles.corner,
                    ...(corner.x < 0 ? { left: -HANDLE / 2 } : { right: -HANDLE / 2 }),
                    ...(corner.y < 0 ? { top: -HANDLE / 2 } : { bottom: -HANDLE / 2 }),
                    cursor: corner.x * corner.y > 0 ? 'nwse-resize' : 'nesw-resize',
                  }}
                  onPointerDown={(e) => begin(e, 'resize', { corner })}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                />
              ))}
              <span style={styles.handWrap}>
                <span style={styles.handButton}>
                  <HandIcon shape="hand" label="Resmi eline al" onPress={onOpen} size={30} stroke={1.7} />
                </span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Sayfaya ataçla tutturulmuş küçük kâğıt etiket; satır düzeni bozulmasın diye 2 satır yüksekliğinde
// hand: not defterinde etiketin adı el yazısıyla
export function NoteFile({ file, onPress, onLongPress, hand = false }) {
  return (
    <div style={styles.fileBlock}>
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
        aria-label={onLongPress ? `${file.label} dosyasını aç, silmek için sağ tıkla` : `${file.label} dosyasını aç`}
        title={file.label}
        className="nb-file-tag"
        style={styles.tag}
      >
        <span style={hand ? { ...styles.fileLabel, ...styles.handLabel } : styles.fileLabel}>{file.label}</span>
        <span style={styles.clip} />
      </button>
    </div>
  )
}

const styles = {
  photo: {
    position: 'relative',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    padding: IMAGE_BORDER,
    backgroundColor: '#FFFFFF',
    boxShadow: '1px 2px 3px rgba(59, 47, 26, 0.25)',
    touchAction: 'none',
    outline: 'none',
  },
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
  selection: {
    position: 'absolute',
    inset: -4,
    border: `1.2px dashed ${notebook.graphite}`,
    opacity: 0.7,
    pointerEvents: 'none',
  },
  bar: {
    position: 'absolute',
    top: -BAR_LEN,
    width: 1.5,
    height: BAR_LEN - 4,
    backgroundColor: notebook.graphite,
    opacity: 0.7,
    pointerEvents: 'none',
  },
  knob: {
    position: 'absolute',
    top: -BAR_LEN - KNOB / 2,
    width: KNOB,
    height: KNOB,
    boxSizing: 'border-box',
    borderRadius: KNOB / 2,
    border: `1.8px solid ${notebook.graphite}`,
    backgroundColor: notebook.paper,
    touchAction: 'none',
  },
  corner: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    boxSizing: 'border-box',
    borderRadius: 3,
    border: `1.8px solid ${notebook.graphite}`,
    backgroundColor: notebook.paper,
    touchAction: 'none',
  },
  handWrap: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  handButton: {
    pointerEvents: 'auto',
    width: 44,
    height: 44,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 247, 236, 0.9)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
  fileBlock: {
    height: LH * 2,
    display: 'flex',
    alignItems: 'center',
  },
  tag: {
    position: 'relative',
    maxWidth: '100%',
    margin: 0,
    padding: '6px 14px 6px 22px',
    backgroundColor: '#FFFDF5',
    border: '1px solid rgba(56, 56, 61, 0.25)',
    borderRadius: 2,
    transform: 'rotate(-0.8deg)',
    boxShadow: '1px 1px 2px rgba(59, 47, 26, 0.18)',
    cursor: 'pointer',
  },
  handLabel: {
    ...fonts.handBold,
    fontSize: 20,
    color: notebook.graphite,
  },
  fileLabel: {
    display: 'block',
    ...fonts.bodyBold,
    fontSize: 14,
    color: docPage.ink,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // Etiketin sol kenarına takılmış ataç
  clip: {
    position: 'absolute',
    left: 6,
    top: -7,
    width: 9,
    height: 26,
    boxSizing: 'border-box',
    border: '1.6px solid #8D9199',
    borderRadius: 5,
    transform: 'rotate(8deg)',
  },
}
