// Seyir defteri: components/notebook/NoteTextSegment.tsx (HandTextSegment) — not defterinde ve
// ajandada bir yazı bölümü: çizgili kâğıda el yazısı (Caveat). Web'de yazı alanı görünmez yazılı bir
// textarea'dır; arkasında aynı yazıyla çizilen ayna kalem renklerini, fosforlu kalemin boyasını ve
// yapılacak satırlarının el çizimi kutularını taşır (tek font: imleç aynayla birebir hizalı kalır).
//
// Ref arayüzü: focus(), blur(), setSelection(start, end)
import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { HandCheckbox } from '../TornPaperMenu.jsx'
import { fonts, HAND_TAIL, inkOf, notebook } from '../theme.js'
import { HighlightLayer } from './HighlightStroke.jsx'
import { BOX, BOX_DONE, boxOffsets, continueList, enterAction, toggleBox } from './noteLists.js'
import { pastedLink } from './linkCards.js'

const LH = notebook.lineHeight
// Fosforlu kalemin satırdaki şeridi: harflerin gövdesinden tabanına kadar
const STROKE_ROWS = { lineHeight: LH, top: 8, height: 24 }
// Kutulu satırı kutusundan tutup taşımak için basılı tutma süresi
const HOLD_MS = 280
const NO_MARKS = []

// Kutunun açısı yerine göre değişir; aynı kutu her çizimde aynı kalır
function boxTilt(offset) {
  return (((offset * 37) % 5) - 2) * 1.2
}

function lineIndexAt(value, offset) {
  let line = 0
  for (let i = 0; i < offset; i++) if (value[i] === '\n') line++
  return line
}

// Ayna: kalem renklerinin ve kutuların sınırlarından bölünmüş parçalar (ham yazıdaki yerleriyle)
function pieces(value, boxes, inks) {
  const cuts = new Set([0, value.length])
  for (const offset of boxes) {
    cuts.add(offset)
    cuts.add(offset + 1)
  }
  for (const ink of inks) {
    cuts.add(Math.min(ink.start, value.length))
    cuts.add(Math.min(ink.end, value.length))
  }
  const points = [...cuts].sort((a, b) => a - b)
  const boxSet = new Set(boxes)
  const out = []
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    const ink = inks.find((m) => m.start <= from && m.end >= to)
    out.push({ from, text: value.slice(from, to), box: boxSet.has(from), color: ink ? inkOf(ink.color).color : null })
  }
  return out
}

