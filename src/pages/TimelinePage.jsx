// ── /timeline — ölçekli zaman ekseni üzerinde sonsuz canvas ──────────────────
// Çoklu, isimli timeline'lar (Timeline tablosu). Öğeler canvas tile ile aynı
// şemayı ve aynı kartları paylaşır (components/canvas); asıl öğe "not balonu":
// tarih aralığına bağlı, eksende şerit + sap ile gösterilen zengin kart.
//
// Zaman ölçeği (ppd: ekranda gün başına px; Gün/Hafta/Ay/Yıl, Ctrl+tekerlek) ile
// kart boyu (zoom; Alt+tekerlek) ayrıdır → gün görünümünde saatler okunurken kartlar
// devleşmez. Kayıt ↔ görüntü dönüşümü timelineModel'de (toDisplay / fromDisplay).
//
// Katmanlar (alttan üste): dönem gölgeleri + eksen + saplar (ekran uzayı SVG) →
// aralık çubukları (ekran uzayı) → öğeler (görüntü uzayı, tek transform) → seçim
// çerçevesi (ekran uzayı). Pan rAF'ta toplanır; öğeler memo'lu olduğundan kaydırma
// yalnızca transform'u ve ekran uzayı katmanlarını yeniden çizer.
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useEffectEvent, memo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DAY_PX, EPOCH_DAY, todayIso, dayIndex, rangeSpan, axisTicks, layoutLanes, isValidStamp, hasTime, stampFromValue, formatClock,
  NOTE_STATUSES, NOTE_DEFAULTS, statusOf, makeNote, formatRange, xToValue,
  PERIODS, periodRange, stepPeriod, periodLabel, periodOfScale, snapStep, SUBDAY_MIN_PPD,
  stretchOf, toDisplay, fromDisplay, withRange, shiftRange, dateToX, dayToX, itemInDay, dayLabel, monthLabel, monthOfDay,
  isValidIso, isoFromDay, parseMonthKey, monthKey,
} from '../utils/timelineModel'
import {
  getBounds, resizeItems, imageOrder, stopEvt, saveImageItem, urlsToViewerImages, uploadImageFile, layoutImageGrid,
  getCanvasClipboard, setCanvasClipboard, copyItemAssets, placeClipItems, buildPasteItems, pasteMsgView,
  makeNotebookItem, NOTEBOOK_CARD,
} from '../components/canvas/canvasUtils'
import { missingLinksMessage } from '../utils/richTextToMarkdown'
import { ItemBody } from '../components/canvas/ItemBody'
import { ArrowLayer } from '../components/canvas/ArrowLayer'
import { ImageViewer } from '../components/canvas/ImageViewer'
import { NoteEditor } from '../components/canvas/NoteEditor'
import { NotebookShelfMenu, NotebookCardDialog } from '../components/canvas/NotebookShelf'
import { NotebookHost } from '../components/notebook/NotebookHost'
import { takeNotebook } from '../components/notebook/shelfStore'
import { useStore } from '../store/useStore'
import { API, FONT_UI, FONT_DISPLAY, FONT_MONO, C, toolBtn, toolOn, divider } from './timeline/theme'
import { useTimelineDoc } from './timeline/useTimelineDoc'
import { SaveBadge, ConflictBanner } from './timeline/ui'
import { MonthGrid } from './timeline/MonthGrid'



const MIN_ZOOM = 0.1, MAX_ZOOM = 3, START_ZOOM = 0.6   // kart boyu
const MIN_PPD = 0.01, MAX_PPD = 96 * 300               // zaman ölçeği: on yıllar … 15 dk = 300 px
const AXIS_FRAC = 0.68                       // yeni görünümde eksenin ekran yüksekliğindeki yeri
const LANE_GAP = 11, BAR_H = 7, BAR_OFF = 12 // çubuk şeritleri (ekran px), eksenin üstünde
const PERIOD_MARGIN = 48                     // dönem görünümünde iki yanda boşluk (px)
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
const clampPpd = (p) => Math.min(MAX_PPD, Math.max(MIN_PPD, p))

// Yerel duvar saatine göre şu an (kesirli gün) — notların saatleriyle aynı uzay
const nowValue = (d = new Date()) => dayIndex(todayIso(d)) + (d.getHours() * 60 + d.getMinutes()) / 1440

const viewKey = (id) => `tl-view:${id}`
function loadView(id) {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(id)))
    if (v && [v.x, v.y, v.zoom].every(Number.isFinite) && v.zoom > 0) {
      // eski (tek zoom'lu) kayıt: zaman ölçeği o zoom'dan, kart boyu sınırlar içine
      const ppd = Number.isFinite(v.ppd) && v.ppd > 0 ? v.ppd : DAY_PX * v.zoom
      return { x: v.x, y: v.y, zoom: clampZoom(v.zoom), ppd: clampPpd(ppd) }
    }
  } catch {}
  return null
}
function storeView(id, v) { try { localStorage.setItem(viewKey(id), JSON.stringify(v)) } catch {} }

const isTyping = () => {
  const el = document.activeElement
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

// ═════════════════════════════════════════════════════════════════════════════
// Sayfa: üst gezinme + timeline seçici
// ═════════════════════════════════════════════════════════════════════════════
export default function TimelinePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const activeId = params.get('id')

  const selectTimeline = useCallback((id) => {
    try { localStorage.setItem('lastTimelineId', id) } catch {}
    setParams({ id }, { replace: true })
  }, [setParams])

  const refreshList = useCallback(async () => {
    const r = await fetch(`${API}/api/timelines`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.json()
    setList(data)
    return data
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        let data = await refreshList()
        if (!data.length) {
          const r = await fetch(`${API}/api/timelines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Yol haritası' }) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          data = [await r.json()]
          if (alive) setList(data)
        }
        if (!alive) return
        let last = null
        try { last = localStorage.getItem('lastTimelineId') } catch {}
        const cur = new URLSearchParams(window.location.search).get('id')
        const pick = [cur, last].find(x => x && data.some(t => t.id === x)) || data[0].id
        if (pick !== cur) selectTimeline(pick)
      } catch (err) {
        if (alive) setError(`Timeline'lar yüklenemedi (${err.message})`)
      }
    })()
    return () => { alive = false }
  }, [refreshList, selectTimeline])

  const active = list?.find(t => t.id === activeId) || null

  const createTimeline = async (name) => {
    const r = await fetch(`${API}/api/timelines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!r.ok) return
    const t = await r.json()
    setList(prev => [t, ...(prev || [])])
    selectTimeline(t.id)
  }
  const renameTimeline = async (id, name) => {
    const r = await fetch(`${API}/api/timelines/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!r.ok) return
    const d = await r.json()
    setList(prev => prev.map(t => t.id === id ? { ...t, name: d.name } : t))
  }
  const deleteTimeline = async (id) => {
    const r = await fetch(`${API}/api/timelines/${id}`, { method: 'DELETE' })
    if (!r.ok) return
    const rest = list.filter(t => t.id !== id)
    setList(rest)
    if (rest.length) selectTimeline(rest[0].id)
    else createTimeline('Yol haritası')
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.text, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <nav style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px 0 20px', background: '#0a0a0a', borderBottom: '1px solid #1e1e1e', minWidth: 0 }}>
        <button onClick={() => navigate('/')} title="Odalara dön"
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: C.text, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `800 16px ${FONT_UI}`, color: '#fff' }}>F</span>
          <span className="tl-hide-sm" style={{ font: `800 15px ${FONT_UI}`, letterSpacing: 0.3 }}>Focus Room</span>
        </button>
        <span style={{ color: '#333', fontSize: 20, fontWeight: 200, flexShrink: 0 }}>/</span>
        {list && active && (
          <TimelineSwitcher list={list} active={active} onSelect={selectTimeline} onCreate={createTimeline}
            onRename={(name) => renameTimeline(active.id, name)} onDelete={() => deleteTimeline(active.id)} onOpen={() => refreshList().catch(() => {})} />
        )}
        <span style={{ flex: 1 }} />
        <button onClick={() => navigate('/')} className="tl-hide-sm"
          style={{ background: 'none', border: '1px solid #262626', borderRadius: 999, color: C.dim, font: `800 12px ${FONT_UI}`, padding: '7px 14px', cursor: 'pointer', flexShrink: 0 }}>
          Odalar
        </button>
      </nav>
      {error && <div style={{ padding: 40, textAlign: 'center', color: '#f87171', font: `300 15px ${FONT_UI}` }}>{error}</div>}
      {!error && active && <TimelineShell key={active.id} id={active.id} />}
      {/* defter kartından "elime al": defter burada açılır, oda etiketi oyuna götürür */}
      <NotebookHost onOpenRoom={(room) => {
        localStorage.setItem('lastRoomId', room.id)
        localStorage.setItem('lastRoomName', room.name || '')
        navigate('/game')
      }} />
    </div>
  )
}

if (typeof document !== 'undefined' && !document.getElementById('tl-page-styles')) {
  const s = document.createElement('style')
  s.id = 'tl-page-styles'
  s.textContent = `
    @media (max-width: 640px) { .tl-hide-sm { display: none !important; } }
    @media (max-width: 1599px) { .tl-hide-md { display: none !important; } }
    .tl-tools::-webkit-scrollbar { height: 0; }
    .tl-btn:hover { background: rgba(255,255,255,0.08) !important; }
    .tl-bar:hover { filter: brightness(1.25); }
  `
  document.head.appendChild(s)
}

