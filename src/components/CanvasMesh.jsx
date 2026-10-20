import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import { loadRoom } from '../utils/loadRoom'
import { missingLinksMessage } from '../utils/richTextToMarkdown'
import { parseMd } from '../utils/markdownRender'
import { pasteRichTextAsMarkdown } from '../utils/richTextToMarkdown'
import { makeNote, todayIso, NOTE_DEFAULTS } from '../utils/timelineModel'
import {
  HANDLES, MAX_IMG_W, getImageNaturalSize, a4MaxH, getBounds, resizeItems, imageOrder,
  saveImageItem, copyImageToClipboard, isInstaUrl, buildInstaItem, disposePoolAudio,
  getCanvasClipboard, setCanvasClipboard, copyItemAssets, placeClipItems, buildPasteItems, pasteMsgView, urlsToViewerImages,
} from './canvas/canvasUtils'
import { ImageItem, LinkCard, InstaCard, MusicCard, PdfCard, YoutubeCard, RoomChip, NoteCard } from './canvas/cards'
import { ItemBody } from './canvas/ItemBody'
import { ImageViewer } from './canvas/ImageViewer'
import { ArrowLayer } from './canvas/ArrowLayer'
import { TextItemBox } from './canvas/TextItem'
import { NoteEditor } from './canvas/NoteEditor'

// Senkron canvas işareti: öğelerin üstünde kırmızı çerçeve + üye sayısı rozeti
const SYNC_RED = '#ef4444'
function SyncMark({ count }) {
  return (<>
    <div style={{ position: 'absolute', inset: 0, zIndex: 4, border: `8px solid ${SYNC_RED}`, borderRadius: 4, pointerEvents: 'none' }} />
    <div style={{ position: 'absolute', top: 18, right: 18, zIndex: 5, padding: '6px 16px', borderRadius: 999, background: SYNC_RED, color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: 2, fontFamily: '"JetBrains Mono", monospace', pointerEvents: 'none' }}>
      SYNC{count ? ` · ${count}` : ''}
    </div>
  </>)
}