export function HandText({
  ref,
  value,
  readOnly = false,
  placeholder,
  onChangeText,
  onSelectionChange,
  onSelect,
  onFocus,
  onBlur,
  highlights = NO_MARKS,
  inks = NO_MARKS,
  onMoveLine,
  times = NO_MARKS,
  firstInNote = false,
  onEnter,
  onBackspaceAtStart,
  onPasteImage,
  onPasteLink,
}) {
  const wrapRef = useRef(null)
  const mirrorRef = useRef(null)
  const inputRef = useRef(null)
  const pendingCursor = useRef(null)
  const selection = useRef({ start: 0, end: 0 })
  // Kutuların ve mantıksal satırların aynadaki yerleri (yazının sol üstüne göre)
  const [geometry, setGeometry] = useState({ boxes: [], lines: [] })
  const [lineDrag, setLineDrag] = useState(null)
  const dragLive = useRef(null)
  const offsets = boxOffsets(value)
  const parts = pieces(value, offsets, inks)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    setSelection: (start, end) => inputRef.current?.setSelectionRange(start, end),
  }))

  // Yazı değişince alan boyu aynaya uyar, bekleyen imleç konur, kutuların yeri ölçülür
  useLayoutEffect(() => {
    const mirror = mirrorRef.current
    const wrap = wrapRef.current
    if (!mirror || !wrap) return
    if (pendingCursor.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current)
      pendingCursor.current = null
    }
    const base = mirror.getBoundingClientRect()
    const boxes = []
    for (const el of mirror.querySelectorAll('[data-box]')) {
      const r = el.getBoundingClientRect()
      boxes.push({ offset: Number(el.dataset.box), x: r.left - base.left, width: r.width, y: Math.floor((r.top - base.top + r.height / 2) / LH) * LH })
    }
    // Her mantıksal satırın (satır sonundan satır sonuna; sığmayıp alta kayan kısmı dahil) yeri
    const starts = [0]
    for (let i = 0; i < value.length; i++) if (value[i] === '\n') starts.push(i + 1)
    const tops = starts.map((start) => {
      const point = textPoint(mirror, start)
      if (!point) return 0
      const range = document.createRange()
      range.setStart(point.node, point.offset)
      range.setEnd(point.node, Math.min(point.node.length, point.offset + 1))
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect()
      return Math.floor((r.top - base.top + r.height / 2) / LH) * LH
    })
    const height = mirror.offsetHeight
    const lines = tops.map((top, i) => ({ top, height: Math.max(LH, (tops[i + 1] ?? height) - top) }))
    const next = { boxes, lines }
    // Ölçüler DOM'dan alınır; aynı ölçüye gelince durur
    if (JSON.stringify(next) !== JSON.stringify(geometry)) setGeometry(next)
  }, [value, inks, geometry])

  function report(el) {
    selection.current = { start: el.selectionStart, end: el.selectionEnd }
    onSelectionChange(el.selectionEnd)
    onSelect?.(Math.min(el.selectionStart, el.selectionEnd), Math.max(el.selectionStart, el.selectionEnd))
  }

  // Enter bloğu böler, liste satırında yeni satır işaretiyle sürer (bkz. noteLists enterAction)
  function changeText(text, cursor) {
    if (onEnter) {
      const action = enterAction(value, text, cursor)
      if (action?.kind === 'split') {
        onEnter(action.at, action.prefix)
        return
      }
      if (action?.kind === 'edit') {
        pendingCursor.current = action.edit.cursor
        onChangeText(action.edit.text)
        return
      }
    }
    const edit = continueList(value, text, cursor)
    if (!edit) {
      onChangeText(text)
      return
    }
    pendingCursor.current = edit.cursor
    onChangeText(edit.text)
  }

  // Kutulu satır kutusundan basılı tutulup sürüklenince yazının satırları arasında yer değiştirir
  function boxPointerDown(e, line) {
    if (readOnly || !onMoveLine || e.button !== 0) return
    const startY = e.clientY
    const target = e.currentTarget
    const pointerId = e.pointerId
    dragLive.current = {
      startY,
      pointerId,
      line,
      pending: setTimeout(() => {
        try {
          target.setPointerCapture(pointerId)
        } catch {
          // işaretçi bu arada kalktıysa
        }
        dragLive.current = { ...dragLive.current, pending: null, active: true }
        setLineDrag({ line, offset: 0, to: line })
      }, HOLD_MS),
    }
  }

  function boxPointerMove(e) {
    const d = dragLive.current
    if (!d || e.pointerId !== d.pointerId) return
    if (d.pending) {
      if (Math.abs(e.clientY - d.startY) > 6) {
        clearTimeout(d.pending)
        dragLive.current = null
      }
      return
    }
    const lines = geometry.lines
    const own = lines[d.line]
    if (!own) return
    const dy = e.clientY - d.startY
    const center = own.top + own.height / 2 + dy
    let to = 0
    for (let i = 0; i < lines.length; i++) if (i !== d.line && lines[i].top + lines[i].height / 2 < center) to++
    d.to = to
    setLineDrag({ line: d.line, offset: dy, to })
  }

  function boxPointerUp(e, offset) {
    const d = dragLive.current
    if (!d || e.pointerId !== d.pointerId) return
    dragLive.current = null
    if (d.pending) {
      clearTimeout(d.pending)
      // Kısa dokunuş kutuyu işaretler / işareti kaldırır
      if (!readOnly) onChangeText(toggleBox(value, offset))
      return
    }
    setLineDrag(null)
    if (d.to !== d.line) onMoveLine(d.line, d.to)
  }

  const dropTop = (() => {
    if (!lineDrag || lineDrag.to === lineDrag.line) return null
    const others = geometry.lines.filter((_, i) => i !== lineDrag.line)
    if (lineDrag.to < others.length) return others[lineDrag.to].top
    const last = others[others.length - 1]
    return last ? last.top + last.height : 0
  })()

  const empty = value === ''
  const lineTexts = lineDrag ? value.split('\n') : null
  // Satırı sürüklenen yazı öne alınır; satır kendi notunun üstünde yürür
  return (
    <div ref={wrapRef} style={{ ...styles.wrap, ...(lineDrag ? styles.raised : null) }}>
      <div style={{ position: 'relative' }}>
        {highlights.length > 0 && <HighlightLayer rootRef={mirrorRef} highlights={highlights} version={value} rows={STROKE_ROWS} />}
        {/* Ayna: yazının görünen hâli. Yazı alanı bunun üstünde, harfleri saydam. */}
        <div ref={mirrorRef} aria-hidden="true" style={{ ...styles.text, ...styles.mirror, ...(readOnly ? styles.reading : null) }}>
          {empty && !readOnly && placeholder ? <span style={styles.placeholder}>{placeholder}</span> : null}
          {parts.map((p) => (
            <span
              key={p.from}
              data-raw={p.from}
              data-len={p.text.length}
              {...(p.box ? { 'data-box': p.from } : null)}
              style={p.box ? styles.hiddenBox : p.color ? { color: p.color } : undefined}
            >
              {p.text}
            </span>
          ))}
          {'​'}
        </div>
        {!readOnly && (
          <textarea
            ref={inputRef}
            value={value}
            rows={1}
            spellCheck
            aria-label="Not"
            className="nb-hand-input"
            style={{ ...styles.text, ...styles.input }}
            onChange={(e) => {
              changeText(e.target.value, e.target.selectionStart)
              report(e.target)
            }}
            onSelect={(e) => report(e.currentTarget)}
            onFocus={onFocus}
            onBlur={onBlur}
            onPaste={(e) => {
              const image = [...(e.clipboardData.files ?? [])].find((f) => f.type.startsWith('image/'))
              if (image && onPasteImage) {
                e.preventDefault()
                onPasteImage(image)
                return
              }
              const link = onPasteLink ? pastedLink(e.clipboardData) : null
              if (link) {
                e.preventDefault()
                onPasteLink(link)
              }
            }}
            onKeyDown={(e) => {
              const el = e.currentTarget
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && onEnter) {
                // Enter yazıya satır sonu koymaz; bölme ya da liste burada yapılır
                e.preventDefault()
                const from = Math.min(el.selectionStart, el.selectionEnd)
                const to = Math.max(el.selectionStart, el.selectionEnd)
                changeText(value.slice(0, from) + '\n' + value.slice(to), from + 1)
              } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && onBackspaceAtStart) {
                e.preventDefault()
                onBackspaceAtStart()
              }
            }}
          />
        )}

        {/* Kutuya tıklayınca işaretlenir; basılı tutup sürükleyince satır taşınır */}
        {geometry.boxes.map((box) => (
          <span
            key={box.offset}
            role="checkbox"
            aria-checked={value[box.offset] !== BOX}
            aria-label="Yapılacak"
            title={readOnly ? undefined : 'İşaretle — basılı tutup sürükleyince satır taşınır'}
            className={readOnly ? undefined : 'nb-hand-box'}
            style={{
              ...styles.box,
              left: box.x,
              top: box.y,
              width: box.width,
              // Sürüklenen satırın kutusu kopyasıyla yürür; yerinde kalan kutu kopyanın altında görünmez
              transform: lineDrag?.line === lineIndexAt(value, box.offset) ? `translateY(${lineDrag.offset}px)` : undefined,
              opacity: lineDrag?.line === lineIndexAt(value, box.offset) ? 0 : undefined,
            }}
            onPointerDown={(e) => boxPointerDown(e, lineIndexAt(value, box.offset))}
            onPointerMove={boxPointerMove}
            onPointerUp={(e) => boxPointerUp(e, box.offset)}
            onPointerCancel={() => {
              if (dragLive.current?.pending) clearTimeout(dragLive.current.pending)
              dragLive.current = null
              setLineDrag(null)
            }}
          >
            <HandCheckbox checked={value[box.offset] !== BOX} tilt={boxTilt(box.offset)} />
          </span>
        ))}

        {dropTop !== null && <div style={{ ...styles.dropLine, top: dropTop - 1.5 }} />}

        {lineDrag && geometry.lines[lineDrag.line] && (
          <DraggedLine
            text={lineTexts[lineDrag.line] ?? ''}
            top={geometry.lines[lineDrag.line].top + lineDrag.offset}
            // Kopyanın kutusu yerindeki kutuyla aynı açıda
            tilt={boxTilt(lineTexts.slice(0, lineDrag.line).join('\n').length + (lineDrag.line > 0 ? 1 : 0))}
            boxWidth={geometry.boxes[0]?.width ?? 0}
          />
        )}
      </div>

      {/* Kutulu satırın saati kenar boşluğunda, satırın hizasında */}
      {geometry.boxes.map((box) => {
        const line = lineIndexAt(value, box.offset)
        const time = times.find((m) => m.start === box.offset)?.color
        if (!time || (firstInNote && line === 0)) return null
        return (
          <span
            key={`t${box.offset}`}
            style={{ ...styles.lineTime, top: box.y, transform: lineDrag?.line === line ? `translateY(${lineDrag.offset}px)` : undefined }}
          >
            <MarginTime time={time} />
          </span>
        )
      })}
    </div>
  )
}

