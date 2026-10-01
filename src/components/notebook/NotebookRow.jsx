// Defter satırı: [tutamak] [kutu | çizgi | —] [textarea + ayna] [ilerleme] ··· [oda ayracı → kağıt dışı]
// Metin kontrollü bir <textarea>: isTyping() onu "yazıyor" sayar → oyun tuşları susar.
// Ayna katmanı textarea ile birebir aynı metriklerde; üstü çizme / başlık altı
// çizgisi aynadaki span'in arka planı olarak her sarılan satıra ayrı çizilir.
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  setText, splitRow, backspaceAt, mergeWithPrev, indentBlock, outdentBlock,
  toggleDone, nudgeBlock, insertPasted,
} from '../../utils/notebookModel'
import { applyRows, currentRoomCtx, requestFocus, teleportToRoom, useNotebookStore } from './notebookStore'
import { RoughBox, RoughCheck, RoughDash, RoughRing, Grip } from './Rough'
import { lineDataUri } from './roughUtils'
import {
  LH, TEXT_SHIFT, INDENT, GUTTER_R, FLAG_IN, FLAG_OUT, HAND, PENCIL, PENCIL_SOFT, RED_PENCIL, textMetrics,
} from './paperStyles'

function NotebookRowImpl({
  row, pageId, prevId, nextId, readOnly = false, structureLocked = false, dim = false,
  flagName = null, flagStart = false, flagAlive = false, flagCurrent = false, flagColor = null,
  progressDone = 0, progressTotal = 0, hiddenCount = 0, width = 0, fontsReady = false,
  rowRef, rowStyle, handleProps, dragging = false,
}) {
  const taRef = useRef(null)
  const [anim, setAnim] = useState(false)
  const heading = row.type === 'heading'
  const metrics = textMetrics(heading)
  const focusReq = useNotebookStore(s => (s.focusReq?.id === row.id ? s.focusReq : null))

  // Yükseklik = satır aralığının tam katı — çizgili kağıtla hizalı kalır.
  // (Chrome, Caveat'in taşan glif alanı yüzünden scrollHeight'i +1 px döndürür;
  // yuvarlanmasa her satırda 1 px kayma birikir.)
  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    const unit = heading ? LH * 2 : LH
    el.style.height = '0px'
    el.style.height = `${Math.max(unit, Math.round(el.scrollHeight / LH) * LH)}px`
  }, [row.text, heading, width, fontsReady])

  useEffect(() => {
    const el = taRef.current
    if (!focusReq || !el || readOnly) return
    el.focus({ preventScroll: false })
    const c = Math.min(focusReq.caret ?? el.value.length, el.value.length)
    el.setSelectionRange(c, c)
  }, [focusReq, readOnly])

  const apply = (fn, keepCaret) => {
    const res = applyRows(pageId, fn)
    // Alt+ok ile taşınan satırın DOM düğümü yer değiştirir → odak kaybolur, geri ver
    if (keepCaret != null && res?.focus && res.focus.caret == null) requestFocus(row.id, keepCaret)
  }

  const onChange = (e) => apply(rows => setText(rows, row.id, e.target.value, currentRoomCtx()))

  const onKeyDown = (e) => {
    if (readOnly || e.nativeEvent.isComposing) return
    const el = e.currentTarget
    const s = el.selectionStart
    const collapsed = s === el.selectionEnd
    const single = el.scrollHeight <= (heading ? LH * 2 : LH) * 1.5

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (row.type === 'todo') { setAnim(true); apply(rows => toggleDone(rows, row.id)) }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      apply(rows => splitRow(rows, row.id, s, currentRoomCtx()))
      return
    }
    if (e.key === 'Backspace' && collapsed && s === 0) {
      e.preventDefault()
      apply(rows => backspaceAt(rows, row.id))
      return
    }
    if (e.key === 'Delete' && collapsed && s === row.text.length && nextId) {
      e.preventDefault()
      apply(rows => mergeWithPrev(rows, nextId))
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (structureLocked) return
      apply(rows => (e.shiftKey ? outdentBlock(rows, row.id) : indentBlock(rows, row.id)), s)
      return
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      if (structureLocked) return
      apply(rows => nudgeBlock(rows, row.id, e.key === 'ArrowUp' ? -1 : 1), s)
      return
    }
    if (e.key === 'ArrowUp' && collapsed && prevId && (s === 0 || single)) {
      e.preventDefault()
      requestFocus(prevId, s === 0 ? null : s)
      return
    }
    if (e.key === 'ArrowDown' && collapsed && nextId && (s === row.text.length || single)) {
      e.preventDefault()
      requestFocus(nextId, s === row.text.length ? 0 : s)
    }
  }

  const onPaste = (e) => {
    if (readOnly) return
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!/\r?\n/.test(text.replace(/\s+$/, ''))) return
    e.preventDefault()
    const el = e.currentTarget
    apply(rows => insertPasted(rows, row.id, el.selectionStart, el.selectionEnd, text.replace(/\s+$/, ''), currentRoomCtx()))
  }

  const onToggle = () => {
    if (readOnly) return
    setAnim(true)
    apply(rows => toggleDone(rows, row.id))
  }

  const decorate = (row.type === 'todo' && row.done) || heading
  const mirrorSpan = decorate ? {
    color: 'transparent',
    WebkitBoxDecorationBreak: 'clone',
    boxDecorationBreak: 'clone',
    backgroundImage: lineDataUri(row.seed, heading ? 'underline' : 'strike'),
    backgroundRepeat: 'no-repeat',
    backgroundPosition: heading ? '0 100%' : '0 54%',
    backgroundSize: '100% 100%',
    paddingBottom: heading ? 2 : 0,
  } : null

  return (
    <div
      ref={rowRef}
      className={`nb-row${dragging ? ' nb-dragging' : ''}`}
      data-row-id={row.id}
      style={{
        ...s.row,
        minHeight: heading ? LH * 2 : LH,
        paddingLeft: row.depth * INDENT,
        opacity: dim ? 0.42 : 1,
        ...(dragging ? s.rowDragging : null),
        ...rowStyle,
      }}
    >
      {handleProps && (
        <button type="button" className="nb-handle" aria-label="Satırı sürükle" title="Sürükle · Alt+↑/↓ ile de taşınır" style={{ ...s.handle, marginTop: heading ? LH / 2 + 5 : 5 }} {...handleProps}>
          <Grip />
        </button>
      )}
      {!handleProps && <span aria-hidden="true" style={s.handleSpacer} />}

      {row.type === 'todo' && (
        <button
          type="button"
          className="nb-check"
          role="checkbox"
          aria-checked={row.done}
          aria-label={row.done ? 'Tamamlandı — geri al' : 'Tamamla'}
          onClick={onToggle}
          disabled={readOnly}
          style={s.check}
        >
          <RoughBox seed={row.seed} />
          {row.done && <RoughCheck seed={row.seed} animate={anim} />}
        </button>
      )}
      {row.type === 'note' && (
        <span style={s.bullet} aria-hidden="true"><RoughDash seed={row.seed} /></span>
      )}

      <div style={{ ...s.textWrap, top: TEXT_SHIFT + (heading ? 4 : 0) }}>
        <textarea
          ref={taRef}
          className="nb-text"
          value={row.text}
          rows={1}
          spellCheck={false}
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : 0}
          placeholder={heading ? 'başlık…' : row.type === 'todo' ? 'yapılacak…' : 'not…'}
          aria-label={heading ? 'Başlık' : row.type === 'todo' ? 'Yapılacak' : 'Not'}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          style={{
            ...metrics,
            ...s.textarea,
            color: row.done ? PENCIL_SOFT : PENCIL,
          }}
        />
        {decorate && (
          <div aria-hidden="true" style={{ ...metrics, ...s.mirror }}>
            <span className={anim && !heading ? 'nb-strike-anim' : undefined} style={mirrorSpan}>{row.text || '​'}</span>
          </div>
        )}
      </div>

      {progressTotal > 0 && (
        <span style={s.progress} title={`Alt görevler: ${progressDone}/${progressTotal}`}>
          <RoughRing seed={row.seed + 11} ratio={progressDone / progressTotal} />
          <span style={s.progressText}>{progressDone}/{progressTotal}</span>
        </span>
      )}

      {hiddenCount > 0 && <span style={s.badge}>+{hiddenCount}</span>}

      {/* Oda ayracı: kağıdın sağ kenarına yapıştırılmış, dışarı taşan yapışkan not.
          Grubun ilk satırında adıyla, devamında yalnızca renkli şerit olarak — her
          satır hangi odada yazıldığını kendi hizasında gösterir. */}
      {flagName && <span aria-hidden="true" style={{ ...s.strip, background: flagAlive ? flagColor : DEAD_FLAG }} />}
      {flagName && flagStart && (
        flagAlive && !flagCurrent ? (
          <button
            type="button"
            className="nb-flag"
            onClick={() => teleportToRoom(row.roomId, flagName)}
            title={`${flagName} odasına git`}
            style={{ ...s.flag, ...flagSkin(flagColor), top: heading ? LH / 2 + 3 : 3 }}
          >
            {flagName}
          </button>
        ) : (
          <span
            className="nb-flag"
            title={flagCurrent ? 'Şu an bu odadasın' : 'Bu oda artık yok'}
            style={{ ...s.flag, ...flagSkin(flagAlive ? flagColor : DEAD_FLAG), ...(flagAlive ? s.flagHere : s.flagDead), top: heading ? LH / 2 + 3 : 3 }}
          >
            {flagCurrent && <span style={s.pin} />}
            {flagName}
          </span>
        )
      )}
    </div>
  )
}