export default function CanvasMesh({ id, content, width, height, syncGroupId, syncCount }) {
  const updateMedia = useStore(s => s.updateMedia)
  const rooms       = useStore(s => s.rooms)
  const setRooms    = useStore(s => s.setRooms)

  const initial = (() => { try { return JSON.parse(content) } catch { return { items: [], bg: '#1a1a2e' } } })()

  const [items, setItems]                   = useState(() =>
    (initial.items || []).map(it => it.type === 'text' && it.h ? { ...it, h: Math.min(it.h, a4MaxH(it.w)) } : it))
  const [bg, setBg]                         = useState(initial.bg || '#1a1a2e')
  const [isEditMode, setIsEditMode]         = useState(false)
  const [isFullscreen, setIsFullscreen]     = useState(false)
  const isFullscreenRef                     = useRef(false)
  const [readerItemId, setReaderItemId]     = useState(null) // text item shown in fullscreen reader modal
  const [readerEditing, setReaderEditing]   = useState(false) // reader modal in edit (textarea) mode
  const readerItemIdRef                     = useRef(null)
  const [viewerItemId, setViewerItemId]     = useState(null) // tam ekran resim görüntüleyicide açık resim
  const viewerItemIdRef                     = useRef(null)
  const [noteEditId, setNoteEditId]         = useState(null) // not balonu düzenleyicisinde açık not
  const [noteGallery, setNoteGallery]       = useState(null) // { images:[url], index } — not resimleri tam ekran
  // Not editörü / galerisi kendi klavye, wheel ve paste'ini yönetir → canvas dinleyicileri susar
  const noteOverlayRef                      = useRef(false)
  const closeViewerRef                      = useRef(null)
  const stepViewerRef                       = useRef(null)
  // window size — fullscreen'de tile oranını (contain) ekrana sığdırmak için gerekli
  const [winSize, setWinSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth  : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }))

  // viewport
  const [pan, setPan]                       = useState(initial.pan  || { x: 0, y: 0 })
  const [zoom, setZoom]                     = useState(initial.zoom || 1)
  const [isPanning, setIsPanning]           = useState(false)
  const [panStart, setPanStart]             = useState({ x: 0, y: 0 })

  // selection
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [selRect, setSelRect]               = useState(null) // {x1,y1,x2,y2} marquee

  // drag: { origins:[{id,x,y}], startPt:{x,y} }
  const [dragState, setDragState]           = useState(null)

  // resize: { handle, startX, startY, initBounds:{x,y,w,h}, initItems:[{id,x,y,w,h}] }
  const [resizeState, setResizeState]       = useState(null)

  const [editingItemId, setEditingItemId]   = useState(null)
  const [hoveredItemId, setHoveredItemId]   = useState(null)
  const [hoveredArrowId, setHoveredArrowId] = useState(null)

  // toolbar panels
  const [showUrlInput, setShowUrlInput]     = useState(false)
  const [urlValue, setUrlValue]             = useState('')
  const [showRoomSearch, setShowRoomSearch] = useState(false)
  const [roomSearchText, setRoomSearchText] = useState('')

  // draw mode
  const [drawMode, setDrawMode]             = useState(null)
  const [drawingLine, setDrawingLine]       = useState(null)

  // paste feedback
  const [pasteMsg, setPasteMsg]             = useState('')
  const [dlAll, setDlAll]                   = useState(null) // toplu resim indirme ilerlemesi: { done, total, failed }

  // text color picker
  const [showColorPicker, setShowColorPicker] = useState(null) // null | 'text' | 'bg'

  // ── refs ──────────────────────────────────────────────────────────────────
  const containerRef    = useRef(null)
  const saveTimerRef    = useRef(null)
  const lastSentContentRef = useRef(content) // kendi kaydımızın yankısını senkron güncellemeden ayırmak için
  const itemsRef        = useRef(items)
  const bgRef           = useRef(bg)
  const panRef          = useRef(pan)
  const zoomRef         = useRef(zoom)
  const selectedIdsRef  = useRef(selectedIds)
  const isEditModeRef   = useRef(false)
  const scheduleSaveRef = useRef(null)
  const pasteActionRef      = useRef(null)
  const pasteInternalRef    = useRef(null)
  const duplicateInternalRef = useRef(null)
  const ctrlRef             = useRef(false)
  const showColorPickerRef  = useRef(null)
  const pxHRef              = useRef(1080)  // aspect'e bağlı mantıksal yükseklik (wheel closure için)

  // Ctrl tuşu durumunu ayrıca takip et (bazı browser/OS'larda e.ctrlKey wheel'de güvenilmez)
  useEffect(() => {
    const onDown = (e) => { if (e.key === 'Control' || e.key === 'Meta') ctrlRef.current = true }
    const onUp   = (e) => { if (e.key === 'Control' || e.key === 'Meta') ctrlRef.current = false }
    const onBlur = () => { ctrlRef.current = false }
    document.addEventListener('keydown', onDown, true)
    document.addEventListener('keyup',   onUp,   true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onDown, true)
      document.removeEventListener('keyup',   onUp,   true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { bgRef.current = bg }, [bg])

  // Müzik ses havuzu temizliği: <audio> artık React ağacında olmadığından, silinen bir
  // müzik kartının sesi kendiliğinden durmaz. Bu canvas'ın daha önce sahip olup artık
  // kaldırdığı music id'lerini durdurup havuzdan sil (yalnızca kendi id'lerine dokunur →
  // aynı anda açık başka bir canvas'ın seslerini etkilemez). Canvas unmount olunca da
  // (oda değişimi vb.) o ana dek sahip olunan tüm sesler durur.
  const prevMusicIdsRef = useRef(new Set())
  useEffect(() => {
    const cur = new Set(items.filter(it => it.type === 'music').map(it => it.id))
    for (const oldId of prevMusicIdsRef.current) if (!cur.has(oldId)) disposePoolAudio(oldId)
    prevMusicIdsRef.current = cur
  }, [items])
  useEffect(() => () => { for (const id of prevMusicIdsRef.current) disposePoolAudio(id) }, [])

  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
  useEffect(() => { isEditModeRef.current = isEditMode }, [isEditMode])
  useEffect(() => { isFullscreenRef.current = isFullscreen }, [isFullscreen])
  // Fullscreen açıkken pencere yeniden boyutlanırsa contain ölçeğini güncelle
  useEffect(() => {
    if (!isFullscreen) return
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isFullscreen])
  useEffect(() => { readerItemIdRef.current = readerItemId }, [readerItemId])
  useEffect(() => { viewerItemIdRef.current = viewerItemId }, [viewerItemId])
  useEffect(() => { noteOverlayRef.current = !!(noteEditId || noteGallery) }, [noteEditId, noteGallery])
  useEffect(() => { showColorPickerRef.current = showColorPicker }, [showColorPicker])
  useEffect(() => {
    panRef.current = pan
    if (isEditMode) scheduleSaveRef.current?.(itemsRef.current, bgRef.current)
  }, [pan]) // eslint-disable-line
  useEffect(() => {
    zoomRef.current = zoom
    if (isEditMode) scheduleSaveRef.current?.(itemsRef.current, bgRef.current)
  }, [zoom]) // eslint-disable-line

  // ── Persistence ───────────────────────────────────────────────────────────
  const doSave = useCallback(async (ci, cb) => {
    const body = JSON.stringify({ items: ci, bg: cb, pan: panRef.current, zoom: zoomRef.current })
    lastSentContentRef.current = body
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: body }),
      })
      if (r.ok) {
        const { syncSiblings, ...media } = await r.json()
        updateMedia(media)
        // Senkron kardeşler: aynı odadakiler store'da güncellenir, diğer odalar yüklenince DB'den okur
        syncSiblings?.forEach(updateMedia)
      }
    } catch {}
  }, [id, updateMedia])

  const scheduleSave = useCallback((ni, nb) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; doSave(ni, nb) }, 600)
  }, [doSave])

  // Senkron kopyadan gelen içerik: edit modunda değilken items/bg'yi prop'tan yeniden oku.
  // Pan/zoom her kopyanın kendi görünümüdür, dokunulmaz. Kendi kaydımızın yankısı atlanır.
  useEffect(() => {
    if (isEditModeRef.current || content === lastSentContentRef.current) return
    lastSentContentRef.current = content
    let parsed
    try { parsed = JSON.parse(content) } catch { return }
    const next = (parsed.items || []).map(it => it.type === 'text' && it.h ? { ...it, h: Math.min(it.h, a4MaxH(it.w)) } : it)
    itemsRef.current = next
    setItems(next)
    if (parsed.bg) setBg(parsed.bg)
  }, [content])

  useEffect(() => { scheduleSaveRef.current = scheduleSave }, [scheduleSave])

  // ── Wheel: pan & zoom ────────────────────────────────────────────────────
  // mount'ta bir kez eklenir, isEditModeRef ile kontrol edilir
  // → containerRef null olsa bile event yakalanır
  useEffect(() => {
    const handler = (e) => {
      // A4 sınırına dayanmış bir metin kutusunun üzerindeysek: canvas'ı pan/zoom etme,
      // tarayıcının kutuyu kaydırmasına izin ver (kutu sona gelince pan'a devret)
      if (!(e.ctrlKey || e.metaKey || ctrlRef.current)) {
        const sc = e.target instanceof Element ? e.target.closest('[data-cv-scroll="1"]') : null
        if (sc && sc.scrollHeight > sc.clientHeight + 1) {
          const atEdge = e.deltaY < 0
            ? sc.scrollTop <= 0
            : sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1
          if (!atEdge) { e.stopPropagation(); return }
        }
      }
      if (!isEditModeRef.current) return
      // reader / resim görüntüleyici açık → wheel modalın; canvas'ı pan/zoom etme
      if (readerItemIdRef.current || viewerItemIdRef.current || noteOverlayRef.current) return
      const el = containerRef.current
      // canvas sınırları dışındaki wheel'leri yoksay
      if (el) {
        const { left, right, top, bottom } = el.getBoundingClientRect()
        if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) return
      }
      e.preventDefault()
      e.stopImmediatePropagation()
      const cp = panRef.current
      // Fullscreen'de ekran px → mantıksal pencere px için contain ölçeği (contain-fit)
      const fs = isFullscreenRef.current
      const _pxH = pxHRef.current
      const fsS = fs ? Math.max(0.01, Math.min(window.innerWidth / CANVAS_PX_W, (window.innerHeight - CANVAS_TB_H) / _pxH)) : 1
      const fsX = fs ? (window.innerWidth - CANVAS_PX_W * fsS) / 2 : 0
      const fsY = fs ? CANVAS_TB_H + (window.innerHeight - CANVAS_TB_H - _pxH * fsS) / 2 : 0
      if (e.ctrlKey || e.metaKey || ctrlRef.current) {
        const rect = el?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 }
        const cz   = zoomRef.current
        const nz   = Math.min(8, Math.max(0.15, cz * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        let mx, my
        if (fs) {
          mx = (e.clientX - rect.left - fsX) / fsS
          my = (e.clientY - rect.top  - fsY) / fsS
        } else {
          const scaleX = el ? (el.offsetWidth / (rect.width || 1)) : 1
          const scaleY = el ? (el.offsetHeight / (rect.height || 1)) : 1
          const offsetY = isEditMode ? tbH : 0
          mx = (e.clientX - rect.left) * scaleX
          my = (e.clientY - rect.top) * scaleY - offsetY
        }
        setZoom(nz)
        setPan({ x: mx - (mx - cp.x) * (nz / cz), y: my - (my - cp.y) * (nz / cz) })
      } else if (fs) {
        // Fullscreen pan: ekran deltasını contain ölçeğine böl (mantıksal px'e çevir)
        setPan({ x: cp.x - e.deltaX / fsS, y: cp.y - e.deltaY / fsS })
      } else {
        const scaleX = el ? (el.offsetWidth / (el.getBoundingClientRect().width || 1)) : 1
        const scaleY = el ? (el.offsetHeight / (el.getBoundingClientRect().height || 1)) : 1
        setPan({ x: cp.x - e.deltaX * scaleX, y: cp.y - e.deltaY * scaleY })
      }
    }
    document.addEventListener('wheel', handler, { passive: false, capture: true })
    return () => document.removeEventListener('wheel', handler, true)
  }, []) // eslint-disable-line

  // ── ESC / Delete / pointer-lock ───────────────────────────────────────────
  useEffect(() => {
    if (!isEditMode) return
    const onKey = e => {
      if (noteOverlayRef.current) return
      // Resim görüntüleyici açıkken tüm tuşları o yönetir (Delete vb. canvas kısayolları çalışmasın)
      if (viewerItemIdRef.current) {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey || e.altKey) return
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
        const act = k === 'Escape' ? () => closeViewerRef.current?.()
          : (k === 'a' || k === 'ArrowLeft')  ? () => stepViewerRef.current?.(-1)
          : (k === 'd' || k === 'ArrowRight') ? () => stepViewerRef.current?.(1)
          : k === 'Home' ? () => stepViewerRef.current?.('first')
          : k === 'End'  ? () => stepViewerRef.current?.('last')
          : null
        if (act) { e.preventDefault(); if (!e.repeat || k !== 'Escape') act() }
        return
      }
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (readerItemIdRef.current) { setReaderItemId(null); setReaderEditing(false); return } if (showColorPickerRef.current) { setShowColorPicker(null); return } if (isFullscreenRef.current) { setIsFullscreen(false); return } exitEdit(); return }
      const active = document.activeElement
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'a') {
        e.preventDefault(); e.stopPropagation()
        setSelectedIds(new Set(itemsRef.current.map(it => it.id)))
        return
      }
      if (ctrl && e.key === 'c') {
        if (selectedIdsRef.current.size > 0) {
          e.preventDefault(); e.stopPropagation()
          setCanvasClipboard(id, itemsRef.current.filter(it => selectedIdsRef.current.has(it.id)))
          setPasteMsg('copy')
          setTimeout(() => setPasteMsg(''), 1000)
        }
        return
      }
      if (ctrl && e.key === 'x') {
        if (selectedIdsRef.current.size > 0) {
          e.preventDefault(); e.stopPropagation()
          // Kes = seçili item'ları panoya al + canvas'tan kaldır
          setCanvasClipboard(id, itemsRef.current.filter(it => selectedIdsRef.current.has(it.id)))
          const toCut = new Set(selectedIdsRef.current)
          setItems(prev => {
            const next = prev.filter(it => !toCut.has(it.id))
            scheduleSaveRef.current(next, bgRef.current)
            return next
          })
          setSelectedIds(new Set())
          setPasteMsg('cut')
          setTimeout(() => setPasteMsg(''), 1000)
        }
        return
      }
      if (ctrl && e.key === 'v' && getCanvasClipboard()?.items?.length) {
        e.preventDefault(); e.stopPropagation()
        pasteInternalRef.current?.()
        return
      }
      if (ctrl && e.key === 'd') {
        e.preventDefault(); e.stopPropagation()
        duplicateInternalRef.current?.()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.size > 0) {
        e.stopPropagation(); e.preventDefault()
        const toDelete = [...selectedIdsRef.current]
        setItems(prev => {
          const next = prev.filter(it => !toDelete.includes(it.id))
          scheduleSaveRef.current(next, bgRef.current)
          return next
        })
        setSelectedIds(new Set())
      }
    }
    const onLock = () => { if (document.pointerLockElement) exitEdit() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerlockchange', onLock)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerlockchange', onLock)
    }
  }, [isEditMode]) // eslint-disable-line

  // ── Paste ─────────────────────────────────────────────────────────────────
  pasteActionRef.current = async (e) => {
    // Not editörü kendi paste'ini (galeriye resim) yönetir
    if (noteOverlayRef.current) return
    const active = document.activeElement
    if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
    e.preventDefault(); e.stopPropagation()
    applyPasteResult(await buildPasteItems(e.clipboardData, { uploadKey: id, center: centerSurface, onLoading: () => setPasteMsg('loading') }))
  }

  // Dosya / link / metin sürükle-bırak: paste ile aynı hat, öğeler bırakılan noktaya
  const onDragOverEdit = (e) => {
    if (noteOverlayRef.current) return
    const types = [...e.dataTransfer.types]
    if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  }
  const onDropEdit = async (e) => {
    if (noteOverlayRef.current) return
    e.preventDefault(); stop(e)
    const pt = toSurface(e.clientX, e.clientY)
    applyPasteResult(await buildPasteItems(e.dataTransfer, { uploadKey: id, center: () => pt, onLoading: () => setPasteMsg('loading') }))
  }

  function applyPasteResult(res) {
    if (!res) return
    if (res.items.length) setItems(prev => { const next = [...prev, ...res.items]; scheduleSaveRef.current(next, bgRef.current); return next })
    // toplu resim grup halinde taşınabilsin
    if (res.select) setSelectedIds(new Set(res.items.map(n => n.id)))
    if (res.editId) setEditingItemId(res.editId)
    setPasteMsg(res.msg); setTimeout(() => setPasteMsg(''), res.ms)
  }

  pasteInternalRef.current = async () => {
    const clip = getCanvasClipboard()
    if (!clip?.items?.length) return
    let clipItems = clip.items
    // Başka canvas'tan (veya timeline'dan) geliyorsa dosyaları çoğalt
    if (clip.sourceId !== id) {
      setPasteMsg('loading')
      try { clipItems = await copyItemAssets(clipItems) } catch {}
    }
    const newItems = placeClipItems(clipItems, centerSurface())
    setItems(prev => { const next = [...prev, ...newItems]; scheduleSaveRef.current(next, bgRef.current); return next })
    setSelectedIds(new Set(newItems.map(c => c.id)))
    setPasteMsg('ok'); setTimeout(() => setPasteMsg(''), 1200)
  }

  useEffect(() => {
    if (!isEditMode) return
    const h = (e) => pasteActionRef.current?.(e)
    document.addEventListener('paste', h, true)
    return () => document.removeEventListener('paste', h, true)
  }, [isEditMode])

  const exitEdit = () => {
    // Bekleyen kaydı hemen gönder: senkron kopyalar (başka oda dahil) eski içeriği görmesin
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current); saveTimerRef.current = null
      doSave(itemsRef.current, bgRef.current)
    }
    setIsEditMode(false); setIsFullscreen(false); setReaderItemId(null); setReaderEditing(false); setEditingItemId(null)
    setViewerItemId(null); setNoteEditId(null); setNoteGallery(null)
    setShowUrlInput(false); setUrlValue('')
    setShowRoomSearch(false); setRoomSearchText('')
    setIsPanning(false); setDragState(null); setResizeState(null)
    setDrawMode(null); setDrawingLine(null); setSelRect(null)
    setSelectedIds(new Set())
    setHoveredItemId(null); setHoveredArrowId(null)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stop = (e) => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation() }

  // ── Resim görüntüleyici ───────────────────────────────────────────────────
  const viewerImagesOf = (list) => list.filter(it => it.type === 'image' && it.url).sort(imageOrder)
  const openViewer = (itemId) => { setEditingItemId(null); setShowColorPicker(null); setViewerItemId(itemId) }
  const closeViewer = () => {
    // kapanınca en son bakılan resim seçili kalsın → indir / kopyala butonları ona uygulanır
    const last = viewerItemIdRef.current
    setViewerItemId(null)
    if (last && itemsRef.current.some(it => it.id === last)) setSelectedIds(new Set([last]))
  }
  const stepViewer = (dir) => setViewerItemId(cur => {
    const imgs = viewerImagesOf(itemsRef.current)
    if (!imgs.length) return null
    if (dir === 'first') return imgs[0].id
    if (dir === 'last')  return imgs[imgs.length - 1].id
    const i = Math.max(0, imgs.findIndex(it => it.id === cur))
    return imgs[(i + dir + imgs.length) % imgs.length].id   // uçlarda başa/sona sar
  })
  // keydown dinleyicisi mount'ta bağlanır → her render'ın güncel fonksiyonlarını ref'le ver
  useEffect(() => { closeViewerRef.current = closeViewer; stepViewerRef.current = stepViewer })

  const enterEdit = (e) => {
    stop(e)
    if (document.pointerLockElement) document.exitPointerLock()
    setIsEditMode(true)
  }

  const getInternalCoords = (clientX, clientY) => {
    const el = containerRef.current
    if (!el) return { ix: clientX, iy: clientY }
    const rect = el.getBoundingClientRect()
    // Fullscreen: ekran px → mantıksal pencere px (letterbox ofsetini çıkar, contain
    // ölçeğine böl). Böylece tık/sürükle koordinatları surface ile hizalı kalır.
    if (isFullscreen) {
      return {
        ix: (clientX - rect.left - fsOffX) / fsScale,
        iy: (clientY - rect.top  - fsOffY) / fsScale,
      }
    }
    const scaleX = rect.width ? el.offsetWidth / rect.width : 1
    const scaleY = rect.height ? el.offsetHeight / rect.height : 1
    const offsetY = isEditMode ? tbH : 0
    return {
      ix: (clientX - rect.left) * scaleX,
      iy: (clientY - rect.top) * scaleY - offsetY
    }
  }

  const toSurface = (clientX, clientY) => {
    const { ix, iy } = getInternalCoords(clientX, clientY)
    const z = zoomRef.current, p = panRef.current
    return { x: (ix - p.x) / z, y: (iy - p.y) / z }
  }

  const centerSurface = () => {
    const el = containerRef.current
    if (!el) return { x: 50, y: 50 }
    const z = zoomRef.current, p = panRef.current
    // Fullscreen'de görünür alan pxW×pxH mantıksal pencere → merkezi (pxW/2, pxH/2)
    if (isFullscreen) return { x: (pxW / 2 - p.x) / z, y: (pxH / 2 - p.y) / z }
    const offsetY = isEditMode ? tbH : 0
    const ix = el.offsetWidth / 2
    const iy = (el.offsetHeight - offsetY) / 2
    return { x: (ix - p.x) / z, y: (iy - p.y) / z }
  }

  // ── Background mousedown — pan OR marquee select ──────────────────────────
  const onBgMouseDown = (e) => {
    stop(e)
    if (drawMode) {
      const pt = toSurface(e.clientX, e.clientY)
      setDrawingLine({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y }); return
    }
    if (e.target !== e.currentTarget) return

    if (e.ctrlKey || e.metaKey) {
      // marquee selection start
      const pt = toSurface(e.clientX, e.clientY)
      setSelRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y }); return
    }

    // clear selection + close panels + pan
    setSelectedIds(new Set())
    if (showColorPicker) { setShowColorPicker(null); return }
    if (editingItemId)  { setEditingItemId(null); return }
    if (showUrlInput)   { setShowUrlInput(false); setUrlValue(''); return }
    if (showRoomSearch) { setShowRoomSearch(false); setRoomSearchText(''); return }
    setIsPanning(true)
    const { ix, iy } = getInternalCoords(e.clientX, e.clientY)
    setPanStart({ x: ix - pan.x, y: iy - pan.y })
  }

  // ── Unified mouse move ────────────────────────────────────────────────────
  const onMouseMove = (e) => {
    if (drawingLine) {
      const pt = toSurface(e.clientX, e.clientY)
      setDrawingLine(prev => ({ ...prev, x2: pt.x, y2: pt.y })); return
    }
    if (selRect) {
      const pt = toSurface(e.clientX, e.clientY)
      setSelRect(prev => ({ ...prev, x2: pt.x, y2: pt.y })); return
    }
    if (isPanning) {
      const { ix, iy } = getInternalCoords(e.clientX, e.clientY)
      setPan({ x: ix - panStart.x, y: iy - panStart.y }); return 
    }
    if (resizeState) {
      const { ix, iy } = getInternalCoords(e.clientX, e.clientY)
      const dx = (ix - resizeState.startX) / zoom
      const dy = (iy - resizeState.startY) / zoom
      if (resizeState.type === 'arrow') {
        setItems(prev => prev.map(it => {
          if (it.id !== resizeState.itemId) return it
          const init = resizeState.initItem
          if (resizeState.handle === 'start') return { ...it, x1: init.x1 + dx, y1: init.y1 + dy }
          return { ...it, x2: init.x2 + dx, y2: init.y2 + dy }
        }))
        return
      }
      setItems(prev => resizeItems(prev, resizeState, dx, dy)); return
    }
    if (dragState) {
      const pt = toSurface(e.clientX, e.clientY)
      const dx = pt.x - dragState.startPt.x, dy = pt.y - dragState.startPt.y
      setItems(prev => prev.map(it => {
        const origin = dragState.origins.find(o => o.id === it.id)
        if (!origin) return it
        if (it.type === 'arrow') return { ...it, x1: origin.x1 + dx, y1: origin.y1 + dy, x2: origin.x2 + dx, y2: origin.y2 + dy }
        return { ...it, x: origin.x + dx, y: origin.y + dy }
      }))
    }
  }

  const onMouseUp = () => {
    if (drawingLine) {
      const len = Math.hypot(drawingLine.x2 - drawingLine.x1, drawingLine.y2 - drawingLine.y1)
      if (len > 15) {
        const ni = { id: crypto.randomUUID(), type: 'arrow', x1: drawingLine.x1, y1: drawingLine.y1, x2: drawingLine.x2, y2: drawingLine.y2, color: '#e2e8f0', strokeWidth: 4, hasArrow: drawMode === 'arrow' }
        setItems(prev => { const next = [...prev, ni]; scheduleSave(next, bgRef.current); return next })
      }
      setDrawingLine(null); return
    }
    if (selRect) {
      const x1 = Math.min(selRect.x1, selRect.x2), y1 = Math.min(selRect.y1, selRect.y2)
      const x2 = Math.max(selRect.x1, selRect.x2), y2 = Math.max(selRect.y1, selRect.y2)
      if (x2 - x1 > 4 || y2 - y1 > 4) {
        const hit = items.filter(it => it.type !== 'arrow' && it.x < x2 && it.x + it.w > x1 && it.y < y2 && it.y + it.h > y1)
        setSelectedIds(new Set(hit.map(it => it.id)))
      }
      setSelRect(null); return
    }
    if (dragState || resizeState) scheduleSave(itemsRef.current, bgRef.current)
    setIsPanning(false); setDragState(null); setResizeState(null)
  }

  // ── Item mousedown — selection + drag start ───────────────────────────────
  const onItemMouseDown = (e, item) => {
    stop(e)
    if (drawMode) {
      const pt = toSurface(e.clientX, e.clientY)
      setDrawingLine({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y }); return
    }
    if (editingItemId === item.id) return

    // selection
    let newIds
    if (e.ctrlKey || e.metaKey) {
      newIds = new Set(selectedIds)
      if (newIds.has(item.id)) { newIds.delete(item.id); setSelectedIds(newIds); return }
      else newIds.add(item.id)
    } else {
      newIds = selectedIds.has(item.id) ? selectedIds : new Set([item.id])
    }
    setSelectedIds(newIds)

    // drag all selected items
    const dragIds = newIds
    const pt = toSurface(e.clientX, e.clientY)
    const origins = items.filter(it => dragIds.has(it.id)).map(it => (
      it.type === 'arrow' 
        ? { id: it.id, x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2 } 
        : { id: it.id, x: it.x, y: it.y }
    ))
    if (!e.ctrlKey && !e.metaKey) setDragState({ origins, startPt: pt })
  }

  const onArrowHandleMouseDown = (e, item, handleType) => {
    stop(e)
    const { ix, iy } = getInternalCoords(e.clientX, e.clientY)
    setResizeState({
      type: 'arrow',
      handle: handleType,
      itemId: item.id,
      startX: ix,
      startY: iy,
      initItem: { ...item }
    })
  }

  // ── Bounding-box resize handle mousedown ──────────────────────────────────
  const onBoundsHandleMouseDown = (e, handle) => {
    e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation()
    const bounds = getBounds(selectedIds, items)
    if (!bounds) return
    const { ix, iy } = getInternalCoords(e.clientX, e.clientY)
    setResizeState({
      handle, startX: ix, startY: iy,
      initBounds: bounds,
      initItems: items.filter(it => selectedIds.has(it.id) && it.type !== 'arrow').map(it => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h, fontSize: it.fontSize || 30 })),
    })
  }

  // ── Add items ─────────────────────────────────────────────────────────────
  // ── Text color / bg color ─────────────────────────────────────────────────
  const TEXT_COLORS = [
    '#ffffff', '#e2e8f0', '#94a3b8', '#475569',
    '#fbbf24', '#f97316', '#ef4444', '#f472b6',
    '#c084fc', '#818cf8', '#60a5fa', '#22d3ee',
    '#4ade80', '#a3e635', '#34d399', '#000000',
  ]
  const BG_COLORS = [
    'transparent',
    '#0f172a', '#1e293b', '#1e1b4b', '#14532d',
    '#450a0a', '#422006', '#1c1917', '#0f0f23',
    '#312e81', '#1d4ed8', '#0f766e', '#166534',
    '#fbbf24', '#ef4444', '#ffffff',
  ]

  const applyTextColor = (color) => {
    setItems(prev => {
      const next = prev.map(it => selectedIds.has(it.id) && it.type === 'text' ? { ...it, color } : it)
      scheduleSave(next, bgRef.current)
      return next
    })
    setShowColorPicker(null)
  }

  const applyBgColor = (bgColor) => {
    setItems(prev => {
      const next = prev.map(it => selectedIds.has(it.id) && it.type === 'text' ? { ...it, bgColor } : it)
      scheduleSave(next, bgRef.current)
      return next
    })
    setShowColorPicker(null)
  }

  const toggleMarkdown = () => {
    const allMd = selTextItems.every(it => it.markdown)
    setItems(prev => {
      const next = prev.map(it => selectedIds.has(it.id) && it.type === 'text' ? { ...it, markdown: !allMd } : it)
      scheduleSave(next, bgRef.current)
      return next
    })
  }

  const addText = (e) => {
    stop(e)
    const pt = centerSurface()
    const ni = { id: crypto.randomUUID(), type: 'text', x: pt.x, y: pt.y, w: 500, h: 0, content: '', fontSize: 30 }
    setItems(prev => { const next = [...prev, ni]; scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set([ni.id])); setEditingItemId(ni.id); setDrawMode(null)
  }

  // Not balonu: bugünün tarihiyle açılır (ölçek timeline ile ortak, bkz. NOTE_DEFAULTS)
  const addNote = (e) => {
    stop(e)
    const pt = centerSurface()
    const ni = makeNote({ id: crypto.randomUUID(), start: todayIso(), x: pt.x - NOTE_DEFAULTS.w / 2, y: pt.y - NOTE_DEFAULTS.h / 2 })
    setItems(prev => { const next = [...prev, ni]; scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set([ni.id])); setDrawMode(null); setShowUrlInput(false); setShowRoomSearch(false)
    setNoteEditId(ni.id)
  }

  const saveNote = (note) => {
    setItems(prev => { const next = prev.map(it => it.id === note.id ? note : it); scheduleSave(next, bgRef.current); return next })
    setNoteEditId(null)
  }

  const deleteNote = (noteId) => {
    setItems(prev => { const next = prev.filter(it => it.id !== noteId); scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set()); setNoteEditId(null)
  }

  const openNoteLink = (link) => {
    if (link.kind === 'room') navigateToRoom({ roomId: link.roomId, roomName: link.roomName })
    else window.open(link.url, '_blank', 'noopener')
  }

  const addImageFromUrl = async (e) => {
    stop(e); const url = urlValue.trim(); if (!url) return
    const pt   = centerSurface()
    // Instagram reel/gönderi linki → dikey mobil kart (resim değil)
    if (isInstaUrl(url)) {
      const ni = await buildInstaItem(url, pt)
      setItems(prev => { const next = [...prev, ni]; scheduleSave(next, bgRef.current); return next })
      setSelectedIds(new Set([ni.id])); setShowUrlInput(false); setUrlValue('')
      return
    }
    const dims = await getImageNaturalSize(url)
    const iw   = dims ? Math.min(MAX_IMG_W, dims.w) : MAX_IMG_W
    const ih   = dims ? Math.round(iw * dims.h / dims.w) : Math.round(MAX_IMG_W * 9 / 16)
    const ni = { id: crypto.randomUUID(), type: 'image', x: pt.x, y: pt.y, w: iw, h: ih, url }
    setItems(prev => { const next = [...prev, ni]; scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set([ni.id])); setShowUrlInput(false); setUrlValue('')
  }

  const addRoomItem = async (roomId, roomName) => {
    let finalId = roomId, finalName = roomName
    if (!finalId) {
      try {
        const r = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: roomName.trim(), roomType: 'room' }) })
        if (!r.ok) { const d = await r.json(); alert(d.error || 'Oda oluşturulamadı'); return }
        const created = await r.json(); finalId = created.id; finalName = created.name
        setRooms([...rooms, created])
      } catch (err) { alert('Oda oluşturulamadı: ' + err.message); return }
    }
    const pt = centerSurface()
    const ni = { id: crypto.randomUUID(), type: 'room', x: pt.x, y: pt.y, w: Math.max(260, finalName.length * 18 + 80), h: 72, roomId: finalId, roomName: finalName }
    setItems(prev => { const next = [...prev, ni]; scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set([ni.id])); setShowRoomSearch(false); setRoomSearchText('')
  }

  const navigateToRoom = (item) => {
    const found = rooms.find(r => r.id === item.roomId) || (item.roomId ? { id: item.roomId, name: item.roomName } : null)
    if (!found) { alert(`"${item.roomName}" odası bulunamadı.`); return }
    loadRoom(found.id, found.name).catch(() => alert('Oda yüklenemedi'))
  }

  const duplicateSelected = (e) => {
    if (e) stop(e)
    const offset = 30
    const copies = items
      .filter(it => selectedIds.has(it.id))
      .map(it => ({ ...it, id: crypto.randomUUID(), x: (it.x ?? it.x1) + offset, y: (it.y ?? it.y1) + offset,
        ...(it.type === 'arrow' ? { x1: it.x1 + offset, y1: it.y1 + offset, x2: it.x2 + offset, y2: it.y2 + offset } : {}) }))
    setItems(prev => { const next = [...prev, ...copies]; scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set(copies.map(c => c.id)))
  }

  duplicateInternalRef.current = () => duplicateSelected()

  const deleteSelected = (e) => {
    if (e) { stop(e) }
    const toDelete = [...selectedIds]
    setItems(prev => { const next = prev.filter(it => !toDelete.includes(it.id)); scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set())
  }

  // ── Seçili resmi indir / panoya gerçek görsel olarak kopyala ──────────────
  // Ctrl+C davranışına dokunmaz — o hâlâ canvas item'ı olarak kopyalar.
  const getSelImage = () => {
    if (selectedIdsRef.current.size !== 1) return null
    const it = itemsRef.current.find(i => selectedIdsRef.current.has(i.id))
    return it?.type === 'image' ? it : null
  }

  const flashMsg = (msg) => { setPasteMsg(msg); setTimeout(() => setPasteMsg(''), 1500) }

  const downloadSelectedImage = async (e) => {
    stop(e)
    const item = getSelImage(); if (!item) return
    try { await saveImageItem(item) } catch {
      // proxy de getiremediyse yeni sekmede aç
      window.open(item.url, '_blank', 'noopener')
    }
  }

  // Resimleri tek tek indirir (yukarıdan aşağı, soldan sağa sırayla).
  // Seçimde resim varsa (Ctrl+tık ile çoklu seçim) yalnızca seçili resimler, yoksa tümü.
  const downloadImages = async (e) => {
    stop(e)
    if (dlAll) return
    const all  = itemsRef.current.filter(it => it.type === 'image' && it.url)
    const sel  = all.filter(it => selectedIdsRef.current.has(it.id))
    const imgs = (sel.length ? sel : all).sort(imageOrder)
    if (!imgs.length) return
    let failed = 0
    setDlAll({ done: 0, total: imgs.length, failed: 0 })
    for (let i = 0; i < imgs.length; i++) {
      try { await saveImageItem(imgs[i]) } catch { failed++ }
      setDlAll({ done: i + 1, total: imgs.length, failed })
      // ardışık indirmeler arasında kısa boşluk — tarayıcı bazılarını yutmasın
      if (i < imgs.length - 1) await new Promise(r => setTimeout(r, 350))
    }
    setTimeout(() => setDlAll(null), failed ? 4000 : 2200)
  }

  const copySelectedImage = async (e) => {
    stop(e)
    const item = getSelImage(); if (!item) return
    try { await copyImageToClipboard(item.url); flashMsg('imgcopy') } catch { flashMsg('err') }
  }

  const zoomStep = (dir) => {
    const cz = zoomRef.current, nz = Math.min(8, Math.max(0.15, cz * (dir > 0 ? 1.25 : 0.8)))
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) { const mx = rect.width / 2, my = rect.height / 2, p = panRef.current; setPan({ x: mx - (mx - p.x) * (nz / cz), y: my - (my - p.y) * (nz / cz) }) }
    setZoom(nz)
  }

  // ── Dimensions ────────────────────────────────────────────────────────────
  const w     = parseFloat(width), h = parseFloat(height)
  const pxW   = CANVAS_PX_W, pxH = Math.round(CANVAS_PX_W * (h / w))
  const scale = w * 40 / pxW
  const tbH   = CANVAS_TB_H
  // wheel handler (mount-closure) aspect'e bağlı pxH'i ref üzerinden okur
  pxHRef.current = pxH
  const markerId = `arr-${id}`
  const surfTx = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`

  // ── Fullscreen contain-fit geometri ───────────────────────────────────────
  // Duvarda tile, pxW×pxH oranlı kutuda görünür. Fullscreen'de aynı mantıksal
  // pencereyi (pxW×pxH) toolbar altındaki ekran alanına "contain" ile sığdırıp
  // ortalıyoruz → sol üste sıkışma yerine oranın tamamı düzgün görünür.
  const fsScale  = isFullscreen
    ? Math.max(0.01, Math.min(winSize.w / pxW, (winSize.h - tbH) / pxH))
    : 1
  const fsDispW  = pxW * fsScale
  const fsDispH  = pxH * fsScale
  const fsOffX   = isFullscreen ? (winSize.w - fsDispW) / 2 : 0
  const fsOffY   = isFullscreen ? tbH + (winSize.h - tbH - fsDispH) / 2 : 0

  // In fullscreen the editor escapes the 3D <Html> transform and renders as a
  // fixed full-window overlay via a portal to <body>.
  const renderEdit = (el) => (isFullscreen ? createPortal(el, document.body) : el)

  // bounding box for current selection (box items only)
  const bounds       = getBounds(selectedIds, items)
  const hasBoxSel    = selectedIds.size > 0 && bounds !== null
  const BPAD         = 10   // padding around bounding box in canvas-px

  // text-specific selection helpers
  const selTextItems    = items.filter(it => selectedIds.has(it.id) && it.type === 'text')
  const hasTextSel      = selTextItems.length > 0
  const commonTextColor = selTextItems.length > 0 && selTextItems.every(it => it.color === selTextItems[0].color) ? (selTextItems[0].color || '#e2e8f0') : null
  const commonBgColor   = selTextItems.length > 0 && selTextItems.every(it => it.bgColor === selTextItems[0].bgColor) ? (selTextItems[0].bgColor ?? null) : null
  const markdownActive  = selTextItems.length > 0 && selTextItems.every(it => it.markdown)

  // canvas'ta resim varsa toolbar'da toplu indirme butonu görünür (seçili resim varsa onları indirir)
  const imageCount    = items.reduce((n, it) => n + (it.type === 'image' && it.url ? 1 : 0), 0)
  const selImageCount = items.reduce((n, it) => n + (it.type === 'image' && it.url && selectedIds.has(it.id) ? 1 : 0), 0)

  // tek bir resim seçiliyken toolbar'da indir / resmi-kopyala ikonları görünür
  const selImageItem = selectedIds.size === 1
    ? (items.find(it => selectedIds.has(it.id) && it.type === 'image') || null)
    : null

  const selNoteItem = selectedIds.size === 1
    ? (items.find(it => selectedIds.has(it.id) && it.type === 'note') || null)
    : null
  const noteEditItem = noteEditId ? items.find(it => it.id === noteEditId && it.type === 'note') : null

  // tam ekran resim görüntüleyici: okuma sırasındaki tüm resimler + açık olanın indeksi
  const viewerImages = viewerItemId ? viewerImagesOf(items) : []
  const viewerIndex  = viewerImages.findIndex(it => it.id === viewerItemId)

  // text item currently shown in the fullscreen reader modal
  const readerItem = readerItemId ? items.find(it => it.id === readerItemId && it.type === 'text') : null

  function deleteArrow(toD) {
    setItems(prev => { const next = prev.filter(it => it.id !== toD); scheduleSave(next, bgRef.current); return next })
  }

  // ── Arrow SVG layer ───────────────────────────────────────────────────────
  const arrowLayer = (editMode) => (
    <ArrowLayer items={items} selectedIds={selectedIds} hoveredArrowId={hoveredArrowId} editMode={editMode}
      markerId={`${markerId}-${editMode ? 'e' : 'r'}`} drawingLine={editMode ? drawingLine : null} drawMode={drawMode}
      onHover={setHoveredArrowId} onItemMouseDown={onItemMouseDown}
      onDelete={deleteArrow}
      onHandleMouseDown={onArrowHandleMouseDown} />
  )

  // ── Box item content (edit mode) ──────────────────────────────────────────
  const renderBoxContent = (item) => (
    <ItemBody item={item} editing={editingItemId === item.id}
      onOpenImages={(images, index) => setNoteGallery({ images, index })} onOpenLink={openNoteLink}
      onTextHeight={(newH, { initial }) => setItems(prev => prev.map(it => it.id === item.id && (!initial || it.h === 0) ? { ...it, h: newH } : it))}
      onTextMarkdown={() => setItems(prev => prev.map(it => it.id === item.id ? { ...it, markdown: true } : it))}
      onTextCommit={(val, newH) => {
        setItems(prev => { const next = prev.map(it => it.id === item.id ? { ...it, content: val, h: newH } : it); scheduleSave(next, bgRef.current); return next })
        setEditingItemId(null)
      }} />
  )

  // ── Room search ───────────────────────────────────────────────────────────
  const filteredRooms = rooms.filter(r => !roomSearchText || r.name.toLowerCase().includes(roomSearchText.toLowerCase()))
  const noMatch = roomSearchText.trim() && filteredRooms.length === 0

  return (
    <>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0.05} color="#ffffff" depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <Html key={`canvas-${w}-${h}`} transform position={[0, 0, 0.01]} scale={scale} style={{ pointerEvents: 'none' }}>

        {/* ══ RENDER MODE ══════════════════════════════════════════════════ */}
        {!isEditMode && (
          <div style={{ width: pxW, height: pxH, backgroundColor: bg, position: 'relative', overflow: 'hidden', borderRadius: 4, pointerEvents: 'auto', cursor: 'pointer', userSelect: 'none' }}
            onMouseDown={enterEdit} onClick={stop}
          >
            {syncGroupId && <SyncMark count={syncCount} />}
            <div style={{ position: 'absolute', top: 0, left: 0, width: 8000, height: 8000, transform: surfTx, transformOrigin: '0 0' }}>
              {items.filter(it => it.type !== 'arrow').map(item =>
                item.type === 'image' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'none' }}>
                    <ImageItem item={item} />
                  </div>
                ) : item.type === 'youtube' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'auto', zIndex: 5 }}>
                    <YoutubeCard item={item} clickable />
                  </div>
                ) : item.type === 'link' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'auto', zIndex: 5 }}>
                    <LinkCard item={item} clickable />
                  </div>
                ) : item.type === 'insta' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'auto', zIndex: 5 }}>
                    <InstaCard item={item} clickable />
                  </div>
                ) : item.type === 'music' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'auto', zIndex: 5 }}>
                    <MusicCard item={item} clickable />
                  </div>
                ) : item.type === 'pdf' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'auto', zIndex: 5 }}>
                    <PdfCard item={item} clickable />
                  </div>
                ) : item.type === 'note' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'none' }}>
                    <NoteCard item={item} />
                  </div>
                ) : item.type === 'text' ? (
                  <TextItemBox key={item.id} item={item} defaultBg="transparent"
                    style={{ position: 'absolute', left: item.x, top: item.y, width: item.w }} />
                ) : item.type === 'room' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'auto', zIndex: 5 }}
                    onMouseDown={stop} onClick={(e) => { stop(e); navigateToRoom(item) }}>
                    <RoomChip item={item} />
                  </div>
                ) : null
              )}
              {arrowLayer(false)}
            </div>
            {items.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.18)', fontSize: 38, gap: 12, pointerEvents: 'none' }}>
                <span>✎</span><span style={{ fontSize: 26 }}>tıkla ve düzenle</span>
              </div>
            )}
          </div>
        )}

        {/* ══ EDIT MODE ════════════════════════════════════════════════════ */}
        {isEditMode && renderEdit(
          <div ref={containerRef}
            style={isFullscreen
              ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh', backgroundColor: '#07070d', overflow: 'hidden', pointerEvents: 'auto', cursor: drawMode ? 'crosshair' : isPanning ? 'grabbing' : dragState ? 'grabbing' : 'default', userSelect: 'none', zIndex: 2147483600 }
              : { width: pxW, height: pxH, backgroundColor: bg, position: 'relative', overflow: 'hidden', borderRadius: 4, pointerEvents: 'auto', cursor: drawMode ? 'crosshair' : isPanning ? 'grabbing' : dragState ? 'grabbing' : 'default', userSelect: 'none', boxShadow: syncGroupId ? `0 0 0 4px ${SYNC_RED}` : '0 0 0 3px rgba(96,165,250,0.45)' }}
            onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={stop}
            onDragOver={onDragOverEdit} onDrop={onDropEdit}
          >
            {/* ── Toolbar ───────────────────────────────────────────────── */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: tbH, background: 'rgba(5,5,15,0.92)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', zIndex: 20, boxSizing: 'border-box', borderBottom: '1px solid rgba(96,165,250,0.18)', overflowX: isFullscreen ? 'auto' : 'visible', overflowY: 'hidden',
              // fullscreen: buttons are rendered 1:1 so the row is physically large — zoom the
              // whole bar down (width/height compensated so the bar still fills the top edge).
              ...(isFullscreen ? { zoom: FS_TB_ZOOM, width: `${100 / FS_TB_ZOOM}%`, height: tbH / FS_TB_ZOOM } : {}) }}
              onMouseDown={stop}>

              <button onMouseDown={stop} onClick={addText} style={tbBtn}>✏️ Metin</button>
              <button onMouseDown={stop} onClick={addNote} title="Resimli, tarihli zengin not balonu" style={tbBtn}>📝 Not</button>
              <button onMouseDown={stop} onClick={(e) => { stop(e); setShowUrlInput(v => !v); setUrlValue(''); setShowRoomSearch(false); setDrawMode(null) }} style={{ ...tbBtn, ...(showUrlInput ? act : {}) }}>🖼️ Resim</button>
              <button onMouseDown={stop} onClick={(e) => { stop(e); setShowRoomSearch(v => !v); setRoomSearchText(''); setShowUrlInput(false); setDrawMode(null) }} style={{ ...tbBtn, ...(showRoomSearch ? act : {}) }}>🏠 Oda</button>

              <div style={div} />

              <button onMouseDown={stop} onClick={(e) => { stop(e); setDrawMode(v => v === 'line' ? null : 'line'); setShowUrlInput(false); setShowRoomSearch(false) }} style={{ ...tbBtn, ...(drawMode === 'line' ? act : {}) }}>― Çizgi</button>
              <button onMouseDown={stop} onClick={(e) => { stop(e); setDrawMode(v => v === 'arrow' ? null : 'arrow'); setShowUrlInput(false); setShowRoomSearch(false) }} style={{ ...tbBtn, ...(drawMode === 'arrow' ? act : {}) }}>→ Ok</button>

              <div style={div} />

              <button onMouseDown={stop} onClick={(e) => { stop(e); zoomStep(-1) }} style={{ ...tbBtn, padding: '0 16px', fontSize: 30 }}>−</button>
              <span onMouseDown={stop} onClick={(e) => { stop(e); setZoom(1); setPan({ x: 0, y: 0 }) }}
                style={{ fontSize: 22, color: 'rgba(148,163,184,0.8)', minWidth: 54, textAlign: 'center', cursor: 'pointer', flexShrink: 0 }}>
                {Math.round(zoom * 100)}%
              </span>
              <button onMouseDown={stop} onClick={(e) => { stop(e); zoomStep(1) }} style={{ ...tbBtn, padding: '0 16px', fontSize: 30 }}>+</button>

              <div style={div} />

              <button onMouseDown={stop} onClick={(e) => { stop(e); setIsFullscreen(v => !v) }}
                title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
                style={{ ...tbBtn, padding: '0 16px', ...(isFullscreen ? act : {}) }}>
                {isFullscreen ? '🗗 Çık' : '⛶ Tam ekran'}
              </button>

              {(imageCount > 0 || dlAll) && (
                <>
                  <div style={div} />
                  <button onMouseDown={stop} onClick={downloadImages} disabled={!!dlAll}
                    title={selImageCount ? 'Seçili resimleri tek tek indir' : "Canvas'taki tüm resimleri tek tek indir"}
                    style={{ ...tbBtn, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, ...(dlAll ? { ...act, cursor: 'progress' } : {}) }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {dlAll && dlAll.done < dlAll.total ? `${dlAll.done}/${dlAll.total}` : selImageCount ? `Seçili resimler (${selImageCount})` : `Tüm resimler (${imageCount})`}
                  </button>
                  {dlAll && dlAll.done === dlAll.total && (
                    <span style={{ fontSize: 22, flexShrink: 0, color: dlAll.failed ? '#f87171' : '#4ade80' }}>
                      {dlAll.failed
                        ? `✕ ${dlAll.total - dlAll.failed}/${dlAll.total} indirildi · ${dlAll.failed} resim alınamadı`
                        : `✓ ${dlAll.total} resim indirildi`}
                    </span>
                  )}
                </>
              )}

              {/* selected items actions */}
              {hasBoxSel && !drawMode && !showUrlInput && !showRoomSearch && (
                <>
                  <div style={div} />
                  <span style={{ fontSize: 22, color: 'rgba(148,163,184,0.6)', flexShrink: 0 }}>{selectedIds.size} seçili</span>

                  {/* text color & bg color buttons — only when text items are selected */}
                  {hasTextSel && (
                    <>
                      {/* text color button */}
                      <button onMouseDown={stop} onClick={(e) => { stop(e); setShowColorPicker(v => v === 'text' ? null : 'text') }}
                        style={{ ...tbBtn, position: 'relative', padding: '0 14px', gap: 0, background: showColorPicker === 'text' ? 'rgba(96,165,250,0.18)' : tbBtn.background, borderColor: showColorPicker === 'text' ? 'rgba(96,165,250,0.5)' : tbBtn.borderColor }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: commonTextColor || '#e2e8f0', lineHeight: 1, display: 'block', paddingBottom: 5 }}>A</span>
                        <span style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 18, height: 3, borderRadius: 2, background: commonTextColor || '#e2e8f0' }} />
                      </button>
                      {/* bg color button */}
                      <button onMouseDown={stop} onClick={(e) => { stop(e); setShowColorPicker(v => v === 'bg' ? null : 'bg') }}
                        style={{ ...tbBtn, padding: '0 12px', gap: 6, background: showColorPicker === 'bg' ? 'rgba(96,165,250,0.18)' : tbBtn.background, borderColor: showColorPicker === 'bg' ? 'rgba(96,165,250,0.5)' : tbBtn.borderColor }}>
                        <span style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0, display: 'inline-block',
                          background: (commonBgColor && commonBgColor !== 'transparent') ? commonBgColor : 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 0 0 / 10px 10px',
                          border: '1.5px solid rgba(255,255,255,0.25)',
                          boxSizing: 'border-box',
                        }} />
                        <span style={{ fontSize: 20, color: 'rgba(148,163,184,0.7)' }}>↓</span>
                      </button>
                      {/* markdown toggle button */}
                      <button onMouseDown={stop} onClick={(e) => { stop(e); toggleMarkdown() }}
                        title={markdownActive ? 'Markdown kapat' : 'Markdown olarak göster'}
                        style={{ ...tbBtn, padding: '0 14px', gap: 0,
                          background: markdownActive ? 'rgba(96,165,250,0.18)' : tbBtn.background,
                          borderColor: markdownActive ? 'rgba(96,165,250,0.5)' : tbBtn.borderColor,
                          color: markdownActive ? '#93c5fd' : 'rgba(148,163,184,0.55)',
                        }}>
                        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', letterSpacing: -1 }}>M↓</span>
                      </button>
                      {/* fullscreen reader button — opens the text in a centered, scrollable modal */}
                      <button onMouseDown={stop} onClick={(e) => { stop(e); setReaderEditing(false); setReaderItemId(selTextItems[0].id) }}
                        title="Tam ekran oku"
                        style={{ ...tbBtn, padding: '0 16px' }}>
                        <span style={{ fontSize: 24 }}>⛶</span>
                      </button>
                    </>
                  )}

                  {selNoteItem && (
                    <button onMouseDown={stop} onClick={(e) => { stop(e); setNoteEditId(selNoteItem.id) }} title="Notu düzenle (çift tık)" style={tbBtn}>✎ Notu düzenle</button>
                  )}

                  {/* image download & copy-as-image buttons — only when a single image is selected */}
                  {selImageItem && (
                    <>
                      <button onMouseDown={stop} onClick={(e) => { stop(e); openViewer(selImageItem.id) }} title="Tam ekran görüntüle (çift tık)"
                        style={{ ...tbBtn, padding: '0 16px' }}>
                        <span style={{ fontSize: 24 }}>⛶</span>
                      </button>
                      <button onMouseDown={stop} onClick={downloadSelectedImage} title="Resmi indir"
                        style={{ ...tbBtn, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                      <button onMouseDown={stop} onClick={copySelectedImage} title="Resmi panoya kopyala (görsel olarak)"
                        style={{ ...tbBtn, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </>
                  )}

                  <button onMouseDown={stop} onClick={deleteSelected}
                    style={{ ...tbBtn, background: 'rgba(239,68,68,0.15)', color: '#f87171', borderColor: 'rgba(239,68,68,0.35)' }}>
                    🗑 Sil
                  </button>
                </>
              )}

              {showUrlInput && (
                <>
                  <input autoFocus type="text" value={urlValue} onChange={e => setUrlValue(e.target.value)}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addImageFromUrl(e); if (e.key === 'Escape') { setShowUrlInput(false); setUrlValue('') } }}
                    onMouseDown={stop} onClick={stop} placeholder="Resim URL'sini yapıştırın ve Enter…"
                    style={{ flex: 1, minWidth: 0, height: 54, padding: '0 20px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(96,165,250,0.5)', borderRadius: 8, color: '#fff', fontSize: 26, outline: 'none', boxSizing: 'border-box' }} />
                  <button onMouseDown={stop} onClick={addImageFromUrl} style={{ ...tbBtn, background: 'rgba(96,165,250,0.18)', color: '#93c5fd', borderColor: 'rgba(96,165,250,0.4)' }}>Ekle ↵</button>
                  <button onMouseDown={stop} onClick={(e) => { stop(e); setShowUrlInput(false); setUrlValue('') }} style={{ ...tbBtn, background: 'rgba(239,68,68,0.15)', color: '#f87171', borderColor: 'rgba(239,68,68,0.35)', padding: '0 18px' }}>✕</button>
                </>
              )}

              {drawMode && !showUrlInput && !showRoomSearch && (
                <span style={{ fontSize: 22, color: 'rgba(96,165,250,0.7)', marginLeft: 4 }}>
                  {drawMode === 'arrow' ? 'Ok için sürükle' : 'Çizgi için sürükle'}
                </span>
              )}

              {pasteMsg && (() => {
                const pm = pasteMsgView(pasteMsg, missingLinksMessage)
                return (
                  <span title={pasteMsg.startsWith('md-nolink:') ? 'ChatGPT gibi uygulamalarda metni seçmek yerine mesajın kopyala butonunu kullanınca linkler adresleriyle gelir' : undefined}
                    style={{ fontSize: 22, flexShrink: 0, color: pm.color }}>
                    {pm.text}
                  </span>
                )
              })()}

              <span style={{ marginLeft: 'auto', fontSize: 20, color: 'rgba(148,163,184,0.3)', flexShrink: 0 }}>
                {hasBoxSel ? 'Ctrl+C: kopyala · Ctrl+X: kes · Ctrl+D: çoğalt · Del: sil' : 'Ctrl+sürükle: seç · Ctrl+A: tümünü seç'} · ESC
              </span>
            </div>

            {/* ── Room search dropdown ───────────────────────────────────── */}
            {showRoomSearch && (
              <div style={{ position: 'absolute', top: tbH, left: 20, width: 720, background: 'rgba(8,8,20,0.97)', border: '1px solid rgba(96,165,250,0.3)', borderTop: 'none', borderRadius: '0 0 12px 12px', zIndex: 30, overflow: 'hidden' }}
                onMouseDown={stop}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <input autoFocus type="text" value={roomSearchText} onChange={e => setRoomSearchText(e.target.value)}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { setShowRoomSearch(false); setRoomSearchText('') } }}
                    onMouseDown={stop} onClick={stop} placeholder="Oda ara…"
                    style={{ width: '100%', height: 56, padding: '0 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 8, color: '#fff', fontSize: 26, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {filteredRooms.map(room => (
                    <div key={room.id} onClick={() => addRoomItem(room.id, room.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 26 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.12)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span>🏠</span><span>{room.name}</span>
                    </div>
                  ))}
                  {noMatch && (
                    <div onClick={() => addRoomItem(null, roomSearchText.trim())}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer', color: '#94a3b8', fontSize: 26 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(148,163,184,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span>🏠</span>
                      <span style={{ textDecoration: 'underline', color: '#cbd5e1' }}>{roomSearchText.trim()}</span>
                      <span style={{ fontSize: 22, color: '#64748b' }}>— oluştur ve ekle</span>
                    </div>
                  )}
                  {!roomSearchText && rooms.length === 0 && (
                    <div style={{ padding: '20px', color: '#64748b', fontSize: 24, textAlign: 'center' }}>Henüz oda yok</div>
                  )}
                </div>
              </div>
            )}

            {/* ── Color picker panel ────────────────────────────────────── */}
            {showColorPicker && hasTextSel && !drawMode && (
              <div onMouseDown={stop}
                style={{ position: 'absolute', top: tbH + 10, left: 20, zIndex: 35, background: 'rgba(8,8,22,0.97)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 14, padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', minWidth: 280 }}>
                {/* header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 20, color: 'rgba(148,163,184,0.7)', fontWeight: 600, letterSpacing: 1 }}>
                    {showColorPicker === 'text' ? 'YAZI RENGİ' : 'ARKA PLAN'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onMouseDown={stop} onClick={() => setShowColorPicker('text')}
                      style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${showColorPicker === 'text' ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.1)'}`, background: showColorPicker === 'text' ? 'rgba(96,165,250,0.18)' : 'transparent', color: showColorPicker === 'text' ? '#93c5fd' : 'rgba(148,163,184,0.5)', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>A</button>
                    <button onMouseDown={stop} onClick={() => setShowColorPicker('bg')}
                      style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${showColorPicker === 'bg' ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.1)'}`, background: showColorPicker === 'bg' ? 'rgba(96,165,250,0.18)' : 'transparent', color: showColorPicker === 'bg' ? '#93c5fd' : 'rgba(148,163,184,0.5)', fontSize: 20, cursor: 'pointer' }}>▭</button>
                  </div>
                </div>
                {/* color grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
                  {(showColorPicker === 'text' ? TEXT_COLORS : BG_COLORS).map((color, i) => {
                    const isActive = showColorPicker === 'text' ? color === commonTextColor : color === commonBgColor
                    const isTransparent = color === 'transparent'
                    return (
                      <div key={i} onMouseDown={stop}
                        onClick={() => showColorPicker === 'text' ? applyTextColor(color) : applyBgColor(color)}
                        title={color}
                        style={{
                          width: 28, height: 28, borderRadius: 5, cursor: 'pointer', position: 'relative', boxSizing: 'border-box',
                          background: isTransparent ? 'repeating-conic-gradient(#555 0% 25%, #2a2a2a 0% 50%) 0 0 / 10px 10px' : color,
                          border: isActive ? '2px solid #60a5fa' : '1.5px solid rgba(255,255,255,0.12)',
                          outline: isActive ? '1px solid rgba(96,165,250,0.4)' : 'none',
                          outlineOffset: 2,
                          transform: isActive ? 'scale(1.18)' : 'scale(1)',
                          transition: 'transform 0.1s',
                          boxShadow: isActive ? '0 0 0 2px rgba(96,165,250,0.3)' : 'none',
                        }}
                      >
                        {isTransparent && (
                          <svg viewBox="0 0 28 28" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                            <line x1="2" y1="26" x2="26" y2="2" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* tip */}
                <div style={{ marginTop: 10, fontSize: 18, color: 'rgba(100,116,139,0.6)', textAlign: 'center' }}>
                  {showColorPicker === 'text' ? 'Yazı rengini seç' : 'Arka plan rengini seç · şeffaf için ⊘'}
                </div>
              </div>
            )}

            {/* ── Zoomable surface (fullscreen'de contain çerçeve içinde clip'lenir) ── */}
            {(() => {
            const surface = (
            <div style={{ position: 'absolute', top: isFullscreen ? 0 : tbH, left: 0, width: 8000, height: 8000, transform: isFullscreen ? `scale(${fsScale}) translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : surfTx, transformOrigin: '0 0' }}
              onMouseDown={onBgMouseDown}>

              {/* box items */}
              {items.filter(it => it.type !== 'arrow').map(item => {
                const isSel  = selectedIds.has(item.id)
                const isHov  = hoveredItemId === item.id
                return (
                  <div key={item.id} style={{
                    position: 'absolute', left: item.x, top: item.y, width: item.w,
                    height: item.type === 'text' ? 'auto' : item.h,
                    minHeight: item.type === 'text' ? Math.min(item.h || 60, a4MaxH(item.w)) : undefined,
                    maxHeight: item.type === 'text' ? a4MaxH(item.w) : undefined,
                    cursor: drawMode ? 'crosshair' : editingItemId === item.id ? 'text' : 'move',
                    outline: isSel ? '2px solid rgba(96,165,250,0.9)' : isHov && !drawMode ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 4, boxSizing: 'border-box',
                  }}
                    onMouseDown={e => onItemMouseDown(e, item)}
                    onMouseEnter={() => !drawMode && setHoveredItemId(item.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    onDoubleClick={e => { stop(e); if (drawMode) return; if (item.type === 'text') setEditingItemId(item.id); else if (item.type === 'note') setNoteEditId(item.id); else if (item.type === 'image' && item.url) openViewer(item.id) }}
                  >
                    {renderBoxContent(item)}
                  </div>
                )
              })}

              {/* combined selection bounding box + handles */}
              {hasBoxSel && !drawMode && bounds && (
                <div style={{
                  position: 'absolute',
                  left: bounds.x - BPAD, top: bounds.y - BPAD,
                  width: bounds.w + BPAD * 2, height: bounds.h + BPAD * 2,
                  border: '2px dashed rgba(96,165,250,0.7)',
                  borderRadius: 4,
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  zIndex: 8,
                }}>
                  {HANDLES.map(({ h: hk, style: hs, cursor }) => (
                    <div key={hk} onMouseDown={e => onBoundsHandleMouseDown(e, hk)}
                      style={{
                        position: 'absolute', width: 20, height: 20,
                        background: '#fff', border: '2px solid #3b82f6',
                        borderRadius: 3, cursor, zIndex: 9, boxSizing: 'border-box',
                        pointerEvents: 'auto', ...hs,
                      }} />
                  ))}
                </div>
              )}

              {/* marquee selection rectangle */}
              {selRect && (
                <div style={{
                  position: 'absolute',
                  left: Math.min(selRect.x1, selRect.x2), top: Math.min(selRect.y1, selRect.y2),
                  width: Math.abs(selRect.x2 - selRect.x1), height: Math.abs(selRect.y2 - selRect.y1),
                  border: '1px dashed rgba(96,165,250,0.8)',
                  background: 'rgba(96,165,250,0.07)',
                  pointerEvents: 'none', zIndex: 9,
                }} />
              )}

              {arrowLayer(true)}

              {items.length === 0 && !drawingLine && (
                <div style={{ position: 'absolute', top: 180, left: 0, right: 0, color: 'rgba(255,255,255,0.12)', fontSize: 38, textAlign: 'center', pointerEvents: 'none' }}>
                  Metin, resim, oda, çizgi veya ok ekleyin<br />
                  <span style={{ fontSize: 26 }}>Kaydır · scroll ile zoom · Ctrl+sürükle: çoklu seç</span>
                </div>
              )}
            </div>
            )
            // Fullscreen: mantıksal pencereyi (pxW×pxH) ekrana contain ile sığdırıp
            // ortala; surface bu çerçeveye clip'lenir → oranın tamamı düzgün görünür.
            return isFullscreen ? (
              <div style={{ position: 'absolute', left: fsOffX, top: fsOffY, width: fsDispW, height: fsDispH, overflow: 'hidden', backgroundColor: bg, borderRadius: 4, boxShadow: '0 0 0 1px rgba(96,165,250,0.35), 0 12px 48px rgba(0,0,0,0.55)' }}>
                {surface}
              </div>
            ) : surface
            })()}
          </div>
        )}

        {/* ══ FULLSCREEN TEXT READER MODAL ══════════════════════════════════ */}
        {/* Rendered inside <Html> so createPortal runs in the react-dom (not R3F)
            reconciler — otherwise <button>/<div> are treated as THREE objects. */}
        {viewerIndex >= 0 && createPortal(
          <ImageViewer images={viewerImages} index={viewerIndex}
            onStep={stepViewer} onJump={(i) => setViewerItemId(viewerImages[i].id)}
            onClose={closeViewer} onDownload={(it) => saveImageItem(it).catch(() => window.open(it.url, '_blank', 'noopener'))} />,
          document.body
        )}
        {noteEditItem && (
          <NoteEditor key={noteEditItem.id} note={noteEditItem} uploadKey={id}
            onSave={saveNote} onDelete={() => deleteNote(noteEditItem.id)} onClose={() => setNoteEditId(null)} />
        )}
        {noteGallery && createPortal(
          <ImageViewer ownKeys images={urlsToViewerImages(noteGallery.images)} index={noteGallery.index}
            onStep={(d) => setNoteGallery(g => {
              const n = g.images.length
              return { ...g, index: d === 'first' ? 0 : d === 'last' ? n - 1 : (g.index + d + n) % n }
            })}
            onJump={(i) => setNoteGallery(g => ({ ...g, index: i }))} onClose={() => setNoteGallery(null)}
            onDownload={(it) => saveImageItem(it).catch(() => window.open(it.url, '_blank', 'noopener'))} />,
          document.body
        )}
        {readerItem && createPortal((() => {
          const readerFs = Math.max(16, Math.round((readerItem.fontSize || 30) * 0.62))
          const closeReader = () => { setReaderItemId(null); setReaderEditing(false) }
          return (
        <div
          onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) closeReader() }}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', inset: 0, zIndex: 2147483646,
            background: 'rgba(8,8,18,0.82)',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            pointerEvents: 'auto',
          }}
        >
          {/* edit / preview toggle */}
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setReaderEditing(v => !v) }}
            title={readerEditing ? 'Önizle' : 'Düzenle'}
            style={{ position: 'fixed', top: 24, right: 96, height: 56, padding: '0 18px', borderRadius: 12, border: '1px solid rgba(96,165,250,0.4)', background: readerEditing ? 'rgba(96,165,250,0.22)' : 'rgba(20,20,32,0.7)', color: readerEditing ? '#93c5fd' : '#e2e8f0', fontSize: 22, cursor: 'pointer', lineHeight: 1, zIndex: 1 }}>
            {readerEditing ? '👁 Önizle' : '✎ Düzenle'}
          </button>

          {/* close button */}
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); closeReader() }}
            title="Kapat (ESC)"
            style={{ position: 'fixed', top: 24, right: 28, width: 56, height: 56, borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(20,20,32,0.7)', color: '#e2e8f0', fontSize: 30, cursor: 'pointer', lineHeight: 1, zIndex: 1 }}>
            ✕
          </button>

          {/* scrollable column — 50% viewport width, centered.
              Düzenleme modunda scroll'u textarea'nın kendisi yapar (aşağıdaki sabit
              yükseklik); dıştaki kolon scroll'u kapalı olmalı, yoksa iki ayrı
              scrollport çakışıyor. */}
          <div
            style={{
              width: '50%', minWidth: 320, height: '100vh', maxHeight: '100vh',
              overflowY: readerEditing ? 'hidden' : 'auto',
              boxSizing: 'border-box', padding: '64px 8px 96px',
              color: readerItem.color || '#e2e8f0',
              fontSize: readerFs,
              lineHeight: 1.6, wordBreak: 'break-word',
            }}
          >
            {readerEditing ? (
              // Sabit yükseklik + kendi scroll'u: her tuş vuruşunda height'ı yeniden
              // ölçüp ayarlamak (height:auto → scrollHeight) dıştaki kolonun
              // scrollTop'unu sıfırlıyor ve imleç birinci satıra atlıyordu.
              <textarea autoFocus defaultValue={readerItem.content}
                placeholder="Metin yazın…"
                onMouseDown={(e) => e.stopPropagation()}
                onPaste={(e) => {
                  if (pasteRichTextAsMarkdown(e) && !readerItem.markdown) {
                    setItems(prev => { const next = prev.map(it => it.id === readerItem.id ? { ...it, markdown: true } : it); scheduleSave(next, bgRef.current); return next })
                  }
                }}
                onInput={(e) => {
                  const val = e.target.value
                  setItems(prev => { const next = prev.map(it => it.id === readerItem.id ? { ...it, content: val } : it); scheduleSave(next, bgRef.current); return next })
                }}
                style={{
                  width: '100%', height: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 8,
                  color: readerItem.color || '#e2e8f0', fontSize: readerFs, lineHeight: 1.6,
                  padding: 18, resize: 'none', outline: 'none', overflowY: 'auto', display: 'block',
                  fontFamily: 'inherit',
                }}
              />
            ) : readerItem.markdown && readerItem.content
              ? <div className="cvmd" dangerouslySetInnerHTML={{ __html: parseMd(readerItem.content) }} />
              : <div style={{ whiteSpace: 'pre-wrap' }}>{readerItem.content}</div>}
          </div>
        </div>
          )
        })(),
        document.body
      )}
      </Html>
    </>
  )
}

// Canvas mantıksal pencere genişliği ve toolbar yüksekliği (sabit) — mount-closure
// olan wheel handler'ın TDZ'siz erişebilmesi için modül seviyesinde.
const CANVAS_PX_W = 1920
const CANVAS_TB_H = 76

// fullscreen toolbar zoom factor — shrinks the 1:1-rendered button row so all buttons fit
const FS_TB_ZOOM = 0.6
const tbBtn = { height: 54, padding: '0 22px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#e2e8f0', fontSize: 26, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }
const act   = { background: 'rgba(96,165,250,0.22)', borderColor: 'rgba(96,165,250,0.55)', color: '#93c5fd' }
const div   = { width: 1, height: 36, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }
