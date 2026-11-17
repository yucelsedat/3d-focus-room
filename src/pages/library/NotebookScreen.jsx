// Seyir defteri: app/notebook.tsx — sayfa çevirerek gezilen defter (/notebook?id=). Defter en son
// kalınan sayfadan açılır; son sayfanın ardında boş bir sayfa durur, ona çevrilince defter bir
// sayfa uzar. Okuma modu, sayfa listesi, sayfa ekleme/çıkarma Faz 8'de.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import './library.css'
import './notebook/notebook.css'
import { deleteNotebookPage, getNotebook, getWrittenPages, insertNotebookPage, setNotebookPageCount } from './api.js'
import { hasNumberedPages } from './model.js'
import { NotebookLoader } from './NotebookLoader.jsx'
import { deleteContentFiles } from './notebook/blockClipboard.js'
import { DEFAULT_PEN } from './notebook/marks.js'
import { NotebookPage } from './notebook/NotebookPage.jsx'
import { PageIndex } from './notebook/PageIndex.jsx'
import { lastPageKey, rememberNotebook, storageGet, storageSet } from './state.js'
import { colors, fonts, HAND_TAIL } from './theme.js'

// Görünen sayfanın iki yanında kaçar sayfa hazır tutulur
const PRELOAD = 2
// Perspektif uzaklığı, sayfa genişliği cinsinden
const DEPTH = 4
// Sayfayı çevirmeye yeten sürükleme oranı ve fırlatma hızı (px/s)
const TURN_DISTANCE = 0.3
const TURN_VELOCITY = 600
// Sayfa hazır haberi gelmese de loader en geç bu kadar sonra kalkar (ms)
const LOADER_TIMEOUT = 8000
// Geniş ekranda kâğıt bu kadar enlidir; iki yanında masa görünür
const SHEET_MAX = 820

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const clampPage = (index, count) => Math.min(count - 1, Math.max(0, index))
const easeOutCubic = (t) => 1 - (1 - t) ** 3

// Kesirli sayfa konumu (12.4 ise 12. sayfa %40 kalkmış, altından 13. görünüyor). React'e
// dokunmadan yaprakların stilini her karede günceller (mobilde Reanimated shared value).
function usePosition(initial) {
  const ref = useRef(null)
  if (!ref.current) {
    let value = initial
    let frame = 0
    const subs = new Set()
    const emit = () => subs.forEach((f) => f(value))
    ref.current = {
      get: () => value,
      set(next) {
        cancelAnimationFrame(frame)
        value = next
        emit()
      },
      cancel: () => cancelAnimationFrame(frame),
      animate(target, duration, done) {
        cancelAnimationFrame(frame)
        const from = value
        const start = performance.now()
        const step = (now) => {
          const t = Math.min(1, (now - start) / duration)
          value = from + (target - from) * easeOutCubic(t)
          emit()
          if (t < 1) frame = requestAnimationFrame(step)
          else done?.()
        }
        frame = requestAnimationFrame(step)
      },
      subscribe(f) {
        subs.add(f)
        f(value)
        return () => subs.delete(f)
      },
    }
  }
  return ref.current
}

// Defter istenen sayfadan, yoksa en son kalınan sayfadan açılır; hiç açılmadıysa ilk sayfadan
function initialPage(notebookId) {
  const saved = storageGet(lastPageKey(notebookId))
  const match = saved && /^page:(\d+)$/.exec(saved)
  return match ? Math.max(0, Number(match[1]) - 1) : 0
}