// Kitaplık menüsü araç çubuğunun altında (çubuk yatay kaydığı için sabit konumlu);
// dışarı tıklayınca / Esc ile kapanır
function ShelfPopover({ at, onClose, onPick, onCreate }) {
  useEffect(() => {
    const onDown = () => onClose()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return (
    <NotebookShelfMenu onPick={onPick} onCreate={onCreate}
      style={{ position: 'fixed', left: Math.max(8, Math.min(at.left, window.innerWidth - 368)), top: at.top, zIndex: 60 }} />
  )
}

function TimelineSwitcher({ list, active, onSelect, onCreate, onRename, onDelete, onOpen }) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
      {renaming ? (
        <input autoFocus defaultValue={active.name}
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== active.name) onRename(v); setRenaming(false) }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false) }}
          style={{ font: `800 20px ${FONT_DISPLAY}`, color: C.text, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.accent}`, borderRadius: 8, padding: '3px 8px', outline: 'none', minWidth: 0, width: 260, maxWidth: '50vw' }} />
      ) : (
        <button onClick={() => { setOpen(o => !o); if (!open) onOpen() }} onDoubleClick={() => { setOpen(false); setRenaming(true) }} title="Timeline seç (çift tık: yeniden adlandır)"
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: C.text, cursor: 'pointer', padding: '4px 6px', borderRadius: 8, minWidth: 0 }}>
          <span style={{ font: `800 20px ${FONT_DISPLAY}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.name}</span>
          <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>▼</span>
        </button>
      )}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, width: 320, maxWidth: 'calc(100vw - 32px)', background: '#121219', border: `1px solid ${C.line}`, borderRadius: 14,
          boxShadow: '0 20px 50px -12px rgba(0,0,0,0.75)', zIndex: 50, overflow: 'hidden' }}>
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
            {list.map(t => (
              <button key={t.id} onClick={() => { onSelect(t.id); setOpen(false) }}
                style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: t.id === active.id ? 'rgba(129,140,248,0.14)' : 'transparent', color: C.text }}>
                <span style={{ flex: 1, minWidth: 0, font: `800 14px ${FONT_UI}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                <span style={{ font: `200 11px ${FONT_MONO}`, color: C.faint, flexShrink: 0 }}>{t.noteCount} not</span>
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); const v = newName.trim(); if (!v) return; onCreate(v); setNewName(''); setOpen(false) }}
            style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${C.line}` }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Yeni timeline adı"
              style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, font: `300 13px ${FONT_UI}`, padding: '8px 10px', outline: 'none' }} />
            <button type="submit" style={{ ...toolBtn, background: C.accent, color: '#0b0b10', borderColor: C.accent }}>Oluştur</button>
          </form>
          <div style={{ display: 'flex', gap: 8, padding: '0 10px 10px' }}>
            <button onClick={() => { setOpen(false); setRenaming(true) }} style={{ ...toolBtn, flex: 1 }}>Yeniden adlandır</button>
            <button onClick={() => { setOpen(false); if (confirm(`"${active.name}" ve içindeki tüm notlar silinsin mi?`)) onDelete() }}
              style={{ ...toolBtn, flex: 1, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}>Sil</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Kabuk: ay ızgarası ↔ gün canvas'ı ↔ zaman ekseni (URL'de: ?view=day&day=… / ?m=…)
