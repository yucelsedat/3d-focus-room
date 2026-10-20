// ── Ay ızgarası ──────────────────────────────────────────────────────────────
// /timeline'ın ana görünümü: sütunlar Pzt…Paz, satırlar ayın haftaları (gerçek
// takvim; komşu ayın günleri soluk). Her gün kendi canvas'ına açılır (hücreye tık).
// Hücrede: o günün notları (saat sırasıyla), çok günlü notlar haftaya yayılan
// şeritler, gün canvas'ındaki resimlerin önizlemesi ve öğe sayısı.
// Not çipi / şeridi başka güne sürüklenince tarihi taşınır (saat korunur).
import { useState, useEffect, useRef, useMemo, useEffectEvent } from 'react'
import {
  monthWeeks, monthLabel, shiftMonth, monthOfDay, weekLayout, itemAnchorDay, noteDays, isoFromDay, statusOf,
  hasTime, isValidStamp, formatRange, makeNote, dateToX, shiftRange, withRange, NOTE_DEFAULTS, WEEKDAYS_SHORT, NOTE_STATUSES,
} from '../../utils/timelineModel'
import { NoteEditor } from '../../components/canvas/NoteEditor'
import { FONT_UI, FONT_DISPLAY, FONT_MONO, C, toolBtn, divider } from './theme'
import { SaveBadge, ConflictBanner } from './ui'

const HEAD_H = 28          // gün adları satırı
const DAY_TOP = 30         // hücrede gün numarası alanı
const BAR_ROW = 21         // çok günlü şerit yüksekliği + boşluk
const CHIP_H = 22
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]   // Pzt … Paz

if (typeof document !== 'undefined' && !document.getElementById('tl-grid-styles')) {
  const s = document.createElement('style')
  s.id = 'tl-grid-styles'
  s.textContent = `
    .tl-cell:hover { background: rgba(255,255,255,0.025) !important; }
    .tl-cell .tl-add { opacity: 0; transition: opacity 120ms; }
    .tl-cell:hover .tl-add, .tl-add:focus-visible { opacity: 1; }
    .tl-chip:hover { filter: brightness(1.18); }
  `
  document.head.appendChild(s)
}