export default function NotebookScreen() {
  const [params] = useSearchParams()
  const notebookId = Number(params.get('id'))
  const [notebook, setNotebook] = useState(null)
  const [missing, setMissing] = useState(false)
  const [ready, setReady] = useState(false)
  const [loaderShown, setLoaderShown] = useState(true)
  const markReady = useCallback(() => setReady(true), [])
  const hideLoader = useCallback(() => setLoaderShown(false), [])

  useEffect(() => {
    let cancelled = false
    getNotebook(notebookId)
      .then((result) => {
        if (cancelled) return
        if (result) setNotebook(result)
        else setMissing(true)
      })
      .catch(() => !cancelled && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [notebookId])

  // Sayfa hazır haberi hiç gelmezse loader sonsuza dek kalmasın
  useEffect(() => {
    const timer = setTimeout(markReady, LOADER_TIMEOUT)
    return () => clearTimeout(timer)
  }, [markReady])

  return (
    <div className="lib-root">
      <div className="lib-app" style={styles.desk}>
        {notebook && hasNumberedPages(notebook.kind) && <OpenNotebook notebook={notebook} onReady={markReady} />}
        {(missing || (notebook && !hasNumberedPages(notebook.kind))) && (
          <div style={styles.center}>
            <div style={styles.title}>{(missing ? 'Defter bulunamadı' : 'Bu defter türü yakında açılacak') + HAND_TAIL}</div>
          </div>
        )}
        {loaderShown && !missing && <NotebookLoader done={ready || missing} onHidden={hideLoader} />}
      </div>
    </div>
  )
}

// Sayfa eklenince ve çıkarılınca açık yaprakların anahtarı bu değişikliklerden önceki numarasından
// bulunur; yapraklar sayfalarıyla birlikte kayar, yeniden kurulup göz kırpmaz
function keyOf(edits, index) {
  let original = index
  for (let n = edits.length - 1; n >= 0; n--) {
    const edit = edits[n]
    if (edit.kind === 'insert') {
      if (original === edit.at) return `added-${n}`
      if (original > edit.at) original--
    } else if (original >= edit.at) {
      original++
    }
  }
  return `page-${original}`
}

// Yazılı sayfaların numaraları (0'dan), sırasıyla; defterde olmayanlar atlanır
async function writtenPageIndices(notebookId, count) {
  const rows = await getWrittenPages(notebookId)
  return [...new Set(rows.filter((r) => r.kind === 'page').map((r) => r.ref - 1))]
    .filter((index) => index >= 0 && index < count)
    .sort((a, b) => a - b)
}

const ADD_TURN_DURATION = 560

function OpenNotebook({ notebook, onReady }) {
  const navigate = useNavigate()
  const notebookId = notebook.id
  const deskRef = useRef(null)
  const [deskWidth, setDeskWidth] = useState(0)
  const width = Math.min(deskWidth, SHEET_MAX)
  // Okuma modu sayfa çevrilince de sürer: açıkken yalnızca yazılı sayfalar (written) çevrilir;
  // page ve position o zaman bu listedeki sırayı gösterir
  const [reading, setReading] = useState(false)
  const [written, setWritten] = useState(null)
  // Elde tutulan kalem de sayfa çevrilince değişmez
  const [pen, setPen] = useState(DEFAULT_PEN)
  const [page, setPage] = useState(() => initialPage(notebookId))
  // Defterin sayfa sayısı; son sayfanın ardında boş bir sayfa daha durur, ona çevrilince uzar
  const [pages, setPages] = useState(() => Math.max(notebook.page_count, page + 1))
  const fullCount = pages + 1
  const pageCount = written ? written.length : fullCount
  const pageAt = (order) => (written ? written[order] : order)
  const position = usePosition(page)
  const turnCount = useRef(pageCount)
  useLayoutEffect(() => {
    turnCount.current = pageCount
  }, [pageCount])
  // Defter açılırken önce yalnızca görünen sayfa kurulur; o çizilince iki yanındakiler
  const [preload, setPreload] = useState(0)
  // Eklenen ve çıkarılan sayfaların yerleri, yapıldıkları sırayla
  const [edits, setEdits] = useState([])
  // Çıkarılan sayfa, altındaki sayfayı göstererek kalkana kadar kendi yaprağında durur
  const [ghost, setGhost] = useState(null)
  const ghostTurn = usePosition(0)
  // Sayfa listesi (arama): görünen sayfanın üstüne soldan kapanan yaprak; 1'de dik, 0'da kapalı
  const [indexOpen, setIndexOpen] = useState(false)
  const indexTurn = usePosition(1)
  const [notice, setNotice] = useState(null)
  // Görünen sayfada blok seçimi, blok sürükleme ya da çizim modu açıkken sayfa çevrilmez
  const [locked, setLocked] = useState(false)

  useLayoutEffect(() => {
    const el = deskRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setDeskWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    rememberNotebook(notebookId)
  }, [notebookId])

  useEffect(() => {
    const timer = setTimeout(() => setPreload(PRELOAD), LOADER_TIMEOUT)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 2600)
    return () => clearTimeout(timer)
  }, [notice])

  // Defter uzayınca ya da kısalınca sayfa sayısı kaydedilir
  useEffect(() => {
    if (pages !== notebook.page_count) setNotebookPageCount(notebookId, pages).catch(() => {})
  }, [notebookId, notebook.page_count, pages])

  function markCurrentReady() {
    onReady?.()
    if (preload === PRELOAD) return
    requestAnimationFrame(() => setTimeout(() => setPreload(PRELOAD), 0))
  }

  function remember(index) {
    storageSet(lastPageKey(notebookId), `page:${index + 1}`)
  }

  function settle(order) {
    setPage(order)
    const index = pageAt(order)
    remember(index)
    if (index >= pages) setPages(index + 1)
  }

  function back() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/', { replace: true })
  }

  // Çevirme yarıda bırakılınca hedefe süzülür
  function turnTo(target) {
    if (indexOpen || ghost || locked) return
    const clamped = clampPage(target, turnCount.current)
    const remaining = Math.abs(clamped - position.get())
    position.animate(clamped, 120 + 380 * remaining, () => settle(clamped))
  }

  // Okuma modu değişince çevrilecek sayfalar yeniden seçilir: bu sayfa listede yoksa ondan sonraki
  // ilk sayfaya geçilir. Gösterilecek sayfa yoksa hiçbir şey değişmez, false döner.
  async function changeReading(next) {
    const current = pageAt(page)
    if (!next) {
      position.set(current)
      turnCount.current = fullCount
      setPage(current)
      setWritten(null)
      setReading(false)
      return
    }
    const indices = await writtenPageIndices(notebookId, fullCount).catch(() => [])
    if (indices.length === 0) {
      setNotice('Bu defterde henüz yazılı sayfa yok.')
      return
    }
    const after = indices.findIndex((index) => index >= current)
    const order = after === -1 ? indices.length - 1 : after
    position.set(order)
    turnCount.current = indices.length
    setPage(order)
    setWritten(indices)
    setReading(true)
  }

  // Görünen sayfanın soluna (önüne) ya da sağına (ardına) boş bir sayfa eklenir ve ona çevrilir.
  // Okuma modu kapanır: yeni sayfa boş, onunla görünmezdi.
  async function addPage(side) {
    const current = pageAt(page)
    const at = side === 'left' ? current : current + 1
    try {
      await insertNotebookPage(notebookId, at + 1)
    } catch {
      setNotice('Sayfa eklenemedi')
      return
    }
    position.cancel()
    setWritten(null)
    setReading(false)
    setEdits((prev) => [...prev, { kind: 'insert', at }])
    setPages((prev) => prev + 1)
    turnCount.current = pages + 2
    if (side === 'left') {
      // Görünen sayfa bir numara kayar; yeni sayfa soldan üstüne kapanır
      position.set(current + 1)
      setPage(current + 1)
      requestAnimationFrame(() => position.animate(current, ADD_TURN_DURATION, () => settle(current)))
    } else {
      // Yeni sayfa görünen sayfanın altına girer; görünen sayfa kalkıp onu gösterir
      position.set(current)
      setPage(current)
      requestAnimationFrame(() => position.animate(current + 1, ADD_TURN_DURATION, () => settle(current + 1)))
    }
  }

  // Görünen sayfa defterden çıkar: yaprağı kalkar, altından ardındaki sayfa görünür
  async function deletePage() {
    if (ghost) return
    const current = pageAt(page)
    const key = keyOf(edits, current)
    let contents = []
    try {
      contents = await deleteNotebookPage(notebookId, current + 1)
    } catch {
      setNotice('Sayfa silinemedi')
      return
    }
    position.cancel()
    ghostTurn.set(0)
    setGhost({ key, index: current })
    setWritten(null)
    setReading(false)
    setEdits((prev) => [...prev, { kind: 'remove', at: current }])
    setPages((prev) => Math.max(1, prev - 1))
    turnCount.current = Math.max(1, pages - 1) + 1
    position.set(current)
    setPage(current)
    remember(current)
    // Yaprak kalkınca kaldırılır, eklerinin dosyaları silinir
    requestAnimationFrame(() =>
      ghostTurn.animate(1, ADD_TURN_DURATION, () => {
        setGhost(null)
        deleteContentFiles(contents)
      }),
    )
  }

  function openIndex() {
    document.activeElement?.blur?.()
    setIndexOpen(true)
    indexTurn.set(1)
    requestAnimationFrame(() => indexTurn.animate(0, 520))
  }

  function closeIndex(delay = 0) {
    setTimeout(() => indexTurn.animate(1, 520, () => setIndexOpen(false)), delay)
  }

  // Sayfa listesinden seçilen sayfa açılır; okurken o sayfa çevrilenler arasında değilse okuma
  // modu kapanır
  function openFromIndex(number) {
    const index = clampPage(number - 1, fullCount)
    const order = written ? written.indexOf(index) : index
    position.cancel()
    if (written && order !== -1) {
      position.set(order)
      setPage(order)
    } else {
      position.set(index)
      turnCount.current = fullCount
      setPage(index)
      setWritten(null)
      setReading(false)
    }
    remember(index)
    closeIndex(160)
  }

  useEffect(() => {
    if (!indexOpen) return
    const onKey = (e) => e.key === 'Escape' && closeIndex()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ─── Sürükleyerek çevirme ────────────────────────────────────────────────────
  // Dokunmatikte kâğıdın her yerinden (dikey sürükleme sayfayı kaydırır); farede yazının olmadığı
  // yerden — yazının üstünde sürüklemek yazıyı seçer.
  const drag = useRef(null)

  function canStartDrag(e) {
    if (e.button !== 0 || indexOpen || ghost || locked) return false
    const target = e.target
    // Blok seçimi alanı ve blok tutamacı kendi sürüklemesini yapar
    if (target.closest('textarea, input, [contenteditable], button, a, .nb-carousel, pre, .nb-select-layer, .nb-grip, .nb-draw-surface')) return false
    if (e.pointerType === 'mouse' && target.closest('.nb-md-unit')) return false
    return true
  }
  function onPointerDown(e) {
    if (!canStartDrag(e)) return
    position.cancel()
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, start: position.get(), active: false, samples: [] }
  }

  function onPointerMove(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.active) {
      // Dikey kaydırma notların; yalnızca belirgin yatay sürükleme sayfayı çevirir
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
        drag.current = null
        return
      }
      if (Math.abs(dx) <= 12) return
      d.active = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // işaretçi bu arada kalktıysa
      }
      window.getSelection?.()?.removeAllRanges()
      document.activeElement?.blur?.()
      deskRef.current?.classList.add('nb-turning')
    }
    d.samples.push({ x: e.clientX, t: performance.now() })
    if (d.samples.length > 5) d.samples.shift()
    const base = Math.round(d.start)
    // Sola sürükleyince sayfa ilerler; bir seferde tek sayfa çevrilir
    const next = d.start - dx / width
    position.set(clampPage(Math.min(base + 1, Math.max(base - 1, next)), turnCount.current))
  }

  function onPointerUp(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    deskRef.current?.classList.remove('nb-turning')
    if (!d.active) return
    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const velocity = first && last && last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * 1000 : 0
    const base = Math.round(d.start)
    const moved = position.get() - base
    let target = base
    if (moved > 0 && (moved > TURN_DISTANCE || velocity < -TURN_VELOCITY)) target = base + 1
    if (moved < 0 && (moved < -TURN_DISTANCE || velocity > TURN_VELOCITY)) target = base - 1
    turnTo(target)
  }

  // ─── Klavye ve trackpad ──────────────────────────────────────────────────────
  useEffect(() => {
    const editing = () => {
      const el = document.activeElement
      return el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
    }
    const onKey = (e) => {
      if (editing() || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        turnTo(Math.round(position.get()) + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        turnTo(Math.round(position.get()) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Trackpad'de iki parmakla yana kaydırma da sayfa çevirir
  const wheel = useRef({ sum: 0, until: 0 })
  function onWheel(e) {
    if (locked || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    const w = wheel.current
    const now = performance.now()
    if (now < w.until) return
    w.sum += e.deltaX
    if (Math.abs(w.sum) > 80) {
      turnTo(Math.round(position.get()) + (w.sum > 0 ? 1 : -1))
      w.sum = 0
      w.until = now + 550
    }
  }

  // Büyük numaralı sayfa altta: önceki sayfa sonrakinin üstüne kapanır
  const sheets = []
  for (let i = page + preload; i >= page - preload; i--) {
    if (i >= 0 && i < pageCount) sheets.push(i)
  }

  const sheetProps = {
    notebookId,
    paper: notebook.paper,
    onBack: back,
    reading,
    onReadingChange: changeReading,
    onSearchPress: openIndex,
    pen,
    onPenChange: setPen,
    onAddPage: addPage,
    onDeletePage: deletePage,
  }

  return (
    <div
      ref={deskRef}
      style={styles.flipDesk}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {width > 0 && (
        <div style={{ ...styles.sheets, width }}>
          {/* Çıkarılan sayfanın yaprağı aynı listede, en üstte kalkar: anahtarı değişmediği için
              yeniden kurulmaz, yazıları silinmiş olsa da kalkarken görünür */}
          {[
            ...sheets.map((order) => (
              <TurnSheet key={keyOf(edits, pageAt(order))} order={order} position={position} width={width} isCurrent={order === page && !ghost}>
                <Sheet
                  {...sheetProps}
                  index={pageAt(order)}
                  isCurrent={order === page}
                  onLockChange={order === page ? setLocked : undefined}
                  folio={written ? { number: order + 1, total: written.length } : undefined}
                  onReady={order === page ? markCurrentReady : undefined}
                />
              </TurnSheet>
            )),
            ghost && (
              <TurnSheet key={ghost.key} order={0} position={ghostTurn} width={width} isCurrent={false}>
                <Sheet {...sheetProps} index={ghost.index} isCurrent={false} />
              </TurnSheet>
            ),
          ]}
          {indexOpen && (
            <TurnSheet order={0} position={indexTurn} width={width} isCurrent>
              <PageIndex
                notebookId={notebookId}
                pages={pages}
                current={pageAt(page) + 1}
                onClose={() => closeIndex()}
                onOpenPage={openFromIndex}
              />
            </TurnSheet>
          )}
          {notice !== null && (
            <div style={styles.notice} role="status">
              <span style={styles.noticeText}>{notice}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Defterin bir sayfası. Sayfa eklenip çıkarılınca yaprak numarasıyla birlikte kayar; sayfa anahtarı
// numara değişince yenilenir, yazılar yeni yerinden okunur
function Sheet({ notebookId, index, ...rest }) {
  const page = useMemo(() => ({ notebookId, kind: 'page', ref: index + 1 }), [notebookId, index])
  return <NotebookPage page={page} {...rest} />
}

// Defterin bir yaprağı. Sol kenarı (sırtı) etrafında döner: serbest kenarın ekrandaki yeri
// cos(açı) ile gerilediği için açı, kenar parmağı izleyecek şekilde hesaplanır.
function TurnSheet({ order, position, width, isCurrent, children }) {
  const rootRef = useRef(null)
  const dimRef = useRef(null)
  const castRef = useRef(null)
  const shadeRef = useRef(null)

  useLayoutEffect(
    () =>
      position.subscribe((value) => {
        const d = value - order
        const angle = (Math.acos(1 - clamp01(d)) * 180) / Math.PI
        const root = rootRef.current
        if (!root) return
        // Çevrilmiş sayfalar ve iki kat alttakiler gizlenir; hemen alttaki çizili kalır
        const shown = d > -2 && d < 1
        root.style.opacity = shown ? '1' : '0'
        root.style.visibility = shown ? 'visible' : 'hidden'
        root.style.transform = `perspective(${width * DEPTH}px) rotateY(${-angle}deg)`
        // Kalkan yaprak ışıktan uzaklaştıkça kararır
        shadeRef.current.style.opacity = String(clamp01(d))
        // Üstteki yaprak kalkarken bu sayfaya düşen gölge, yaprağın serbest kenarını izler
        const lift = clamp01(d + 1)
        const cos = 1 - lift
        const sin = Math.sqrt(1 - cos * cos)
        const edgeX = (width * cos * DEPTH) / (DEPTH - sin)
        const turning = lift > 0 && lift < 1
        castRef.current.style.opacity = turning ? String(1 - lift) : '0'
        castRef.current.style.transform = `translateX(${edgeX}px)`
        dimRef.current.style.opacity = turning ? String(0.18 * (1 - lift)) : '0'
      }),
    [position, order, width],
  )

  return (
    <div ref={rootRef} style={{ ...styles.sheet, pointerEvents: isCurrent ? 'auto' : 'none' }} aria-hidden={!isCurrent}>
      {children}
      <div ref={dimRef} style={styles.dim} />
      <div ref={castRef} style={{ ...styles.cast, width: width * 0.3 }} />
      <div ref={shadeRef} style={styles.shade} />
    </div>
  )
}

const styles = {
  desk: {
    backgroundColor: '#2B2620',
  },
  flipDesk: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    touchAction: 'pan-y',
  },
  sheets: {
    position: 'relative',
    height: '100%',
    boxShadow: '0 0 40px rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    position: 'absolute',
    inset: 0,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
    willChange: 'transform',
  },
  dim: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#000',
    opacity: 0,
    pointerEvents: 'none',
  },
  cast: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
    pointerEvents: 'none',
    backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.32), rgba(0,0,0,0))',
  },
  shade: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    pointerEvents: 'none',
    backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.12), rgba(0,0,0,0.45))',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 40px',
    textAlign: 'center',
  },
  title: {
    ...fonts.handBold,
    fontSize: 34,
    color: colors.onInk,
  },
  notice: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 64,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 50,
  },
  noticeText: {
    padding: '8px 14px',
    borderRadius: 10,
    backgroundColor: 'rgba(36, 41, 47, 0.92)',
    color: '#FFFFFF',
    ...fonts.docBody,
    fontSize: 13,
    textAlign: 'center',
  },
}