// Sürüklenen satırın kâğıttan kaldırılmış kopyası: kutusu ve yazısı işaretçiyle birlikte yürür
function DraggedLine({ text, top, tilt, boxWidth }) {
  const boxed = text[0] === BOX || text[0] === BOX_DONE
  return (
    <div aria-hidden="true" style={{ ...styles.dragged, top }}>
      <div style={styles.text}>
        {boxed ? (
          <>
            <span style={styles.hiddenBox}>{text[0]}</span>
            {text.slice(1)}
          </>
        ) : (
          text
        )}
      </div>
      {boxed && (
        <span style={{ ...styles.box, left: 6, top: 0, width: boxWidth, cursor: 'grabbing' }}>
          <HandCheckbox checked={text[0] !== BOX} tilt={tilt} />
        </span>
      )}
    </div>
  )
}

// Kenar boşluğundaki saat (bloğun ve kutulu satırların saati); saat yoksa kısa bir çizgi
export function MarginTime({ time }) {
  return (
    <span style={{ ...styles.time, ...(time === null ? styles.dash : null) }} aria-label={time === null ? 'Blok' : `Saat ${time}`}>
      {(time ?? '—') + HAND_TAIL}
    </span>
  )
}

// Yazının offset'inci harfinin bulunduğu yazı düğümü ve düğümdeki yeri
function textPoint(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let left = offset
  let last = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (left < node.length) return { node, offset: left }
    left -= node.length
    last = node
  }
  return last ? { node: last, offset: last.length } : null
}