// Doküman burada bir kez yüklenir; görünümler aynı belleği paylaşır.
// ═════════════════════════════════════════════════════════════════════════════
function TimelineShell({ id }) {
  const doc = useTimelineDoc(id)
  const [params, setParams] = useSearchParams()
  const today = dayIndex(todayIso())
  const view = params.get('view')
  const dayParam = params.get('day')
  const day = isValidIso(dayParam) ? dayIndex(dayParam) : null
  const month = parseMonthKey(params.get('m')) || monthOfDay(day ?? today)

  // push: tarayıcının Geri düğmesi bir önceki görünüme döner
  const go = (patch, push = true) => setParams(prev => {
    const n = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) { if (v === null) n.delete(k); else n.set(k, v) }
    return n
  }, { replace: !push })
  const mKey = (d) => { const m = monthOfDay(d); return monthKey(m.y, m.mo) }
  const openDay = (d) => go({ view: 'day', day: isoFromDay(d), m: mKey(d) })
  const goDay = (d) => go({ view: 'day', day: isoFromDay(d), m: mKey(d) }, false)
  const openMonth = (m = month) => go({ view: null, day: null, m: monthKey(m.y, m.mo) })

  if (doc.loadErr) return <div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>Timeline yüklenemedi ({doc.loadErr})</div>
  if (view === 'day' && day !== null) {
    return <TimelineBoard key={`day-${day}`} id={id} doc={doc} dayLock={day} onGoDay={goDay} onBack={() => openMonth(monthOfDay(day))} />
  }
  if (view === 'axis') return <TimelineBoard key="axis" id={id} doc={doc} onOpenMonth={() => openMonth()} />
  return (
    <MonthGrid id={id} doc={doc} month={month} today={today}
      onMonth={(m) => go({ m: monthKey(m.y, m.mo) }, false)} onOpenDay={openDay} onOpenAxis={() => go({ view: 'axis', day: null })} />
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Pano (gün canvas'ı / zaman ekseni)
// ═════════════════════════════════════════════════════════════════════════════
// dayLock (gün indeksi) verilirse pano o günün canvas'ıdır: yalnız o güne ait öğeler
// görünür/seçilir, görünüm o güne kilitlenir (saatlere yakınlaşılabilir, gün dışına
// kaydırılamaz), taşınan / yapıştırılan öğeler gün sınırında tutulur.
function TimelineBoard({ id, doc, dayLock = null, onBack, onGoDay, onOpenMonth }) {
  const navigate = useNavigate()
  const uploadKey = `tl-${id}`

  const { items, itemsRef, loadErr, saveState, conflict, update, scheduleSave, bg } = doc
  const resolveConflict = (useTheirs) => { doc.resolveConflict(useTheirs); if (useTheirs) setSelectedIds(new Set()) }

  const locked = dayLock !== null
  const inScope = useCallback((it) => !locked || itemInDay(it, dayLock), [locked, dayLock])
  // Gün canvas'ında öğe güne ait kalsın: dışarı taşan öğe gün sınırına çekilir
  // (saatli not saatini koruyarak o güne, serbest öğe sol kenarıyla gün içine)
  const keepInDay = (it) => {
    if (!locked || itemInDay(it, dayLock)) return it
    if (it.type === 'note') {
      if (!isValidStamp(it.start)) return it
      const r = shiftRange(it.start, it.end, 'move', dayLock - Math.floor(rangeSpan(it.start, it.end).t1))
      return withRange(it, r.start, r.end)
    }
    const lo = dayToX(dayLock), hi = dayToX(dayLock + 1) - 0.01
    if (it.type === 'arrow') { const dx = Math.min(hi, Math.max(lo, it.x1)) - it.x1; return { ...it, x1: it.x1 + dx, x2: it.x2 + dx } }
    return { ...it, x: Math.min(hi, Math.max(lo, it.x)) }
  }
  // Gün içindeki notun kayması (gün) gün sınırlarında kalsın
  const clampShift = (note, mode, d) => {
    if (!locked) return d
    const r = rangeSpan(note.start, note.end)
    if (r.t1 < dayLock || r.t2 > dayLock + 1) return d   // çok günlü not: serbest
    const t2 = Math.max(r.t2, r.t1 + 1 / 96)
    if (mode === 'move') return Math.min(dayLock + 1 - t2, Math.max(dayLock - r.t1, d))
    if (mode === 'start') return Math.max(dayLock - r.t1, d)
    return Math.min(dayLock + 1 - t2, d)
  }

  // ── görünüm ──
  const containerRef = useRef(null)
  const [size, setSize] = useState(null)
  const [viewState, setViewState] = useState(() => (dayLock !== null ? null : loadView(id)))
  const sizeRef = useRef(null)
  const viewRef = useRef(null)
  const rafRef = useRef(0)
  const [now, setNow] = useState(() => nowValue())

  // ── etkileşim ──
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [hoveredId, setHoveredId] = useState(null)
  const [hoveredArrowId, setHoveredArrowId] = useState(null)
  const [editingTextId, setEditingTextId] = useState(null)
  const [noteEditId, setNoteEditId] = useState(null)
  const [notebookEditId, setNotebookEditId] = useState(null) // ayarları açık defter kartı
  const [shelfAt, setShelfAt] = useState(null)       // kitaplık menüsü: düğmenin ekran konumu
  const notebookOpen = useStore(st => st.notebookOpen)
  const [viewer, setViewer] = useState(null)         // { images:[{id,url}], index }
  const [drawMode, setDrawMode] = useState(null)     // null | 'line' | 'arrow'
  const [drawingLine, setDrawingLine] = useState(null)
  const [selRect, setSelRect] = useState(null)       // ekran uzayı {x1,y1,x2,y2}
  const [pasteMsg, setPasteMsg] = useState('')
  const [statusShown, setStatusShown] = useState(() => new Set(NOTE_STATUSES.map(s => s.id)))
  const [query, setQuery] = useState('')
  const lastMouse = useRef(null)                     // son fare konumu (görüntü uzayı) — yapıştırma noktası
  const fileRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setNow(nowValue()), 30000)
    return () => clearInterval(t)
  }, [])

  // ── boyut + görünüm ──
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => { const sz = { w: e.contentRect.width, h: e.contentRect.height }; sizeRef.current = sz; setSize(sz) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [items === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // gün canvas'ı: 24 saat ekrana iki yandan PERIOD_MARGIN boşlukla sığar
  const dayFit = (sz) => { const ppd = clampPpd(sz.w - PERIOD_MARGIN * 2); return { ppd, x: PERIOD_MARGIN - (dayLock - EPOCH_DAY) * ppd } }
  const defaultView = (sz) => {
    if (locked) return { zoom: START_ZOOM, y: Math.round(sz.h * AXIS_FRAC), ...dayFit(sz) }
    const ppd = DAY_PX * START_ZOOM
    return { zoom: START_ZOOM, ppd, x: sz.w * 0.42 - (Math.floor(now) - EPOCH_DAY) * ppd, y: Math.round(sz.h * AXIS_FRAC) }
  }
  const view = viewState || (size ? defaultView(size) : null)
  useLayoutEffect(() => { viewRef.current = view })

  const setView = useCallback((next) => {
    const sz = sizeRef.current
    let v = next
    if (dayLock !== null && sz) {
      // gün kilidi: en az tüm gün sığar, gün kenarları ekranın kenar boşluklarını geçmez
      const ppd = Math.max(v.ppd, Math.min(MAX_PPD, sz.w - PERIOD_MARGIN * 2))
      const xMax = PERIOD_MARGIN - (dayLock - EPOCH_DAY) * ppd
      const xMin = sz.w - PERIOD_MARGIN - (dayLock + 1 - EPOCH_DAY) * ppd
      v = { ...v, ppd, x: Math.min(xMax, Math.max(xMin, v.x)) }
    }
    viewRef.current = v
    if (!rafRef.current) rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; setViewState(viewRef.current) })
  }, [setViewState, dayLock])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])
  useEffect(() => {
    if (!viewState || locked) return
    const t = setTimeout(() => storeView(id, viewState), 400)
    return () => clearTimeout(t)
  }, [id, viewState, locked])

  // Koordinatlar: ekran (kapsayıcıya göre px) ↔ zaman (kesirli gün) ↔ görüntü (öğe uzayı)
  const rectOf = () => containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 }
  const sToT = (sx, v = viewRef.current) => (sx - v.x) / v.ppd + EPOCH_DAY
  const clientToScreen = (cx, cy) => { const r = rectOf(); return { x: cx - r.left, y: cy - r.top } }
  const screenToDisp = (sx, sy, v = viewRef.current) => ({ x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom })
  const clientToDisp = (cx, cy) => { const p = clientToScreen(cx, cy); return screenToDisp(p.x, p.y) }
  const kNow = () => stretchOf(viewRef.current)
  const viewCenterDisp = () => { const s = size || { w: 800, h: 600 }; return screenToDisp(s.w / 2, s.h / 2) }

  // Zaman ölçeği: imlecin altındaki an sabit kalır; kart boyu ve dikey konum değişmez
  const timeZoomAt = (factor, sx) => {
    const v = viewRef.current; if (!v) return
    const ppd = clampPpd(v.ppd * factor)
    setView({ ...v, ppd, x: sx - (sx - v.x) * (ppd / v.ppd) })
  }
  // Kart boyu: zaman ekseni yerinde kalır, dikeyde imleç noktası sabit
  const cardZoomAt = (factor, sy) => {
    const v = viewRef.current; if (!v) return
    const zoom = clampZoom(v.zoom * factor)
    setView({ ...v, zoom, y: sy - (sy - v.y) * (zoom / v.zoom) })
  }
  // Dönem görünümü: t'yi içeren gün / hafta / ay / yıl ekranı iki yandan PERIOD_MARGIN boşlukla doldurur
  const setPeriod = (unit, t) => {
    const v = viewRef.current, s = size; if (!v || !s) return
    const r = periodRange(unit, t)
    const ppd = clampPpd((s.w - PERIOD_MARGIN * 2) / (r.end - r.start))
    setView({ ...v, ppd, x: PERIOD_MARGIN - (r.start - EPOCH_DAY) * ppd })
  }
  const centerT = () => sToT((size?.w ?? 800) / 2)
  // Dönem düğmesi hangi günü açar: bugün ekrandaysa bugünü, değilse ekranın ortasını
  const periodTarget = () => {
    const w = size?.w ?? 800
    return now >= sToT(0) && now <= sToT(w) ? now : centerT()
  }
  const activePeriod = view && size ? periodOfScale(view.ppd, size.w - PERIOD_MARGIN * 2) : null
  const stepView = (dir) => {
    const unit = activePeriod || 'month'
    const r = stepPeriod(unit, centerT(), dir)
    setPeriod(unit, r.start)
  }
  // Bugün: ölçek korunur, şu an ortaya gelir (gün görünümünde saatler, ay görünümünde günler)
  const goToday = () => {
    const v = viewRef.current, s = size; if (!v || !s) return
    if (activePeriod) { setPeriod(activePeriod, now); setView({ ...viewRef.current, y: Math.round(s.h * AXIS_FRAC) }); return }
    setView({ ...v, x: s.w / 2 - (now - EPOCH_DAY) * v.ppd, y: Math.round(s.h * AXIS_FRAC) })
  }
  const fitAll = () => {
    const v = viewRef.current, s = size; if (!v || !s) return
    if (locked) { setView({ ...v, ...dayFit(s), y: Math.round(s.h * AXIS_FRAC) }); return }
    const all = itemsRef.current
    if (!all.length) { goToday(); return }
    // zaman aralığı: notların kapsamı + diğer öğelerin sol kenarı
    let t1 = Infinity, t2 = -Infinity
    for (const it of all) {
      if (it.type === 'note' && isValidStamp(it.start)) { const r = rangeSpan(it.start, it.end); t1 = Math.min(t1, r.t1); t2 = Math.max(t2, r.t2) }
      else if (it.type === 'arrow') { t1 = Math.min(t1, xToValue(it.x1), xToValue(it.x2)); t2 = Math.max(t2, xToValue(it.x1), xToValue(it.x2)) }
      else { t1 = Math.min(t1, xToValue(it.x)); t2 = Math.max(t2, xToValue(it.x)) }
    }
    const card = NOTE_DEFAULTS.w * v.zoom
    const span = Math.max(t2 - t1, 1 / 24)
    const ppd = clampPpd((s.w - 140 - card) / span)
    const x = 70 + card / 2 - (t1 - EPOCH_DAY) * ppd
    // dikey: öğeler + eksen
    let y1 = -40, y2 = 60
    for (const it of all) {
      if (it.type === 'arrow') { y1 = Math.min(y1, it.y1, it.y2); y2 = Math.max(y2, it.y1, it.y2) }
      else { y1 = Math.min(y1, it.y); y2 = Math.max(y2, it.y + (it.h || 0)) }
    }
    const hpx = (y2 - y1) * v.zoom
    const y = hpx < s.h - 80 ? (s.h - hpx) / 2 - y1 * v.zoom : 40 - y1 * v.zoom
    setView({ ...v, ppd, x, y })
  }

  // ── wheel: kaydır (Shift: yatay) · Ctrl/⌘: zaman ölçeği · Alt: kart boyu ──
  const onWheel = useEffectEvent((e) => {
    if (noteEditId || viewer) return
    if (!(e.ctrlKey || e.metaKey || e.altKey)) {
      // içi kayan not gövdesi / metin kutusu: sona gelene dek kendisi kaysın
      const sc = e.target instanceof Element ? e.target.closest('[data-cv-scroll="1"]') : null
      if (sc && sc.scrollHeight > sc.clientHeight + 1) {
        const atEdge = e.deltaY < 0 ? sc.scrollTop <= 0 : sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1
        if (!atEdge) return
      }
    }
    e.preventDefault()
    const v = viewRef.current; if (!v) return
    const p = clientToScreen(e.clientX, e.clientY)
    const unit = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 400 : 1
    const f = Math.min(2, Math.max(0.5, Math.exp(-(e.deltaY || e.deltaX) * unit * 0.0022)))
    if (e.ctrlKey || e.metaKey) timeZoomAt(f, p.x)
    else if (e.altKey) cardZoomAt(f, p.y)
    else {
      let dx = e.deltaX * unit, dy = e.deltaY * unit
      if (e.shiftKey && !dx) { dx = dy; dy = 0 }
      setView({ ...v, x: v.x - dx, y: v.y - dy })
    }
  })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const h = (e) => onWheel(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [items === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── sürükleme yardımcısı (window dinleyicileri: imleç pencereden çıksa da) ──
  const drag = (e, onMove, onEnd) => {
    const sx = e.clientX, sy = e.clientY
    let moved = false
    const mv = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true
      if (moved) onMove(ev.clientX - sx, ev.clientY - sy, ev)
    }
    const up = (ev) => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up)
      onEnd?.(moved, ev)
    }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  // ── öğe oluşturma ── (görüntü uzayında konumlanır, kayda fromDisplay ile çevrilir)
  const freeSlotY = (left, w, h) => {
    const k = kNow(), z = viewRef.current.zoom
    const boxes = itemsRef.current.filter(it => it.type !== 'arrow' && inScope(it)).map(it => toDisplay(it, k, z))
    let y = -h - 160
    const hits = (yy) => boxes.some(b => b.x < left + w && b.x + b.w > left && b.y < yy + h && b.y + b.h > yy)
    for (let i = 0; i < 30 && hits(y); i++) y -= h + 60
    return y
  }
  // sx: ekran x'i (zaman), sy: ekran y'si (null → eksenin üstünde boş yer)
  const addNoteAt = (sx, sy = null) => {
    const v = viewRef.current, k = stretchOf(v)
    // saatler okunur ölçekteyse saatli not (ızgaraya oturur, 1 saat), değilse bütün gün
    const step = snapStep(v.ppd)
    const t = sToT(sx)
    const timed = step < 1
    const t0 = timed ? Math.floor(t / step) * step : t
    const start = stampFromValue(t0, timed)
    const end = timed ? stampFromValue(t0 + 1 / 24, true) : null
    const h = timed ? 320 : NOTE_DEFAULTS.h
    // kart kendi aralığına oturur: yatay yeri zamandan, genişliği aralıktan gelir
    const n0 = makeNote({ id: crypto.randomUUID(), start, end, x: dateToX(start), y: 0, h })
    const d = toDisplay(n0, k, v.zoom)
    const p = screenToDisp(sx, sy ?? 0)
    // boş alana çift tık: tıklanan yere (eksenin üstündeyse altı imlece, altındaysa üstü);
    // kart ekranın tepesinden taşacaksa eksenin üstünde kalarak aşağı kayar
    let y = sy === null ? freeSlotY(d.x, d.w, h) : p.y < -40 ? p.y - h : p.y > 40 ? p.y : -h - 160
    const visTop = (16 - v.y) / v.zoom
    if (sy !== null && y < visTop) y = Math.min(visTop, -h - 40)
    const n = { ...n0, y }
    update(prev => [...prev, n])
    setSelectedIds(new Set([n.id]))
    setNoteEditId(n.id)
  }
  const addText = () => {
    const c = viewCenterDisp()
    const ni = keepInDay(fromDisplay({ id: crypto.randomUUID(), type: 'text', x: c.x - 250, y: c.y - 40, w: 500, h: 0, content: '', fontSize: 30 }, kNow()))
    update(prev => [...prev, ni])
    setSelectedIds(new Set([ni.id])); setEditingTextId(ni.id); setDrawMode(null)
  }
  const addNotebook = (meta, { edit = false } = {}) => {
    const c = viewCenterDisp()
    const ni = keepInDay(fromDisplay(makeNotebookItem(meta, { x: c.x - NOTEBOOK_CARD.w / 2, y: c.y - NOTEBOOK_CARD.h / 2 }), kNow()))
    update(prev => [...prev, ni])
    setSelectedIds(new Set([ni.id])); setShelfAt(null); setDrawMode(null)
    if (edit) setNotebookEditId(ni.id)
  }
  // Aynı deftere bakan kartların ad/kapak kopyası da tazelensin
  const syncNotebookCards = (src, meta) => {
    if (!itemsRef.current.some(it => it.type === 'notebook' && it.src === src)) return
    update(prev => prev.map(it => it.type === 'notebook' && it.src === src ? { ...it, src: meta.key, name: meta.name, cover: meta.cover } : it))
  }
  const removeNotebookCards = (src) => {
    update(prev => prev.filter(it => !(it.type === 'notebook' && it.src === src)))
    setSelectedIds(new Set()); setNotebookEditId(null)
  }
  const addImageFiles = async (files) => {
    const imgs = files.filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setPasteMsg('loading')
    const sized = (await Promise.all(imgs.map(f => uploadImageFile(f, uploadKey).catch(() => null)))).filter(Boolean)
    if (!sized.length) { flashMsg('err'); return }
    const pos = layoutImageGrid(sized, viewCenterDisp())
    const k = kNow()
    const added = sized.map((s, i) => keepInDay(fromDisplay({ id: crypto.randomUUID(), type: 'image', x: pos[i].x, y: pos[i].y, w: s.w, h: s.h, url: s.url }, k)))
    update(prev => [...prev, ...added])
    setSelectedIds(new Set(added.map(a => a.id)))
    flashMsg('ok')
  }
  const flashMsg = (m, ms = 1600) => { setPasteMsg(m); setTimeout(() => setPasteMsg(''), ms) }

  // yapıştırma / bırakma sonucu görüntü uzayında gelir
  const applyPasteResult = (res) => {
    if (!res) return
    const k = kNow()
    const added = res.items.map(it => keepInDay(fromDisplay(it, k)))
    if (added.length) update(prev => [...prev, ...added])
    if (res.select) setSelectedIds(new Set(added.map(n => n.id)))
    if (res.editId) setEditingTextId(res.editId)
    flashMsg(res.msg, res.ms)
  }
  const pastePoint = () => lastMouse.current || viewCenterDisp()

  // ── seçim işlemleri ──
  const selectedItems = () => itemsRef.current.filter(it => selectedIds.has(it.id))
  const deleteSelected = () => {
    if (!selectedIds.size) return
    const del = new Set(selectedIds)
    update(prev => prev.filter(it => !del.has(it.id)))
    setSelectedIds(new Set())
  }
  // Pano görüntü düzenini taşır: canvas tile'a yapıştırınca ekrandaki yerleşim korunur
  const copySelected = () => {
    const sel = selectedItems(); if (!sel.length) return false
    const k = kNow()
    setCanvasClipboard(uploadKey, sel.map(it => {
      const { natW, natX: _natX, ...d } = toDisplay(it, k, viewRef.current.zoom)
      return { ...d, w: natW ?? d.w }
    }))
    flashMsg('copy', 1000)
    return true
  }
  const pasteInternal = async () => {
    const clip = getCanvasClipboard(); if (!clip?.items?.length) return
    let clipItems = clip.items
    if (clip.sourceId !== uploadKey) { setPasteMsg('loading'); try { clipItems = await copyItemAssets(clipItems) } catch {} }
    const k = kNow()
    const placed = placeClipItems(clipItems, pastePoint()).map(it => keepInDay(fromDisplay(it, k)))
    update(prev => [...prev, ...placed])
    setSelectedIds(new Set(placed.map(p => p.id)))
    flashMsg('ok', 1200)
  }
  const duplicateSelected = () => {
    const sel = selectedItems(); if (!sel.length) return
    const k = kNow(), off = 30
    const copies = sel.map(it => {
      if (it.type === 'note' && isValidStamp(it.start)) return { ...it, id: crypto.randomUUID(), y: it.y + it.h + 20 }
      const d = toDisplay(it, k)
      return fromDisplay({ ...d, id: crypto.randomUUID(), x: (d.x ?? d.x1) + off, y: (d.y ?? d.y1) + off,
        ...(d.type === 'arrow' ? { x1: d.x1 + off, y1: d.y1 + off, x2: d.x2 + off, y2: d.y2 + off } : {}) }, k)
    })
    update(prev => [...prev, ...copies.map(keepInDay)])
    setSelectedIds(new Set(copies.map(c => c.id)))
  }

  // ── not / bağlantı / görüntüleyici ──
  // Editörde tarih değiştiyse kart da tarihiyle birlikte kayar
  const saveNote = (note) => {
    update(prev => prev.map(it => it.id === note.id ? withRange({ ...note, start: it.start }, note.start, note.end) : it))
    setNoteEditId(null)
  }
  const deleteNote = (noteId) => { update(prev => prev.filter(it => it.id !== noteId)); setSelectedIds(new Set()); setNoteEditId(null) }
  const openLink = (link) => {
    if (link.kind === 'room') {
      localStorage.setItem('lastRoomId', link.roomId)
      localStorage.setItem('lastRoomName', link.roomName || '')
      navigate('/game')
    } else window.open(link.url, '_blank', 'noopener')
  }
  const openImageItem = (itemId) => {
    const imgs = itemsRef.current.filter(it => it.type === 'image' && it.url).sort(imageOrder)
    const index = imgs.findIndex(it => it.id === itemId)
    if (index >= 0) setViewer({ images: imgs.map(it => ({ id: it.id, url: it.url })), index })
  }

  // ── fare: arka plan ──
  const onBgMouseDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return
    if (noteEditId) return
    e.preventDefault()
    if (document.activeElement instanceof HTMLElement && isTyping()) document.activeElement.blur()
    const v = viewRef.current
    if (drawMode && e.button === 0) {
      const p = clientToDisp(e.clientX, e.clientY)
      let line = { x1: p.x, y1: p.y, x2: p.x, y2: p.y }
      setDrawingLine(line)
      drag(e, (dx, dy) => { line = { ...line, x2: p.x + dx / v.zoom, y2: p.y + dy / v.zoom }; setDrawingLine(line) }, () => {
        setDrawingLine(null)
        if (Math.hypot(line.x2 - line.x1, line.y2 - line.y1) > 15) {
          const arrow = fromDisplay({ id: crypto.randomUUID(), type: 'arrow', ...line, color: '#e2e8f0', strokeWidth: 4, hasArrow: drawMode === 'arrow' }, stretchOf(v))
          update(prev => [...prev, keepInDay(arrow)])
        }
      })
      return
    }
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      const s0 = clientToScreen(e.clientX, e.clientY)
      setSelRect({ x1: s0.x, y1: s0.y, x2: s0.x, y2: s0.y })
      // bırakınca dikdörtgenle kesişen öğeleri seç (görüntü uzayında)
      drag(e, (dx, dy) => setSelRect({ x1: s0.x, y1: s0.y, x2: s0.x + dx, y2: s0.y + dy }), (moved, ev) => {
        setSelRect(null)
        if (!moved) return
        const p1 = clientToDisp(e.clientX, e.clientY), p2 = clientToDisp(ev.clientX, ev.clientY)
        const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x), y1 = Math.min(p1.y, p2.y), y2 = Math.max(p1.y, p2.y)
        const k = kNow()
        const hit = itemsRef.current.filter(it => it.type !== 'arrow' && inScope(it)).map(it => toDisplay(it, k, viewRef.current.zoom))
          .filter(d => d.x < x2 && d.x + d.w > x1 && d.y < y2 && d.y + d.h > y1)
        setSelectedIds(new Set(hit.map(it => it.id)))
      })
      return
    }
    // pan (+ boş tıklamada seçimi temizle)
    setEditingTextId(null)
    if (selectedIds.size) setSelectedIds(new Set())
    const el = containerRef.current
    el.style.cursor = 'grabbing'
    drag(e, (dx, dy) => setView({ ...v, x: v.x + dx, y: v.y + dy }), () => { el.style.cursor = '' })
  }

  const onBgDoubleClick = (e) => {
    if (drawMode || noteEditId) return
    const p = clientToScreen(e.clientX, e.clientY)
    addNoteAt(p.x, p.y)
  }

  // ── fare: öğe ── (sürükleme görüntü uzayında; kayda fromDisplay: not ofseti / öğenin zamanı)
  const onItemMouseDown = (e, item) => {
    if (e.button !== 0) return
    stopEvt(e)
    if (drawMode) { onBgMouseDown(e); return }
    if (editingTextId === item.id) return
    let ids
    if (e.ctrlKey || e.metaKey) {
      ids = new Set(selectedIds)
      if (ids.has(item.id)) { ids.delete(item.id); setSelectedIds(ids); return }
      ids.add(item.id)
      setSelectedIds(ids)
      return
    }
    ids = selectedIds.has(item.id) ? selectedIds : new Set([item.id])
    setSelectedIds(ids)
    const { zoom: z, ppd } = viewRef.current, k = kNow()
    const bases = new Map(itemsRef.current.filter(it => ids.has(it.id)).map(it => [it.id, it]))
    const origins = new Map([...bases.values()].map(it => [it.id, toDisplay(it, k, z)]))
    drag(e, (dx, dy) => {
      const wx = dx / z, wy = dy / z
      update(prev => prev.map(it => {
        const o = origins.get(it.id); if (!o) return it
        const b = bases.get(it.id)
        // tarihli not = takvim etkinliği: yatay sürükleme saati kaydırır (15 dk / 1 saat / 1 gün ızgarası)
        if (b.type === 'note' && isValidStamp(b.start)) {
          const step = hasTime(b.start) ? snapStep(ppd) : 1
          const r = shiftRange(b.start, b.end, 'move', clampShift(b, 'move', Math.round(dx / ppd / step) * step))
          return withRange({ ...b, y: b.y + wy }, r.start, r.end)
        }
        return keepInDay(fromDisplay(o.type === 'arrow'
          ? { ...o, x1: o.x1 + wx, y1: o.y1 + wy, x2: o.x2 + wx, y2: o.y2 + wy }
          : { ...o, x: o.x + wx, y: o.y + wy }, k))
      }), false)
    }, (moved) => { if (moved) scheduleSave() })
  }

  const onItemDoubleClick = (e, item) => {
    stopEvt(e)
    if (drawMode) return
    if (item.type === 'note') setNoteEditId(item.id)
    else if (item.type === 'notebook') setNotebookEditId(item.id)
    else if (item.type === 'text') { setEditingTextId(item.id); setSelectedIds(new Set([item.id])) }
    else if (item.type === 'image' && item.url) openImageItem(item.id)
  }

  const onArrowHandleMouseDown = (e, item, end) => {
    stopEvt(e)
    const { zoom: z } = viewRef.current, k = kNow()
    const o = toDisplay(itemsRef.current.find(it => it.id === item.id), k)
    drag(e, (dx, dy) => update(prev => prev.map(it => it.id !== item.id ? it
      : keepInDay(fromDisplay(end === 'start' ? { ...o, x1: o.x1 + dx / z, y1: o.y1 + dy / z } : { ...o, x2: o.x2 + dx / z, y2: o.y2 + dy / z }, k))), false),
    (moved) => { if (moved) scheduleSave() })
  }

  const onHandleMouseDown = (e, handle) => {
    stopEvt(e)
    const { zoom: z } = viewRef.current, k = kNow()
    if (handle === 'w' || handle === 'e') {
      const sel = itemsRef.current.filter(it => selectedIds.has(it.id))
      if (sel.length === 1 && sel[0].type === 'note' && isValidStamp(sel[0].start)) { onBarMouseDown(e, sel[0], handle === 'w' ? 'start' : 'end'); return }
    }
    const disp0 = itemsRef.current.map(it => toDisplay(it, k, z))
    const bounds = getBounds(selectedIds, disp0); if (!bounds) return
    const state = {
      handle, initBounds: bounds,
      initItems: disp0.filter(it => selectedIds.has(it.id) && it.type !== 'arrow').map(it => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h, fontSize: it.fontSize || 30 })),
    }
    drag(e, (dx, dy) => update(prev => {
      const d = prev.map(it => toDisplay(it, k, z))
      return resizeItems(d, state, dx / z, dy / z).map((r, i) => (r === d[i] ? prev[i] : fromDisplay(r, k)))
    }, false), (moved) => { if (moved) scheduleSave() })
  }

  // ── çubuk: tarih / saat sürükleme ── saatsiz notlar güne, saatliler ölçeğe göre 15 dk / 1 saat / 1 güne oturur
  const onBarMouseDown = (e, note, mode) => {
    if (e.button !== 0) return
    stopEvt(e)
    setSelectedIds(new Set([note.id]))
    const { ppd } = viewRef.current
    const step = hasTime(note.start) ? snapStep(ppd) : 1
    drag(e, (dx) => {
      const d = clampShift(note, mode, Math.round(dx / ppd / step) * step)
      const r = shiftRange(note.start, note.end, mode, d)
      update(prev => prev.map(it => it.id === note.id ? withRange(note, r.start, r.end) : it), false)
    }, (moved) => { if (moved) scheduleSave() })
  }

  // ── klavye ──
  const onKey = useEffectEvent((e) => {
    if (noteEditId || notebookEditId || notebookOpen || viewer || isTyping()) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (k === 'Escape') {
      if (drawMode) setDrawMode(null)
      else if (editingTextId) setEditingTextId(null)
      else if (selectedIds.size) setSelectedIds(new Set())
      else if (locked) onBack?.()   // gün canvas'ından ay ızgarasına
      return
    }
    if ((k === 'Delete' || k === 'Backspace') && selectedIds.size) { e.preventDefault(); deleteSelected(); return }
    if (ctrl && k === 'a') { e.preventDefault(); setSelectedIds(new Set(itemsRef.current.filter(inScope).map(it => it.id))); return }
    if (ctrl && k === 'c') { if (copySelected()) e.preventDefault(); return }
    if (ctrl && k === 'x') { if (copySelected()) { e.preventDefault(); deleteSelected(); flashMsg('cut', 1000) } return }
    if (ctrl && k === 'v' && getCanvasClipboard()?.items?.length) { e.preventDefault(); pasteInternal(); return }
    if (ctrl && k === 'd') { e.preventDefault(); duplicateSelected(); return }
    if (ctrl || e.altKey || !size) return
    if (locked) {
      if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); onGoDay(dayLock + (k === 'ArrowLeft' ? -1 : 1)); return }
      if (k === 't') { onGoDay(Math.floor(now)); return }
    } else {
      const pi = ['1', '2', '3', '4'].indexOf(k)
      if (pi >= 0) { setPeriod(PERIODS[pi].id, periodTarget()); return }
      if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); stepView(k === 'ArrowLeft' ? -1 : 1); return }
    }
    if (k === 'n') { e.preventDefault(); addNoteAt(size.w / 2); return }
    if (k === 't') { goToday(); return }
    if (k === 'f') { fitAll(); return }
    if (k === '+' || k === '=') { timeZoomAt(1.25, size.w / 2); return }
    if (k === '-') { timeZoomAt(0.8, size.w / 2); return }
    if (selectedIds.size === 1 && k === 'Enter') {
      const it = itemsRef.current.find(i => selectedIds.has(i.id))
      if (it?.type === 'note') { e.preventDefault(); setNoteEditId(it.id) }
      if (it?.type === 'notebook') { e.preventDefault(); setNotebookEditId(it.id) }
    }
  })
  const onPaste = useEffectEvent(async (e) => {
    if (noteEditId || notebookEditId || notebookOpen || isTyping() || !itemsRef.current) return
    e.preventDefault()
    const at = pastePoint()
    applyPasteResult(await buildPasteItems(e.clipboardData, { uploadKey, center: () => at, onLoading: () => setPasteMsg('loading') }))
  })
  useEffect(() => {
    const k = (e) => onKey(e), p = (e) => onPaste(e)
    window.addEventListener('keydown', k)
    document.addEventListener('paste', p)
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('paste', p) }
  }, [])

  const onDragOver = (e) => {
    if (noteEditId) return
    const types = [...e.dataTransfer.types]
    if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  }
  const onDrop = async (e) => {
    if (noteEditId) return
    e.preventDefault()
    const at = clientToDisp(e.clientX, e.clientY)
    applyPasteResult(await buildPasteItems(e.dataTransfer, { uploadKey, center: () => at, onLoading: () => setPasteMsg('loading') }))
  }

  // ── türetilmiş ──
  const k = view ? stretchOf(view) : 1
  const zoomNow = view?.zoom ?? 1
  const visible = useMemo(() => (items || []).filter(inScope), [items, inScope])
  const disp = useMemo(() => visible.map(it => toDisplay(it, k, zoomNow)), [visible, k, zoomNow])
  const dispById = useMemo(() => new Map(disp.map(d => [d.id, d])), [disp])
  const notes = useMemo(() => visible.filter(it => it.type === 'note'), [visible])
  const lanes = useMemo(() => layoutLanes(notes).lanes, [notes])
  const q = query.trim().toLocaleLowerCase('tr')
  const isDimmed = useCallback((it) => {
    if (it.type === 'note' && !statusShown.has(it.status)) return true
    if (!q) return false
    const hay = it.type === 'note' ? [it.title, it.body, ...(it.tags || [])].join(' ')
      : it.type === 'text' ? it.content : [it.title, it.roomName, it.url].join(' ')
    return !(hay || '').toLocaleLowerCase('tr').includes(q)
  }, [statusShown, q])
  const statusCounts = useMemo(() => {
    const m = Object.fromEntries(NOTE_STATUSES.map(s => [s.id, 0]))
    for (const n of notes) m[n.status] = (m[n.status] || 0) + 1
    return m
  }, [notes])

  // memo'lu öğelere sabit kimlikli işleyiciler: güncel sürümler layout effect'te bağlanır
  const live = useRef({})
  useLayoutEffect(() => {
    live.current = { onItemMouseDown, onItemDoubleClick, openLink, setPeriod }
  })
  const handlers = useMemo(() => ({
    down: (e, it) => live.current.onItemMouseDown(e, it),
    dbl: (e, it) => live.current.onItemDoubleClick(e, it),
    hover: (hid) => setHoveredId(hid),
    textHeight: (iid, h, initial) => update(prev => prev.map(it => it.id === iid && (!initial || it.h === 0) ? { ...it, h } : it), false),
    textMarkdown: (iid) => update(prev => prev.map(it => it.id === iid ? { ...it, markdown: true } : it), false),
    textCommit: (iid, content, h) => { update(prev => prev.map(it => it.id === iid ? { ...it, content, h } : it)); setEditingTextId(null) },
    openImages: (images, index) => setViewer({ images: urlsToViewerImages(images), index }),
    openLink: (link) => live.current.openLink(link),
    openPeriod: (unit, t) => live.current.setPeriod(unit, t),
  }), [update])

  if (loadErr) return <div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>Timeline yüklenemedi ({loadErr})</div>

  const v = view
  const noteEditItem = noteEditId ? (items || []).find(it => it.id === noteEditId && it.type === 'note') : null
  const notebookEditItem = notebookEditId ? (items || []).find(it => it.id === notebookEditId && it.type === 'notebook') : null
  const selBounds = items && v ? getBounds(selectedIds, disp) : null
  // tek tarihli not: sol/sağ = zaman, üst/alt = yükseklik; tarihli not içeren çoklu seçim boyutlanmaz
  const selDated = items ? items.filter(it => selectedIds.has(it.id) && it.type === 'note' && isValidStamp(it.start)).length : 0
  const selHandles = selDated === 0 ? null : selectedIds.size === 1 ? ['n', 'e', 's', 'w'] : []
  const hoverBox = hoveredId && !selectedIds.has(hoveredId) ? dispById.get(hoveredId) : null
  const pm = pasteMsg ? pasteMsgView(pasteMsg, missingLinksMessage) : null
  const periodText = v && size ? periodLabel(activePeriod || 'month', sToT(size.w / 2, v)) : ''

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* ── Araç çubuğu ── */}
      <div className="tl-tools" style={{ height: 50, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: `1px solid ${C.line}`,
        background: C.panel, overflowX: 'auto', overflowY: 'hidden' }}>
        <button className="tl-btn" onClick={() => size && addNoteAt(size.w / 2)} title="Görünümün ortasındaki zamana not (N)"
          style={{ ...toolBtn, background: C.accent, color: '#0b0b10', borderColor: C.accent }}>+ Not</button>
        <button className="tl-btn" onClick={addText} style={toolBtn}>Metin</button>
        <button className="tl-btn" onClick={() => fileRef.current?.click()} style={toolBtn}>Resim</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { const f = [...e.target.files]; e.target.value = ''; addImageFiles(f) }} />
        <button className="tl-btn" title="Kitaplıktan defter kartı ekle" aria-expanded={!!shelfAt}
          onMouseDown={stopEvt}
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setShelfAt(at => at ? null : { left: r.left, top: r.bottom + 6 }) }}
          style={{ ...toolBtn, ...(shelfAt ? toolOn : {}) }}>Defter</button>
        <button className="tl-btn" onClick={() => setDrawMode(m => m === 'line' ? null : 'line')} style={{ ...toolBtn, ...(drawMode === 'line' ? toolOn : {}) }}>Çizgi</button>
        <button className="tl-btn" onClick={() => setDrawMode(m => m === 'arrow' ? null : 'arrow')} style={{ ...toolBtn, ...(drawMode === 'arrow' ? toolOn : {}) }}>Ok</button>
        <span style={divider} />
        {locked ? (
          <>
            {/* gün canvas'ı: ay ızgarasına dönüş + gün gezinmesi */}
            <button className="tl-btn" onClick={onBack} title="Ay ızgarasına dön (Esc)" style={toolBtn}>← {monthLabel(monthOfDay(dayLock))}</button>
            <button className="tl-btn" onClick={() => onGoDay(dayLock - 1)} title="Önceki gün (←)" aria-label="Önceki gün" style={{ ...toolBtn, width: 30, padding: 0 }}>‹</button>
            <span style={{ font: `800 15px ${FONT_DISPLAY}`, color: C.text, padding: '0 4px', textAlign: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>{dayLabel(dayLock)}</span>
            <button className="tl-btn" onClick={() => onGoDay(dayLock + 1)} title="Sonraki gün (→)" aria-label="Sonraki gün" style={{ ...toolBtn, width: 30, padding: 0 }}>›</button>
            <button className="tl-btn" onClick={() => onGoDay(Math.floor(now))} title="Bugünün canvas'ı (T)" style={toolBtn}>Bugün</button>
          </>
        ) : (
          <>
            <button className="tl-btn" onClick={onOpenMonth} title="Ay ızgarası" style={toolBtn}>Takvim</button>
            {/* dönem görünümleri */}
            <div role="group" aria-label="Zaman ölçeği" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 10, border: `1px solid ${C.line}`, flexShrink: 0 }}>
              {PERIODS.map((p, i) => (
                <button key={p.id} className="tl-btn" onClick={() => setPeriod(p.id, periodTarget())} title={`${p.label} görünümü (${i + 1})`}
                  aria-pressed={activePeriod === p.id}
                  style={{ ...toolBtn, height: 28, borderColor: 'transparent', padding: '0 11px', ...(activePeriod === p.id ? toolOn : { background: 'transparent' }) }}>{p.label}</button>
              ))}
            </div>
            <button className="tl-btn" onClick={() => stepView(-1)} title="Önceki dönem (←)" aria-label="Önceki dönem" style={{ ...toolBtn, width: 30, padding: 0 }}>‹</button>
            <span style={{ font: `800 13px ${FONT_UI}`, color: C.text, minWidth: 128, textAlign: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>{periodText}</span>
            <button className="tl-btn" onClick={() => stepView(1)} title="Sonraki dönem (→)" aria-label="Sonraki dönem" style={{ ...toolBtn, width: 30, padding: 0 }}>›</button>
            <button className="tl-btn" onClick={goToday} title="Bugüne / şu ana git (T)" style={toolBtn}>Bugün</button>
          </>
        )}
        <span style={divider} />
        {NOTE_STATUSES.map(s => {
          const on = statusShown.has(s.id)
          return (
            <button key={s.id} className="tl-btn" title={on ? `${s.label} notlarını soluklaştır` : `${s.label} notlarını göster`} aria-label={s.label} aria-pressed={on}
              onClick={() => setStatusShown(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}
              style={{ ...toolBtn, display: 'flex', alignItems: 'center', gap: 7, color: on ? C.text : C.faint, background: 'transparent' }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: on ? s.color : 'transparent', border: `1.5px solid ${s.color}` }} />
              <span className="tl-hide-md">{s.label}</span>
              <span style={{ font: `200 11px ${FONT_MONO}`, color: C.faint }}>{statusCounts[s.id]}</span>
            </button>
          )
        })}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ara…" onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() } }}
          style={{ width: 116, flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, borderRadius: 999, color: C.text, font: `300 13px ${FONT_UI}`, padding: '7px 12px', outline: 'none' }} />
        <span style={{ flex: 1, minWidth: 8 }} />
        {pm && <span style={{ font: `300 12px ${FONT_UI}`, color: pm.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{pm.text}</span>}
        <SaveBadge state={saveState} />
        <span style={divider} />
        <button className="tl-btn" onClick={fitAll} title="Tümünü sığdır (F)" style={toolBtn}>Sığdır</button>
        <span title="Kart boyu (Alt+tekerlek)" style={{ font: `800 11px ${FONT_UI}`, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Kart</span>
        <button className="tl-btn" onClick={() => size && cardZoomAt(0.8, size.h / 2)} aria-label="Kartları küçült" style={{ ...toolBtn, width: 30, padding: 0 }}>−</button>
        <span style={{ font: `200 12px ${FONT_MONO}`, color: C.dim, minWidth: 40, textAlign: 'center', flexShrink: 0 }}>{v ? `${Math.round(v.zoom * 100)}%` : ''}</span>
        <button className="tl-btn" onClick={() => size && cardZoomAt(1.25, size.h / 2)} aria-label="Kartları büyüt" style={{ ...toolBtn, width: 30, padding: 0 }}>+</button>
      </div>

      <ConflictBanner conflict={conflict} onResolve={resolveConflict} />

      {/* ── Pano ── */}
      <div ref={containerRef} onMouseDown={onBgMouseDown} onDoubleClick={onBgDoubleClick}
        onMouseMove={e => { if (v) lastMouse.current = clientToDisp(e.clientX, e.clientY) }} onMouseLeave={() => { lastMouse.current = null }}
        onDragOver={onDragOver} onDrop={onDrop}
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: bg, cursor: drawMode ? 'crosshair' : 'default', userSelect: 'none' }}>
        {items === null && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, font: `200 13px ${FONT_MONO}` }}>yükleniyor…</div>}
        {items && v && size && (
          <>
            <AxisLayer view={v} size={size} notes={notes} dispById={dispById} lanes={lanes} isDimmed={isDimmed} now={now} onOpenPeriod={handlers.openPeriod} />
            <BarsLayer view={v} size={size} notes={notes} lanes={lanes} isDimmed={isDimmed} selectedIds={selectedIds}
              onBarMouseDown={onBarMouseDown} onBarDoubleClick={(e, n) => { stopEvt(e); setNoteEditId(n.id) }} />
            <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`, transformOrigin: '0 0' }}>
              {visible.map(it => it.type === 'arrow' ? null : (
                <TlItem key={it.id} item={it} left={dispById.get(it.id).x} width={dispById.get(it.id).w} editing={editingTextId === it.id} dimmed={isDimmed(it)} drawMode={!!drawMode} h={handlers} />
              ))}
              <ArrowLayer items={disp} selectedIds={selectedIds} hoveredArrowId={hoveredArrowId} editMode markerId={`tl-arr-${id}`}
                drawingLine={drawingLine} drawMode={drawMode} onHover={setHoveredArrowId} onItemMouseDown={onItemMouseDown}
                onDelete={(aid) => update(prev => prev.filter(it => it.id !== aid))} onHandleMouseDown={onArrowHandleMouseDown} />
            </div>
            <NowPill view={v} size={size} now={now} />
            {/* seçim / hover çerçeveleri (ekran uzayı → zoom'dan bağımsız kalınlık) */}
            {hoverBox && hoverBox.type !== 'arrow' && !drawMode && <ScreenRect box={hoverBox} view={v} style={{ border: '1px solid rgba(129,140,248,0.45)' }} />}
            {[...selectedIds].map(sid => {
              const d = dispById.get(sid)
              return d && d.type !== 'arrow' ? <ScreenRect key={sid} box={d} view={v} style={{ border: '2px solid rgba(129,140,248,0.95)' }} /> : null
            })}
            {selBounds && !drawMode && (
              <SelectionBox bounds={selBounds} view={v} multi={selectedIds.size > 1} handles={selHandles} onHandleMouseDown={onHandleMouseDown} />
            )}
            {selRect && (
              <div style={{ position: 'absolute', left: Math.min(selRect.x1, selRect.x2), top: Math.min(selRect.y1, selRect.y2), width: Math.abs(selRect.x2 - selRect.x1), height: Math.abs(selRect.y2 - selRect.y1),
                border: '1px dashed rgba(129,140,248,0.85)', background: 'rgba(129,140,248,0.08)', pointerEvents: 'none' }} />
            )}
            {visible.length === 0 && (
              <div style={{ position: 'absolute', left: '50%', top: '28%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', width: 'min(540px, 90%)' }}>
                <div style={{ font: `800 30px/1.15 ${FONT_DISPLAY}`, color: 'rgba(236,233,244,0.82)', marginBottom: 10 }}>Zamanı doldurmaya başla</div>
                <div style={{ font: `300 14px/1.6 ${FONT_UI}`, color: C.dim }}>
                  Boş alana <b style={{ fontWeight: 800 }}>çift tıkla</b> ya da <b style={{ fontWeight: 800 }}>N</b>'ye bas: o zamana resimli bir not balonu eklenir.
                  <b style={{ fontWeight: 800 }}> Gün</b> görünümünde not saatlidir — o günün hangi saatlerinde ne yaptığını işaretle.
                </div>
              </div>
            )}
            <div className="tl-hide-sm" style={{ position: 'absolute', left: 14, bottom: 10, font: `200 11px ${FONT_MONO}`, color: C.faint, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {locked
                ? 'çift tık: o saate not · kartı yatay sürükle: saati kaydır · Ctrl+tekerlek: saatlere yakınlaş · Alt+tekerlek: kart boyu · ←/→ gün · Esc: takvim'
                : 'sürükle: kaydır · Ctrl+tekerlek: zaman ölçeği · Alt+tekerlek: kart boyu · 1–4: gün/hafta/ay/yıl · ←/→ dönem · eksendeki güne tıkla: o gün · çift tık: not'}
            </div>
          </>
        )}
      </div>

      {noteEditItem && (
        <NoteEditor key={noteEditItem.id} note={noteEditItem} uploadKey={uploadKey}
          onSave={saveNote} onDelete={() => deleteNote(noteEditItem.id)} onClose={() => setNoteEditId(null)} />
      )}
      {shelfAt && (
        <ShelfPopover at={shelfAt} onClose={() => setShelfAt(null)}
          onPick={(meta) => addNotebook(meta)} onCreate={(meta) => addNotebook(meta, { edit: true })} />
      )}
      {notebookEditItem && (
        <NotebookCardDialog key={notebookEditItem.id} item={notebookEditItem}
          onClose={() => setNotebookEditId(null)}
          onSaved={(meta) => syncNotebookCards(notebookEditItem.src, meta)}
          onTake={() => { setNotebookEditId(null); takeNotebook(notebookEditItem.src) }}
          onDeleted={() => removeNotebookCards(notebookEditItem.src)} />
      )}
      {viewer && (
        <ImageViewer ownKeys images={viewer.images} index={viewer.index}
          onStep={(d) => setViewer(vw => {
            const n = vw.images.length
            return { ...vw, index: d === 'first' ? 0 : d === 'last' ? n - 1 : (vw.index + d + n) % n }
          })}
          onJump={(i) => setViewer(vw => ({ ...vw, index: i }))} onClose={() => setViewer(null)}
          onDownload={(it) => saveImageItem(it).catch(() => window.open(it.url, '_blank', 'noopener'))} />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Katmanlar
// ═════════════════════════════════════════════════════════════════════════════
// left: görüntü uzayında sol kenar (zaman ölçeğine göre); item kimliği değişmedikçe
// ve left aynı kaldıkça (kaydırma) yeniden render edilmez
const TlItem = memo(function TlItem({ item, left, width, editing, dimmed, drawMode, h }) {
  const isText = item.type === 'text'
  return (
    <div data-tl-item
      onMouseDown={e => h.down(e, item)} onDoubleClick={e => h.dbl(e, item)}
      onMouseEnter={() => h.hover(item.id)} onMouseLeave={() => h.hover(null)}
      style={{ position: 'absolute', left, top: item.y, width,
        height: isText ? 'auto' : item.h, cursor: drawMode ? 'crosshair' : editing ? 'text' : 'move',
        opacity: dimmed ? 0.14 : 1, transition: 'opacity 160ms', borderRadius: 4 }}>
      <ItemBody item={item} width={width} editing={editing}
        onOpenImages={h.openImages} onOpenLink={h.openLink}
        onTextHeight={(newH, { initial }) => h.textHeight(item.id, newH, initial)}
        onTextMarkdown={() => h.textMarkdown(item.id)}
        onTextCommit={(val, newH) => h.textCommit(item.id, val, newH)} />
    </div>
  )
})

function ScreenRect({ box, view, style }) {
  return (
    <div style={{ position: 'absolute', left: box.x * view.zoom + view.x, top: box.y * view.zoom + view.y,
      width: box.w * view.zoom, height: Math.max(box.h, 1) * view.zoom, borderRadius: 4, boxSizing: 'border-box', pointerEvents: 'none', ...style }} />
  )
}

const HANDLE_POS = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] }
// handles: gösterilecek tutamaçlar (null = hepsi)
function SelectionBox({ bounds, view, multi, handles, onHandleMouseDown }) {
  const P = 6
  const left = bounds.x * view.zoom + view.x - P, top = bounds.y * view.zoom + view.y - P
  const w = bounds.w * view.zoom + P * 2, hgt = bounds.h * view.zoom + P * 2
  return (
    <div style={{ position: 'absolute', left, top, width: w, height: hgt, border: multi ? '1px dashed rgba(129,140,248,0.8)' : 'none', borderRadius: 6, boxSizing: 'border-box', pointerEvents: 'none' }}>
      {w > 28 && hgt > 28 && Object.entries(HANDLE_POS).filter(([hk]) => !handles || handles.includes(hk)).map(([hk, [fx, fy]]) => (
        <div key={hk} onMouseDown={e => onHandleMouseDown(e, hk)}
          style={{ position: 'absolute', left: fx * w - 5, top: fy * hgt - 5, width: 10, height: 10, background: '#fff', border: '2px solid #6366f1', borderRadius: 3,
            boxSizing: 'border-box', pointerEvents: 'auto', cursor: `${hk}-resize` }} />
      ))}
    </div>
  )
}

// Major dönem paritesi (alternatif gölge): liste kaysa da aynı dönem aynı tonda kalsın
function periodParity(day, unit) {
  const d = new Date(Math.floor(day) * 86400000)
  const y = d.getUTCFullYear(), m = d.getUTCMonth()
  if (unit === 'day') return ((Math.floor(day) % 2) + 2) % 2
  if (unit === 'month') return (y * 12 + m) % 2
  if (unit === 'year') return ((y % 2) + 2) % 2
  return ((Math.floor(y / 10) % 2) + 2) % 2
}

// Hangi etikete tıklanınca hangi dönem açılır
const OPEN_ON_MINOR = { day: 'day', week: 'week', month: 'month', quarter: 'month', year: 'year' }
const OPEN_ON_MAJOR = { day: 'day', month: 'month', year: 'year' }

function AxisLayer({ view, size, notes, dispById, lanes, isDimmed, now, onOpenPeriod }) {
  const ppd = view.ppd
  const sx = (t) => (t - EPOCH_DAY) * ppd + view.x
  const fromT = (0 - view.x) / ppd + EPOCH_DAY - 1 / ppd
  const toT = (size.w - view.x) / ppd + EPOCH_DAY + 1 / ppd
  const { unit, minor, major, majorUnit } = axisTicks(fromT, toT, ppd)
  const axisY = view.y
  // eksen ekran dışındaysa cetvel kenara yapışır
  const rulerY = Math.min(Math.max(axisY, 8), size.h - 46)
  const pinned = rulerY !== axisY
  const hourly = ppd >= SUBDAY_MIN_PPD
  const nowX = hourly ? sx(now) : sx(Math.floor(now) + 0.5)
  const minorOpen = OPEN_ON_MINOR[unit], majorOpen = OPEN_ON_MAJOR[majorUnit]
  const clickable = (fn) => fn ? { style: { pointerEvents: 'auto', cursor: 'pointer' }, onMouseDown: stopEvt, onDoubleClick: stopEvt, onClick: fn } : {}

  // sticky major etiketi: soldaki aktif dönemin adı ekranın solunda kalır
  const majorLabels = major.map((m, i) => {
    const x0 = sx(m.day)
    const next = major[i + 1] ? sx(major[i + 1].day) : Infinity
    const wLabel = m.label.length * 8.2 + 8
    let x = Math.max(x0 + 8, 10)
    if (x + wLabel > next - 6) x = next - 6 - wLabel
    return { ...m, x0, x, next }
  })

  return (
    <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {majorLabels.map(m => periodParity(m.day, majorUnit) ? (
        <rect key={`p${m.day}`} x={m.x0} y={0} width={Math.max(0, Math.min(m.next, size.w + 10) - m.x0)} height={size.h} fill="rgba(255,255,255,0.016)" />
      ) : null)}

      {/* saplar: not kartından eksendeki çubuğa */}
      {notes.map(n => {
        if (!isValidStamp(n.start)) return null
        const d = dispById.get(n.id); if (!d) return null
        const lane = lanes.get(n.id) ?? 0
        const r = rangeSpan(n.start, n.end)
        const ncx = (d.x + d.w / 2) * view.zoom + view.x
        const ax = Math.min(Math.max(ncx, sx(r.t1)), sx(r.t2))
        const by = axisY - BAR_OFF - lane * LANE_GAP + BAR_H / 2
        const top = d.y * view.zoom + view.y, bottom = (d.y + d.h) * view.zoom + view.y
        let path = null
        if (bottom < by - 4) { const m = (bottom + by) / 2; path = `M${ncx} ${bottom} C${ncx} ${m} ${ax} ${m} ${ax} ${by}` }
        else if (top > axisY + 4) { const m = (top + axisY) / 2; path = `M${ncx} ${top} C${ncx} ${m} ${ax} ${m} ${ax} ${axisY}` }
        if (!path) return null
        if (Math.max(ncx, ax) < -50 || Math.min(ncx, ax) > size.w + 50) return null
        const col = statusOf(n.status).color
        return (
          <g key={n.id} opacity={isDimmed(n) ? 0.12 : 1}>
            <path d={path} fill="none" stroke={col} strokeOpacity={0.5} strokeWidth={1.5} />
            <circle cx={ax} cy={top > axisY + 4 ? axisY : by} r={3} fill={col} />
          </g>
        )
      })}

      {pinned && <rect x={0} y={rulerY - 8} width={size.w} height={46} fill="rgba(11,11,16,0.86)" />}
      <line x1={0} x2={size.w} y1={rulerY} y2={rulerY} stroke={pinned ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.38)'} strokeWidth={pinned ? 1 : 2} strokeDasharray={pinned ? '4 4' : undefined} />

      {minor.map(m => {
        const x = sx(m.day)
        const c = clickable(minorOpen ? () => onOpenPeriod(minorOpen, m.day + 0.01) : null)
        return (
          <g key={`m${m.day}`}>
            <line x1={x} x2={x} y1={rulerY} y2={rulerY + 6} stroke="rgba(255,255,255,0.3)" />
            <text x={x + 4} y={rulerY + 19} fill="rgba(236,233,244,0.5)" {...c} style={{ font: `200 11px ${FONT_MONO}`, ...c.style }}>
              {minorOpen && <title>{`${PERIODS.find(p => p.id === minorOpen).label} görünümünde aç`}</title>}
              {m.label}
            </text>
          </g>
        )
      })}
      {majorLabels.map(m => {
        const c = clickable(majorOpen ? () => onOpenPeriod(majorOpen, m.day + 0.01) : null)
        return (
          <g key={`M${m.day}`}>
            <line x1={m.x0} x2={m.x0} y1={rulerY - 6} y2={rulerY + 30} stroke="rgba(255,255,255,0.5)" />
            <text x={m.x} y={rulerY + 34} fill="rgba(236,233,244,0.88)" {...c} style={{ font: `800 12px ${FONT_UI}`, letterSpacing: '0.06em', textTransform: 'uppercase', ...c.style }}>{m.label}</text>
          </g>
        )
      })}

      {nowX > -20 && nowX < size.w + 20 && (
        <line x1={nowX} x2={nowX} y1={0} y2={size.h} stroke={C.today} strokeOpacity={hourly ? 0.8 : 0.55} strokeDasharray={hourly ? undefined : '3 5'} strokeWidth={hourly ? 1.5 : 1} />
      )}
    </svg>
  )
}

// "Bugün" / "Şimdi" etiketi kartların üstünde kalsın (çizgisi AxisLayer'da, kartların altında).
// Saatler okunur ölçekte şu anki saati gösterir.
function NowPill({ view, size, now }) {
  const hourly = view.ppd >= SUBDAY_MIN_PPD
  const x = ((hourly ? now : Math.floor(now) + 0.5) - EPOCH_DAY) * view.ppd + view.x
  if (x < -40 || x > size.w + 40) return null
  const text = hourly ? `ŞİMDİ ${formatClock(now)}` : 'BUGÜN'
  const w = hourly ? 92 : 52
  return (
    <div style={{ position: 'absolute', left: x - w / 2, top: 6, width: w, height: 18, borderRadius: 9, background: C.today, color: '#160b02',
      font: `800 10px/18px ${FONT_UI}`, letterSpacing: '0.1em', textAlign: 'center', pointerEvents: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>{text}</div>
  )
}

function BarsLayer({ view, size, notes, lanes, isDimmed, selectedIds, onBarMouseDown, onBarDoubleClick }) {
  const axisY = view.y
  if (axisY < -200 || axisY > size.h + 40) return null
  const sx = (t) => (t - EPOCH_DAY) * view.ppd + view.x
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {notes.map(n => {
        if (!isValidStamp(n.start)) return null
        const r = rangeSpan(n.start, n.end)
        const left = sx(r.t1), right = sx(r.t2)
        if (right < -20 || left > size.w + 20) return null
        const isPoint = !n.end
        const w = Math.max(right - left, isPoint ? 10 : 8)
        const lane = lanes.get(n.id) ?? 0
        const top = axisY - BAR_OFF - lane * LANE_GAP
        const col = statusOf(n.status).color
        const sel = selectedIds.has(n.id)
        const edge = Math.min(8, w / 3)
        return (
          <div key={n.id} className="tl-bar" title={`${n.title || 'Başlıksız not'} · ${formatRange(n.start, n.end)}`}
            onMouseDown={e => onBarMouseDown(e, n, 'move')} onDoubleClick={e => onBarDoubleClick(e, n)}
            style={{ position: 'absolute', left: isPoint ? left + (right - left) / 2 - w / 2 : left, top, width: w, height: BAR_H, borderRadius: 999,
              background: col, opacity: isDimmed(n) ? 0.15 : sel ? 1 : 0.82, cursor: 'grab', pointerEvents: 'auto',
              boxShadow: sel ? `0 0 0 2px #0b0b10, 0 0 0 3.5px ${col}` : 'none' }}>
            {!isPoint || sel ? (
              <>
                <div onMouseDown={e => onBarMouseDown(e, n, 'start')} style={{ position: 'absolute', left: -3, top: -4, bottom: -4, width: edge + 3, cursor: 'ew-resize' }} />
                <div onMouseDown={e => onBarMouseDown(e, n, 'end')} style={{ position: 'absolute', right: -3, top: -4, bottom: -4, width: edge + 3, cursor: 'ew-resize' }} />
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}