const isTyping = () => {
  const el = document.activeElement
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function MonthGrid({ id, doc, month, today, onMonth, onOpenDay, onOpenAxis }) {
  const { items, update, saveState, conflict, resolveConflict } = doc
  const [noteEditId, setNoteEditId] = useState(null)
  const [dragOver, setDragOver] = useState(null)      // sürüklenen notun bırakılacağı gün
  const [dragging, setDragging] = useState(null)      // sürüklenen not id
  const [gridH, setGridH] = useState(600)
  const gridRef = useRef(null)
  const justDragged = useRef(false)   // sürüklemeyi izleyen click hücreyi açmasın
  const uploadKey = `tl-${id}`

  const weeks = useMemo(() => monthWeeks(month), [month])
  const first = weeks[0][0], last = weeks[weeks.length - 1][6]
  const notes = useMemo(() => (items || []).filter(it => it.type === 'note'), [items])
  const layouts = useMemo(() => weeks.map(w => weekLayout(notes, w)), [weeks, notes])

  // Gün canvas'ı özeti: resim önizlemeleri + not dışı öğe sayısı
  const dayInfo = useMemo(() => {
    const m = new Map()
    const get = (d) => { if (!m.has(d)) m.set(d, { thumbs: [], count: 0 }); return m.get(d) }
    for (const it of items || []) {
      if (it.type === 'note') {
        if (!isValidStamp(it.start) || !it.images?.length) continue
        const { d1, d2 } = noteDays(it)
        for (let d = Math.max(d1, first); d <= Math.min(d2, last); d++) get(d).thumbs.push(it.images[0])
        continue
      }
      const d = itemAnchorDay(it)
      if (d === null || d < first || d > last) continue
      const info = get(d)
      info.count++
      if (it.type === 'image' && it.url) info.thumbs.push(it.url)
    }
    return m
  }, [items, first, last])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setGridH(e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const rowH = (gridH - HEAD_H) / weeks.length

  // ── not işlemleri ──
  const noteEditItem = noteEditId ? notes.find(n => n.id === noteEditId) : null
  const saveNote = (note) => {
    update(prev => prev.map(it => it.id === note.id ? withRange({ ...note, start: it.start }, note.start, note.end) : it))
    setNoteEditId(null)
  }
  const deleteNote = (nid) => { update(prev => prev.filter(it => it.id !== nid)); setNoteEditId(null) }
  // Güne bütün gün not: gün canvas'ında eksenin üstünde, o günün diğer notlarının üstüne yığılır
  const addNote = (day) => {
    const { h } = NOTE_DEFAULTS
    const sameDay = notes.filter(n => isValidStamp(n.start) && noteDays(n).d1 === day).length
    const start = isoFromDay(day)
    const n = makeNote({ id: crypto.randomUUID(), start, x: dateToX(start), y: -h - 160 - sameDay * (h + 60) })
    update(prev => [...prev, n])
    setNoteEditId(n.id)
  }

  // Not sürükle-bırak: imlecin altındaki gün hücresi hedeftir; kıpırdamadan bırakmak = tık
  const dayAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-day]')
    return el ? Number(el.dataset.day) : null
  }
  const onNoteMouseDown = (e, note) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const from = dayAt(e.clientX, e.clientY)
    const sx = e.clientX, sy = e.clientY
    let moved = false, target = from
    const mv = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) { moved = true; setDragging(note.id) }
      if (!moved) return
      target = dayAt(ev.clientX, ev.clientY)
      setDragOver(target)
    }
    const up = () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up)
      setDragging(null); setDragOver(null)
      if (!moved) { setNoteEditId(note.id); return }
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 0)
      if (target === null || from === null || target === from) return
      const r = shiftRange(note.start, note.end, 'move', target - from)
      update(prev => prev.map(it => it.id === note.id ? withRange(it, r.start, r.end) : it))
    }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  // ── klavye: ← / → ay, T bugün ──
  const onKey = useEffectEvent((e) => {
    if (noteEditId || isTyping() || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); onMonth(shiftMonth(month, -1)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onMonth(shiftMonth(month, 1)) }
    else if (e.key === 't' || e.key === 'T') onMonth(monthOfDay(today))
  })
  useEffect(() => {
    const h = (e) => onKey(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const counts = useMemo(() => {
    const c = Object.fromEntries(NOTE_STATUSES.map(s => [s.id, 0]))
    for (const n of notes) {
      if (!isValidStamp(n.start)) continue
      const { d1, d2 } = noteDays(n)
      if (d2 >= first && d1 <= last) c[n.status]++
    }
    return c
  }, [notes, first, last])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="tl-tools" style={{ height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: `1px solid ${C.line}`,
        background: C.panel, overflowX: 'auto', overflowY: 'hidden' }}>
        <button className="tl-btn" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Önceki ay" title="Önceki ay (←)" style={{ ...toolBtn, width: 32, padding: 0 }}>‹</button>
        <h2 style={{ margin: 0, font: `800 24px/1 ${FONT_DISPLAY}`, letterSpacing: '-0.01em', minWidth: 170, textAlign: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>{monthLabel(month)}</h2>
        <button className="tl-btn" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Sonraki ay" title="Sonraki ay (→)" style={{ ...toolBtn, width: 32, padding: 0 }}>›</button>
        <button className="tl-btn" onClick={() => onMonth(monthOfDay(today))} title="Bu ay (T)" style={toolBtn}>Bugün</button>
        <span style={divider} />
        {NOTE_STATUSES.map(s => (
          <span key={s.id} title={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, font: `300 12px ${FONT_UI}`, color: C.dim, flexShrink: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: s.color }} />
            <span className="tl-hide-md">{s.label}</span>
            <span style={{ font: `200 11px ${FONT_MONO}`, color: C.faint }}>{counts[s.id]}</span>
          </span>
        ))}
        <span style={{ flex: 1, minWidth: 8 }} />
        <span className="tl-hide-sm" style={{ font: `200 11px ${FONT_MONO}`, color: C.faint, whiteSpace: 'nowrap', flexShrink: 0 }}>güne tıkla: o günün canvas'ı · notu sürükle: tarihi taşı</span>
        <SaveBadge state={saveState} />
        <span style={divider} />
        <button className="tl-btn" onClick={onOpenAxis} title="Hafta / ay / yıl zaman ekseni" style={toolBtn}>Zaman ekseni</button>
      </div>
      <ConflictBanner conflict={conflict} onResolve={resolveConflict} />

      <div ref={gridRef} role="grid" aria-label={monthLabel(month)}
        style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: `${HEAD_H}px repeat(${weeks.length}, minmax(0, 1fr))`, padding: '0 14px 14px', userSelect: 'none' }}>
        {/* gün adları */}
        <div role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', alignItems: 'center' }}>
          {WEEK_ORDER.map(dow => (
            <div key={dow} role="columnheader" style={{ padding: '0 10px', font: `800 11px ${FONT_UI}`, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: dow === 0 || dow === 6 ? 'rgba(255,138,31,0.75)' : C.faint }}>{WEEKDAYS_SHORT[dow]}</div>
          ))}
        </div>

        {weeks.map((week, wi) => {
          const L = layouts[wi]
          const top = DAY_TOP + L.laneCount * BAR_ROW
          const maxChips = Math.max(0, Math.floor((rowH - top - 6) / CHIP_H))
          return (
            <div key={week[0]} role="row" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', minHeight: 0,
              borderTop: `1px solid ${C.line}`, borderLeft: `1px solid ${C.line}` }}>
              {week.map((day, ci) => {
                const inMonth = monthOfDay(day).mo === month.mo
                const isToday = day === today
                const singles = L.singles.get(day)
                const info = dayInfo.get(day)
                const overflow = singles.length > maxChips
                const shown = overflow ? singles.slice(0, Math.max(0, maxChips - 1)) : singles
                const weekend = ci >= 5
                return (
                  <div key={day} role="gridcell" data-day={day} className="tl-cell" aria-label={`${new Date(day * 86400000).getUTCDate()} — günün canvas'ını aç`}
                    onClick={() => { if (!justDragged.current) onOpenDay(day) }}
                    style={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden', cursor: 'pointer',
                      borderRight: `1px solid ${C.line}`, borderBottom: wi === weeks.length - 1 ? `1px solid ${C.line}` : 'none',
                      background: dragOver === day ? 'rgba(129,140,248,0.14)' : weekend ? 'rgba(255,255,255,0.012)' : 'transparent',
                      boxShadow: isToday ? `inset 0 0 0 1.5px ${C.today}` : dragOver === day ? 'inset 0 0 0 1.5px rgba(129,140,248,0.7)' : 'none' }}>
                    {/* gün numarası + canvas özeti */}
                    <div style={{ height: DAY_TOP, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 0 8px', opacity: inMonth ? 1 : 0.35 }}>
                      <span style={{ minWidth: 22, height: 22, padding: '0 5px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                        font: `${isToday ? 800 : 200} 13px ${FONT_MONO}`, background: isToday ? C.today : 'transparent', color: isToday ? '#160b02' : C.text }}>
                        {new Date(day * 86400000).getUTCDate()}
                      </span>
                      <span style={{ flex: 1 }} />
                      {info?.thumbs.slice(0, 3).map((u, i) => (
                        <img key={i} className="tl-hide-sm" src={u} alt="" referrerPolicy="no-referrer" draggable={false}
                          style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 5, flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,0.12)' }} />
                      ))}
                      {info?.count > 0 && (
                        <span title={`Gün canvas'ında ${info.count} öğe`} style={{ font: `200 10px ${FONT_MONO}`, color: C.faint, flexShrink: 0 }}>◻{info.count}</span>
                      )}
                      <button className="tl-add" aria-label="Bu güne not ekle" title="Bu güne not ekle"
                        onClick={(e) => { e.stopPropagation(); addNote(day) }}
                        style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'rgba(129,140,248,0.22)', color: '#c7d2fe', font: `800 14px/20px ${FONT_UI}`,
                          padding: 0, cursor: 'pointer', flexShrink: 0 }}>+</button>
                    </div>
                    {/* tek günlük notlar */}
                    <div style={{ position: 'absolute', left: 4, right: 4, top, display: 'flex', flexDirection: 'column', gap: 2, opacity: inMonth ? 1 : 0.45 }}>
                      {shown.map(n => <NoteChip key={n.id} note={n} dragging={dragging === n.id} onMouseDown={onNoteMouseDown} />)}
                      {overflow && (
                        <span style={{ font: `800 11px ${FONT_UI}`, color: C.dim, padding: '2px 6px' }}>+{singles.length - shown.length} daha</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {/* çok günlü şeritler */}
              {L.bars.map(b => {
                const st = statusOf(b.note.status)
                return (
                  <div key={b.note.id} className="tl-chip" role="button" tabIndex={0}
                    title={`${b.note.title || 'Başlıksız not'} · ${formatRange(b.note.start, b.note.end)}`}
                    onMouseDown={(e) => onNoteMouseDown(e, b.note)} onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Enter') setNoteEditId(b.note.id) }}
                    style={{ position: 'absolute', top: DAY_TOP + b.lane * BAR_ROW, height: BAR_ROW - 3, boxSizing: 'border-box',
                      left: `calc(${(b.c1 / 7) * 100}% + ${b.openL ? 0 : 4}px)`, width: `calc(${((b.c2 - b.c1 + 1) / 7) * 100}% - ${(b.openL ? 0 : 4) + (b.openR ? 0 : 4)}px)`,
                      background: `${st.color}38`, borderLeft: b.openL ? 'none' : `3px solid ${st.color}`,
                      borderRadius: `${b.openL ? 0 : 5}px ${b.openR ? 0 : 5}px ${b.openR ? 0 : 5}px ${b.openL ? 0 : 5}px`,
                      padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', cursor: 'grab',
                      opacity: dragging === b.note.id ? 0.4 : 1, font: `800 11px ${FONT_UI}`, color: '#f4f2fb', whiteSpace: 'nowrap' }}>
                    {b.openL && <span style={{ color: st.color }}>‹</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.note.title || 'Başlıksız not'}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {noteEditItem && (
        <NoteEditor key={noteEditItem.id} note={noteEditItem} uploadKey={uploadKey}
          onSave={saveNote} onDelete={() => deleteNote(noteEditItem.id)} onClose={() => setNoteEditId(null)} />
      )}
    </div>
  )
}

// Tek günlük not çipi: saatliyse saat, bütün günse renkli zemin
function NoteChip({ note, dragging, onMouseDown }) {
  const st = statusOf(note.status)
  const timed = hasTime(note.start)
  return (
    <div className="tl-chip" role="button" tabIndex={0} title={`${note.title || 'Başlıksız not'} · ${formatRange(note.start, note.end)}`}
      onMouseDown={(e) => onMouseDown(e, note)} onClick={(e) => e.stopPropagation()}
      style={{ height: CHIP_H - 2, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', borderRadius: 5, overflow: 'hidden',
        background: timed ? 'rgba(255,255,255,0.035)' : `${st.color}2e`, cursor: 'grab', opacity: dragging ? 0.4 : 1, boxSizing: 'border-box' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: st.color, flexShrink: 0 }} />
      {timed && <span style={{ font: `200 11px ${FONT_MONO}`, color: C.dim, flexShrink: 0 }}>{note.start.slice(11)}</span>}
      <span style={{ font: `800 12px ${FONT_UI}`, color: '#f4f2fb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {note.title || 'Başlıksız not'}
      </span>
    </div>
  )
}
