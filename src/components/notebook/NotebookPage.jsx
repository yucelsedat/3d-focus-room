// Tek defter sayfası: başlık + ilerleme, çizgili gövde, satırlar.
// Sürükle-bırak: dnd-kit sortable, yalnızca tutamaktan; sürüklenen satır alt
// görevleriyle blok halinde taşınır (çocuklar sürükleme boyunca gizlenir).
// DragOverlay KULLANILMAZ: body'ye portal açılır ve oradaki tıklama pointer
// lock'u yeniden kilitler (drei PointerLockControls document click dinler).
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  appendRow, childProgressMap, descendantIds, filterForRoom, moveBlock, pageStats,
} from '../../utils/notebookModel'
import { applyRows, currentRoomCtx, requestFocus } from './notebookStore'
import { NotebookRow } from './NotebookRow'
import { RoughBar, RoughLine } from './Rough'
import {
  LH, MARGIN_X, GUTTER_R, FLAG_OUT, HAND, PENCIL, PENCIL_SOFT, RULED_BG, GRAPHITE, useFontsReady, flagColor,
} from './paperStyles'

const lockX = ({ transform }) => ({ ...transform, x: 0 })

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
  const onFillerDown = (e) => {
    if (readOnly || e.button !== 0) return
    e.preventDefault()
    const last = visible[visible.length - 1]?.row
    if (last && !last.text) requestFocus(last.id, 0)
    else applyRows(page.id, rs => appendRow(rs, currentRoomCtx()))
  }

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

      <div ref={bodyRef} className="nb-body" style={s.body}>
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
                  hiddenCount={d.row.id === activeDrag && hidden ? hidden.size : 0}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visible.map((d, i) => <NotebookRow key={d.row.id} {...common(d.row, i, visible)} dim={d.dim} />)
        )}

        {!readOnly && (
          <div className="nb-filler" style={s.filler} onMouseDown={onFillerDown}>
            <span className="nb-filler-hint" style={{ ...s.fillerHint, opacity: visible.length ? 0 : 1 }}>
              {filtered && !visible.length ? 'bu odada henüz not yok — yazmaya başla' : '+ yeni satır'}
            </span>
          </div>
        )}
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
