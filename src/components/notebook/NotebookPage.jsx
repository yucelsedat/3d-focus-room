// Tek defter sayfası: başlık + ilerleme, çizgili gövde, satırlar.
// Sürükle-bırak: dnd-kit sortable, yalnızca tutamaktan; sürüklenen satır alt
// görevleriyle blok halinde taşınır (çocuklar sürükleme boyunca gizlenir).
// DragOverlay KULLANILMAZ: body'ye portal açılır ve oradaki tıklama pointer
// lock'u yeniden kilitler (drei PointerLockControls document click dinler).
//
// Satır seçimi: boş kağıttan (kenar boşluğu, satır altı) sürüklemek seçim
// dikdörtgeni açar; bir satırın yazısından başlayıp başka satıra taşan sürükleme
// de satır seçimine döner. Seçimde odak gövdededir (tabIndex -1): Ctrl+C/X panoya
// zengin metin yazar (notebookClipboard), Delete siler, Esc seçimi bırakır.
import { memo, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  appendRow, childProgressMap, clipRows, descendantIds, filterForRoom, insertClip, moveBlock, pageStats, removeRows,
} from '../../utils/notebookModel'
import { applyRows, currentRoomCtx, requestFocus, showToast, useNotebookStore } from './notebookStore'
import { readNotebookClip, writeNotebookClip } from './notebookClipboard'
import { NotebookRow } from './NotebookRow'
import { RoughBar, RoughLine } from './Rough'
import {
  LH, MARGIN_X, GUTTER_R, FLAG_OUT, HAND, PENCIL, PENCIL_SOFT, RULED_BG, GRAPHITE, useFontsReady, flagColor,
} from './paperStyles'

const lockX = ({ transform }) => ({ ...transform, x: 0 })

const NONE = new Set()
const DRAG_MIN = 4
const EDGE = 28 // kenara bu kadar yaklaşınca seçim dikdörtgeni sayfayı kaydırır

const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x))

const SortableRow = memo(function SortableRow(props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.row.id })
  return (
    <NotebookRow
      {...props}
      rowRef={setNodeRef}
      rowStyle={{ transform: CSS.Translate.toString(transform), transition }}
      handleProps={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
      dragging={isDragging}
    />
  )
})

// Oda ayracı: her satır kendi hizasında odasının renk şeridini taşır; oda üstteki
// satırdan farklıysa (grubun başı) şeridin üstüne adıyla bir yapışkan ayraç gelir.
function flagProps(row, prev, treeById, currentRoomId) {
  if (!row.roomId) return null
  const room = treeById.get(row.roomId)
  const name = room?.name ?? row.roomName
  if (!name) return null
  return {
    flagName: name,
    flagStart: !prev || prev.roomId !== row.roomId,
    flagAlive: !!room,
    flagCurrent: row.roomId === currentRoomId,
    flagColor: flagColor(row.roomId),
  }
}

export function NotebookPage({
  page, pageNumber, readOnly = false, filter = 'all', currentRoomId, treeById, onDragState,
}) {
  const rows = page.rows
  const bodyRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [activeDrag, setActiveDrag] = useState(null)
  const [sel, setSel] = useState(NONE)
  const [box, setBox] = useState(null) // seçim dikdörtgeni, gövde içerik koordinatında
  const fontsReady = useFontsReady()

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const stats = useMemo(() => pageStats(rows), [rows])
  const progress = useMemo(() => childProgressMap(rows), [rows])
  const hidden = useMemo(() => (activeDrag ? new Set(descendantIds(rows, activeDrag)) : null), [rows, activeDrag])
  const filtered = useMemo(
    () => (filter === 'room' ? filterForRoom(rows, currentRoomId) : null),
    [filter, rows, currentRoomId],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const display = filtered ?? rows.map(row => ({ row, dim: false }))
  const visible = hidden ? display.filter(d => !hidden.has(d.row.id)) : display
  const canDrag = !readOnly && !filtered
  // Kimlik dizisi yalnızca sıra/küme değişince yenilenir: her tuşta yeni dizi
  // SortableContext'i tazeler ve memo'lu satırların hepsi yeniden çizilirdi.
  const idsKey = visible.map(d => d.row.id).join('|')
  const itemIds = useMemo(() => (idsKey ? idsKey.split('|') : []), [idsKey])

  const common = (row, i, list) => {
    const p = progress.get(row.id)
    return {
      row,
      pageId: page.id,
      prevId: list[i - 1]?.row.id ?? null,
      nextId: list[i + 1]?.row.id ?? null,
      readOnly,
      structureLocked: !!filtered,
      progressDone: p?.done ?? 0,
      progressTotal: p?.total ?? 0,
      width,
      fontsReady,
      ...flagProps(row, list[i - 1]?.row, treeById, currentRoomId),
    }
  }

  // Satırların altındaki boş kağıda tıklamak: son satır boşsa ona, değilse yeni satıra yaz
  const fillerClick = () => {
    const last = visible[visible.length - 1]?.row
    if (last && !last.text) requestFocus(last.id, 0)
    else applyRows(page.id, rs => appendRow(rs, currentRoomCtx()))
  }

  // ─── satır seçimi ──────────────────────────────────────────────────────────
  const select = (ids) => setSel(prev => (sameSet(prev, ids) ? prev : ids))
  const rowEls = () => [...bodyRef.current.querySelectorAll('[data-row-id]')]

  // Dikey aralığı (içerik koordinatı) kesen satırlar
  const rowsInRange = (y1, y2) => {
    const el = bodyRef.current
    const top = el.getBoundingClientRect().top - el.scrollTop
    const ids = new Set()
    for (const r of rowEls()) {
      const b = r.getBoundingClientRect()
      if (b.top - top < y2 && b.bottom - top > y1) ids.add(r.dataset.rowId)
    }
    return ids
  }

  // İmlecin hizasındaki satır (üstte/altta kalırsa ilk/son satır)
  const rowIndexAt = (els, cy) => {
    if (!els.length) return -1
    if (cy < els[0].getBoundingClientRect().top) return 0
    const i = els.findIndex(r => cy < r.getBoundingClientRect().bottom)
    return i < 0 ? els.length - 1 : i
  }

  const edgeSpeed = (cy) => {
    const r = bodyRef.current.getBoundingClientRect()
    if (cy < r.top + EDGE) return -Math.min(24, Math.ceil((r.top + EDGE - cy) / 3))
    if (cy > r.bottom - EDGE) return Math.min(24, Math.ceil((cy - r.bottom + EDGE) / 3))
    return 0
  }

  // Sürükleme boyunca window dinleyicileri; onMove(ev) her harekette, onEnd(moved) bırakınca
  const track = (down, onMove, onEnd) => {
    let moved = false
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) < DRAG_MIN) return
      moved = true
      onMove(ev)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      onEnd(moved)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const startMarquee = (down, fromFiller) => {
    const el = bodyRef.current
    el.focus({ preventScroll: true })
    const local = (cx, cy) => {
      const r = el.getBoundingClientRect()
      return {
        x: Math.max(0, Math.min(el.clientWidth, cx - r.left)),
        y: Math.max(0, Math.min(el.scrollHeight, cy - r.top + el.scrollTop)),
      }
    }
    const start = local(down.clientX, down.clientY)
    let last = down
    let raf = 0
    const update = () => {
      const p = local(last.clientX, last.clientY)
      const y = Math.min(start.y, p.y)
      const h = Math.abs(p.y - start.y)
      setBox({ x: Math.min(start.x, p.x), y, w: Math.abs(p.x - start.x), h })
      select(rowsInRange(y, y + h))
    }
    const scroll = () => {
      const dy = edgeSpeed(last.clientY)
      if (!dy) { raf = 0; return }
      el.scrollTop += dy
      update()
      raf = requestAnimationFrame(scroll)
    }
    track(down, (ev) => {
      last = ev
      update()
      if (!raf) raf = requestAnimationFrame(scroll)
    }, (moved) => {
      cancelAnimationFrame(raf)
      setBox(null)
      if (moved) return
      select(NONE)
      if (fromFiller) fillerClick()
    })
  }

  // Yazıdan başlayan sürükleme başka satıra geçince satır seçimine döner
  const startTextDrag = (down, anchorId) => {
    const ta = down.target
    let block = false
    track(down, (ev) => {
      const els = rowEls()
      const a = els.findIndex(r => r.dataset.rowId === anchorId)
      const b = rowIndexAt(els, ev.clientY)
      if (a < 0 || b < 0) return
      if (!block) {
        if (a === b) return
        block = true
        bodyRef.current.focus({ preventScroll: true })
      }
      const [i, j] = a < b ? [a, b] : [b, a]
      select(new Set(els.slice(i, j + 1).map(r => r.dataset.rowId)))
    }, () => {
      if (block) ta.setSelectionRange(ta.selectionEnd, ta.selectionEnd)
    })
  }

  const onBodyDown = (e) => {
    if (readOnly || e.button !== 0) return
    const t = e.target
    if (t.closest('button, input, a')) return
    const text = t.closest('.nb-text')
    if (text) {
      select(NONE)
      startTextDrag(e, text.closest('[data-row-id]').dataset.rowId)
      return
    }
    e.preventDefault()
    startMarquee(e, !!t.closest('.nb-filler'))
  }

  const keyOf = () => useNotebookStore.getState().key
  const dropSelected = (ids, verb) => {
    const n = rows.filter(r => ids.has(r.id)).length
    if (!n) return
    const before = useNotebookStore.getState().doc
    applyRows(page.id, rs => removeRows(rs, ids, currentRoomCtx()))
    select(NONE)
    showToast(`${n} satır ${verb}`, before)
  }
  const copySelected = async (cut) => {
    const ids = sel
    const clip = clipRows(rows, ids)
    if (!clip.length) return
    if (!(await writeNotebookClip(clip, keyOf()))) { showToast('panoya yazılamadı'); return }
    if (cut) dropSelected(ids, 'kesildi')
    else showToast(`${clip.length} satır kopyalandı`)
  }

  // Yalnızca odak gövdedeyken (seçim modu); textarea'lar kendi tuşlarını yönetir
  const onBodyKey = (e) => {
    if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    let handled = true
    if (mod && k === 'a') select(new Set(visible.map(d => d.row.id)))
    else if (!sel.size) handled = false
    else if (mod && (k === 'c' || k === 'x')) copySelected(k === 'x')
    else if (e.key === 'Delete' || e.key === 'Backspace') dropSelected(sel, 'silindi')
    else if (e.key === 'Escape') select(NONE)
    else handled = false
    if (!handled) return
    e.preventDefault()
    e.stopPropagation()
  }

  // Odak bir yazı alanında değilken (seçim modu, sekme tıklandıktan sonra…) defter
  // satırlarını yapıştır: seçim varsa onun yerine, yoksa sayfa sonuna; eklenenler seçili kalır.
  // Satır textarea'larına yapıştırmayı NotebookRow yönetir.
  const onDocPaste = useEffectEvent((e) => {
    const el = bodyRef.current
    const active = document.activeElement
    if (readOnly || !el || active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT' || active?.isContentEditable) return
    const clip = readNotebookClip(e.clipboardData)
    if (!clip) return
    e.preventDefault()
    const key = keyOf()
    let res = null
    applyRows(page.id, rs => {
      res = insertClip(rs, clip.rows, { replaceIds: sel.size ? sel : null, keepRooms: !!key && clip.key === key }, currentRoomCtx())
      return { rows: res.rows }
    })
    if (res?.ids.length) {
      el.focus({ preventScroll: true })
      select(new Set(res.ids))
    }
  })
  useEffect(() => {
    if (readOnly) return
    const h = (e) => onDocPaste(e)
    document.addEventListener('paste', h)
    return () => document.removeEventListener('paste', h)
  }, [readOnly])

  const ratio = stats.total ? stats.done / stats.total : 0

  return (
    <div style={s.sheet}>
      <header style={s.header}>
        <div style={s.titleWrap}>
          <h2 style={s.title}>{page.title}</h2>
          <RoughLine width={Math.min(360, 40 + page.title.length * 17)} seed={page.seed} />
        </div>
        <div style={s.stats} aria-label={`${stats.total} işten ${stats.done} tanesi bitti`}>
          <span style={s.statsText}>
            {stats.total ? <>bitti <b style={s.statsNum}>{stats.done}/{stats.total}</b></> : 'henüz iş yok'}
          </span>
          <RoughBar width={128} height={13} seed={page.seed + 5} ratio={ratio} />
        </div>
      </header>

      <div
        ref={bodyRef}
        className="nb-body"
        style={s.body}
        tabIndex={readOnly ? undefined : -1}
        aria-label={sel.size ? `${sel.size} satır seçili` : undefined}
        onMouseDown={onBodyDown}
        onKeyDown={onBodyKey}
      >
        {canDrag ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[lockX]}
            onDragStart={(e) => { setActiveDrag(e.active.id); onDragState?.(true) }}
            onDragCancel={() => { setActiveDrag(null); onDragState?.(false) }}
            onDragEnd={(e) => {
              setActiveDrag(null)
              onDragState?.(false)
              if (e.over && e.active.id !== e.over.id) {
                applyRows(page.id, rs => moveBlock(rs, e.active.id, e.over.id))
              }
            }}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              {visible.map((d, i) => (
                <SortableRow
                  key={d.row.id}
                  {...common(d.row, i, visible)}
                  selected={sel.has(d.row.id)}
                  hiddenCount={d.row.id === activeDrag && hidden ? hidden.size : 0}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visible.map((d, i) => <NotebookRow key={d.row.id} {...common(d.row, i, visible)} dim={d.dim} selected={sel.has(d.row.id)} />)
        )}

        {!readOnly && (
          <div className="nb-filler" style={s.filler}>
            <span className="nb-filler-hint" style={{ ...s.fillerHint, opacity: visible.length ? 0 : 1 }}>
              {filtered && !visible.length ? 'bu odada henüz not yok — yazmaya başla' : '+ yeni satır'}
            </span>
          </div>
        )}

        {box && <div aria-hidden="true" style={{ ...s.marquee, left: box.x, top: box.y, width: box.w, height: box.h }} />}
      </div>

      <div style={s.pageNo} aria-hidden="true">— {pageNumber} —</div>
      <div style={s.graphite} aria-hidden="true" />
    </div>
  )
}

const s = {
  // overflow görünür: gövde, oda ayraçları için kağıdın sağından dışarı uzanır
  sheet: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flex: `0 0 ${LH * 3}px`,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    padding: `18px ${GUTTER_R}px 0 ${MARGIN_X + 18}px`,
  },
  titleWrap: { minWidth: 0 },
  title: {
    margin: 0,
    fontFamily: HAND,
    fontWeight: 700,
    fontSize: 46,
    lineHeight: '50px',
    color: PENCIL,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 560,
  },
  stats: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    paddingTop: 10,
    flex: '0 0 auto',
  },
  statsText: {
    fontFamily: HAND,
    fontSize: 23,
    color: PENCIL_SOFT,
    lineHeight: '24px',
  },
  statsNum: { color: PENCIL, fontWeight: 700 },
  body: {
    position: 'relative',
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    // Kaydırma alanı kağıdın sağından FLAG_OUT kadar taşar: içindeki ayraçlar
    // kesilmeden dışarı çıkar ve satırlarla birlikte kayar. Çizgiler yalnızca kağıtta.
    marginRight: -FLAG_OUT,
    padding: `0 ${GUTTER_R + FLAG_OUT}px 0 ${MARGIN_X}px`,
    backgroundImage: RULED_BG,
    backgroundSize: `calc(100% - ${FLAG_OUT}px) 100%`,
    backgroundRepeat: 'repeat-y',
    backgroundAttachment: 'local',
    outline: 'none',
  },
  marquee: {
    position: 'absolute',
    zIndex: 6,
    pointerEvents: 'none',
    background: 'rgba(244,211,94,0.16)',
    border: `1.5px dashed ${PENCIL_SOFT}`,
    borderRadius: 3,
  },
  filler: {
    flex: '1 0 auto',
    minHeight: LH * 3,
    cursor: 'text',
    paddingLeft: 50,
    paddingTop: 1,
  },
  fillerHint: {
    display: 'block',
    fontFamily: HAND,
    fontSize: 23,
    lineHeight: `${LH}px`,
    position: 'relative',
    top: 4,
    color: PENCIL_SOFT,
    transition: 'opacity .15s',
  },
  pageNo: {
    flex: `0 0 ${LH * 1.5}px`,
    textAlign: 'center',
    fontFamily: HAND,
    fontSize: 20,
    color: PENCIL_SOFT,
    lineHeight: `${LH * 1.5}px`,
    fontFeatureSettings: '"lnum"',
    fontVariantNumeric: 'lining-nums',
  },
  graphite: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: GRAPHITE,
    opacity: 0.55,
  },
}