const styles = {
  wrap: {
    position: 'relative',
  },
  raised: {
    zIndex: 10,
  },
  dragged: {
    position: 'absolute',
    left: -6,
    right: 0,
    zIndex: 5,
    paddingLeft: 6,
    backgroundColor: notebook.paper,
    boxShadow: '0 3px 6px rgba(59, 47, 26, 0.22)',
    pointerEvents: 'none',
  },
  text: {
    ...fonts.hand,
    fontSize: 25,
    lineHeight: `${LH}px`,
    color: notebook.graphite,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0,
    padding: 0,
  },
  mirror: {
    position: 'relative',
    zIndex: 1,
    minHeight: LH,
    opacity: 0.92,
    pointerEvents: 'none',
  },
  reading: {
    pointerEvents: 'auto',
  },
  input: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    width: '100%',
    height: '100%',
    border: 0,
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    background: 'transparent',
    color: 'transparent',
    caretColor: notebook.graphite,
  },
  placeholder: {
    position: 'absolute',
    color: 'rgba(56, 56, 61, 0.3)',
  },
  hiddenBox: {
    color: 'transparent',
  },
  // Kutunun alt kenarı yazının tabanına, satır çizgisinin birkaç piksel üstüne oturur
  box: {
    position: 'absolute',
    zIndex: 3,
    height: LH,
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 8,
    boxSizing: 'border-box',
    cursor: 'pointer',
    touchAction: 'none',
  },
  dropLine: {
    position: 'absolute',
    left: -6,
    right: 16,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: notebook.graphite,
    pointerEvents: 'none',
    zIndex: 4,
  },
  // Kenar boşluğundaki saat, yazının solunda (yazının başına göre eksi kenar boşluğunda)
  lineTime: {
    position: 'absolute',
    left: -(notebook.marginX + 12),
    width: notebook.marginX - 8,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  time: {
    ...fonts.hand,
    fontSize: 15,
    lineHeight: `${LH}px`,
    color: 'rgba(56, 56, 61, 0.55)',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  // Çizgi saatin rakamlarıyla aynı yerde biter, biraz daha soluk
  dash: {
    fontSize: 22,
    color: 'rgba(56, 56, 61, 0.4)',
  },
}