export const NotebookRow = memo(NotebookRowImpl)

const DEAD_FLAG = '#cfcac0'

// Yapışkan ayraç: kağıt üstündeki ilk kısım yarı saydam (kağıt alttan görünür)
const flagSkin = (color) => ({
  background: `linear-gradient(90deg, ${color}99 0 ${FLAG_IN}px, ${color} ${FLAG_IN}px)`,
})

const s = {
  row: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    boxSizing: 'border-box',
  },
  rowDragging: {
    zIndex: 5,
    background: 'rgba(247,242,228,0.92)',
    boxShadow: '0 10px 22px -12px rgba(40,30,10,0.45)',
    borderRadius: 4,
  },
  handle: {
    position: 'relative',
    flex: '0 0 auto',
    width: 16,
    height: 22,
    marginRight: 4,
    marginLeft: -2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 0,
    padding: 0,
    cursor: 'grab',
    touchAction: 'none',
    borderRadius: 4,
  },
  handleSpacer: { flex: '0 0 18px' },
  check: {
    position: 'relative',
    flex: '0 0 auto',
    width: 20,
    height: 20,
    marginTop: 8,
    marginRight: 12,
    padding: 0,
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
  },
  bullet: {
    flex: '0 0 auto',
    width: 12,
    marginTop: 14,
    marginLeft: 4,
    marginRight: 16,
  },
  textWrap: {
    position: 'relative',
    flex: '1 1 auto',
    minWidth: 0,
  },
  textarea: {
    display: 'block',
    background: 'transparent',
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    caretColor: RED_PENCIL,
  },
  mirror: {
    position: 'absolute',
    inset: 0,
    color: 'transparent',
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  progress: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    marginLeft: 8,
  },
  progressText: {
    fontFamily: HAND,
    fontSize: 17,
    fontWeight: 700,
    color: PENCIL_SOFT,
  },
  badge: {
    flex: '0 0 auto',
    marginTop: 4,
    marginLeft: 8,
    fontFamily: HAND,
    fontSize: 18,
    fontWeight: 700,
    color: RED_PENCIL,
  },
  // Kağıt kenarından dışarı: satırın sağ kenarı + kağıt boşluğu − kağıt üstünde kalan pay
  strip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `calc(100% + ${GUTTER_R - FLAG_IN}px)`,
    width: 7,
    opacity: 0.85,
    boxShadow: '1px 0 1px rgba(0,0,0,0.12)',
  },
  flag: {
    position: 'absolute',
    left: `calc(100% + ${GUTTER_R - FLAG_IN}px)`,
    width: FLAG_IN + FLAG_OUT - 28,
    height: 26,
    boxSizing: 'border-box',
    padding: `0 10px 0 ${FLAG_IN + 6}px`,
    border: 0,
    borderRadius: '0 3px 3px 0',
    textAlign: 'left',
    fontFamily: HAND,
    fontSize: 18,
    fontWeight: 700,
    lineHeight: '26px',
    color: PENCIL,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxShadow: '1px 2px 3px rgba(0,0,0,0.28), inset -6px 0 8px -6px rgba(0,0,0,0.18)',
    cursor: 'pointer',
    zIndex: 1,
  },
  flagHere: { cursor: 'default' },
  // "buradasın" iğnesi: ayracı tutturan küçük raptiye başı
  pin: {
    display: 'inline-block',
    width: 8,
    height: 8,
    marginRight: 6,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, #e66a5c, #9c2f25)',
    boxShadow: '0 1px 1px rgba(0,0,0,0.35)',
    verticalAlign: 1,
  },
  flagDead: {
    cursor: 'default',
    color: PENCIL_SOFT,
    textDecoration: 'line-through',
    textDecorationThickness: 1,
  },
}
