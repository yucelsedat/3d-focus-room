import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { Marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark-dimmed.css'
import DOMPurify from 'dompurify'
import { useStore } from '../store/useStore'
import { loadRoom } from '../utils/loadRoom'

// Canvas-only marked instance — does NOT affect the global marked used in MarkdownMesh
const canvasMarked = new Marked({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : null
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value
      const detectedLang = language || 'code'
      return `<div class="cvmd-code-block"><span class="cvmd-code-lang">${detectedLang}</span><pre><code class="hljs language-${detectedLang}">${highlighted}</code></pre></div>`
    }
  }
})

const parseMd = (content) => DOMPurify.sanitize(canvasMarked.parse(content))

// Inject markdown styles once
if (typeof document !== 'undefined' && !document.getElementById('cvmd-styles')) {
  const s = document.createElement('style')
  s.id = 'cvmd-styles'
  s.textContent = `
    .cvmd { line-height: 1.5; }
    .cvmd > *:first-child { margin-top: 0 !important; }
    .cvmd > *:last-child  { margin-bottom: 0 !important; }
    .cvmd h1 { font-size: 1.75em; font-weight: 800; margin: 0 0 0.3em; }
    .cvmd h2 { font-size: 1.4em;  font-weight: 700; margin: 0.6em 0 0.25em; }
    .cvmd h3 { font-size: 1.15em; font-weight: 600; margin: 0.5em 0 0.2em; }
    .cvmd p  { margin: 0 0 0.55em; }
    .cvmd ul, .cvmd ol { margin: 0 0 0.55em; padding-left: 1.5em; }
    .cvmd li { margin-bottom: 0.2em; }
    .cvmd code { background: rgba(255,255,255,0.1); padding: 0.1em 0.38em; border-radius: 4px; font-family: 'Fira Code', 'Cascadia Code', monospace; font-size: 0.85em; }
    .cvmd blockquote { border-left: 3px solid rgba(255,255,255,0.25); padding-left: 0.75em; margin: 0 0 0.55em 0; opacity: 0.8; }
    .cvmd a  { color: #60a5fa; text-decoration: underline; }
    .cvmd hr { border: none; border-top: 1px solid rgba(255,255,255,0.18); margin: 0.6em 0; }
    .cvmd strong { font-weight: 700; }
    .cvmd em     { font-style: italic; }
    .cvmd table  { border-collapse: collapse; margin-bottom: 0.55em; width: 100%; }
    .cvmd th, .cvmd td { border: 1px solid rgba(255,255,255,0.18); padding: 0.25em 0.55em; }
    .cvmd th { background: rgba(255,255,255,0.08); font-weight: 600; }

    /* code block wrapper */
    .cvmd-code-block { position: relative; margin: 0 0 0.6em; border-radius: 8px; overflow: hidden; background: #1c2128; }
    .cvmd-code-lang {
      display: inline-block; position: absolute; top: 0; right: 0;
      padding: 0.18em 0.7em; font-size: 0.72em; font-family: monospace;
      background: rgba(255,255,255,0.07); color: rgba(148,163,184,0.7);
      border-bottom-left-radius: 6px; letter-spacing: 0.05em; text-transform: lowercase;
      pointer-events: none;
    }
    .cvmd-code-block pre { margin: 0; padding: 0.9em 1em 0.8em; overflow-x: auto; background: transparent !important; border-radius: 0; }
    .cvmd-code-block pre code.hljs { padding: 0; font-size: 0.88em; font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, monospace; line-height: 1.55; background: transparent !important; }
    .cvmd pre code { font-family: 'Fira Code', 'Cascadia Code', monospace; }
  `
  document.head.appendChild(s)
}

// 8 bounding-box handle descriptors
const HANDLES = [
  { h: 'nw', style: { top: -10, left: -10 },                  cursor: 'nw-resize' },
  { h: 'n',  style: { top: -10, left: 'calc(50% - 10px)' },   cursor: 'n-resize'  },
  { h: 'ne', style: { top: -10, right: -10 },                  cursor: 'ne-resize' },
  { h: 'e',  style: { top: 'calc(50% - 10px)', right: -10 },   cursor: 'e-resize'  },
  { h: 'se', style: { bottom: -10, right: -10 },               cursor: 'se-resize' },
  { h: 's',  style: { bottom: -10, left: 'calc(50% - 10px)' }, cursor: 's-resize'  },
  { h: 'sw', style: { bottom: -10, left: -10 },                cursor: 'sw-resize' },
  { h: 'w',  style: { top: 'calc(50% - 10px)', left: -10 },    cursor: 'w-resize'  },
]

const MAX_IMG_W = 800
const getImageNaturalSize = (url) => new Promise((resolve) => {
  const img = new Image()
  // render'daki <img referrerPolicy="no-referrer"> ile aynı koşulda test et —
  // hotlink korumalı görseller Referer'sız isteklerde çoğunlukla açılır
  img.referrerPolicy = 'no-referrer'
  img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
  img.onerror = () => resolve(null)
  img.src = url
})

const stopEvt = (e) => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation() }

// ── Image item — yüklenemeyen görsel şeffaf blok yerine gri placeholder gösterir ──
// Modül seviyesinde: inline tanım her parent render'da yeni komponent tipi üretip
// remount'a (ve state kaybına) yol açar.
const ImageItem = ({ item }) => {
  const [ok, setOk] = useState(true)
  return ok ? (
    <img src={item.url} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setOk(false)}
      style={{ width: '100%', height: '100%', objectFit: 'fill', borderRadius: 4, display: 'block', pointerEvents: 'none' }} />
  ) : (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3a3f47', borderRadius: 4, pointerEvents: 'none' }}>
      <span style={{ fontSize: 64, opacity: 0.35 }}>🖼️</span>
    </div>
  )
}

// ── Generic link card (Open Graph görsel + başlık; görsel yoksa gri) ──────────
const LinkCard = ({ item, clickable = false }) => {
  const [imgOk, setImgOk] = useState(true)
  const hasImg = !!item.thumbUrl && imgOk
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden', background: '#3a3f47', cursor: clickable ? 'pointer' : 'inherit', boxSizing: 'border-box' }}
      {...(clickable ? { onMouseDown: stopEvt, onClick: (e) => { stopEvt(e); navigator.clipboard?.writeText(item.url).catch(() => {}) } } : {})}>
      {hasImg ? (
        <img src={item.thumbUrl} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setImgOk(false)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 64, opacity: 0.35 }}>🔗</span>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: hasImg ? 'linear-gradient(transparent, rgba(0,0,0,0.88))' : 'rgba(0,0,0,0.25)', padding: '28px 14px 12px', color: '#fff', pointerEvents: 'none' }}>
        {/* başlık yoksa URL'nin kendisi — kart asla "boş" görünmesin */}
        <div style={{ fontSize: 28, lineHeight: 1.35, fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
          {item.title || item.url}
        </div>
        {item.siteName && (
          <div style={{ fontSize: 20, marginTop: 6, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.siteName}</div>
        )}
      </div>
    </div>
  )
}

// Module-level clipboard — persists across canvas instances / re-renders
let canvasMeshClipboard = null
let _canvasClipboardTs   = 0
// When the user copies something outside the canvas, clear the internal clipboard
// so Ctrl+V uses the OS clipboard instead of stale canvas items.
// The 50ms guard prevents this from firing on our own Ctrl+C (where e.preventDefault
// blocks the copy event but a tiny race is possible in some browsers).
if (typeof document !== 'undefined') {
  document.addEventListener('copy', () => {
    if (Date.now() - _canvasClipboardTs > 50) canvasMeshClipboard = null
  }, true)
}

// bounding box of box-type items matching id set
function getBounds(ids, items) {
  const sel = items.filter(it => ids.has(it.id) && it.type !== 'arrow')
  if (!sel.length) return null
  const minX = Math.min(...sel.map(it => it.x))
  const minY = Math.min(...sel.map(it => it.y))
  const maxX = Math.max(...sel.map(it => it.x + it.w))
  const maxY = Math.max(...sel.map(it => it.y + it.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export default function CanvasMesh({ id, content, width, height }) {
  const updateMedia = useStore(s => s.updateMedia)
  const rooms       = useStore(s => s.rooms)
  const setRooms    = useStore(s => s.setRooms)

  const initial = (() => { try { return JSON.parse(content) } catch { return { items: [], bg: '#1a1a2e' } } })()

  const [items, setItems]                   = useState(initial.items || [])
  const [bg]                                = useState(initial.bg || '#1a1a2e')
  const [isEditMode, setIsEditMode]         = useState(false)
  const [isFullscreen, setIsFullscreen]     = useState(false)
  const isFullscreenRef                     = useRef(false)
  const [readerItemId, setReaderItemId]     = useState(null) // text item shown in fullscreen reader modal
  const [readerEditing, setReaderEditing]   = useState(false) // reader modal in edit (textarea) mode
  const readerItemIdRef                     = useRef(null)
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

  // text color picker
  const [showColorPicker, setShowColorPicker] = useState(null) // null | 'text' | 'bg'

  // ── refs ──────────────────────────────────────────────────────────────────
  const containerRef    = useRef(null)
  const saveTimerRef    = useRef(null)
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
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify({ items: ci, bg: cb, pan: panRef.current, zoom: zoomRef.current }) }),
      })
      if (r.ok) updateMedia(await r.json())
    } catch {}
  }, [id, updateMedia])

  const scheduleSave = useCallback((ni, nb) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(ni, nb), 600)
  }, [doSave])

  useEffect(() => { scheduleSaveRef.current = scheduleSave }, [scheduleSave])

  // ── Wheel: pan & zoom ────────────────────────────────────────────────────
  // mount'ta bir kez eklenir, isEditModeRef ile kontrol edilir
  // → containerRef null olsa bile event yakalanır
  useEffect(() => {
    const handler = (e) => {
      if (!isEditModeRef.current) return
      // reader modal open → let the wheel scroll the modal, don't pan/zoom the canvas
      if (readerItemIdRef.current) return
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
          _canvasClipboardTs = Date.now()
          canvasMeshClipboard = { sourceId: id, items: itemsRef.current.filter(it => selectedIdsRef.current.has(it.id)) }
          setPasteMsg('copy')
          setTimeout(() => setPasteMsg(''), 1000)
        }
        return
      }
      if (ctrl && e.key === 'x') {
        if (selectedIdsRef.current.size > 0) {
          e.preventDefault(); e.stopPropagation()
          // Kes = seçili item'ları panoya al + canvas'tan kaldır
          _canvasClipboardTs = Date.now()
          canvasMeshClipboard = { sourceId: id, items: itemsRef.current.filter(it => selectedIdsRef.current.has(it.id)) }
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
      if (ctrl && e.key === 'v' && canvasMeshClipboard?.items?.length) {
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
    const active = document.activeElement
    if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
    e.preventDefault(); e.stopPropagation()
    const clipItems = [...(e.clipboardData?.items || [])]

    const imgClip = clipItems.find(it => it.type.startsWith('image/'))
    if (imgClip) {
      const file = imgClip.getAsFile(); if (!file) return
      setPasteMsg('loading')
      const form = new FormData(); form.append('file', file)
      try {
        const r = await fetch(`/api/canvas/${id}/upload`, { method: 'POST', body: form })
        const d = await r.json()
        if (r.ok) {
          const pt   = centerSurface()
          const dims = await getImageNaturalSize(d.url)
          const iw   = dims ? Math.min(MAX_IMG_W, dims.w) : MAX_IMG_W
          const ih   = dims ? Math.round(iw * dims.h / dims.w) : Math.round(MAX_IMG_W * 9 / 16)
          const ni = { id: crypto.randomUUID(), type: 'image', x: pt.x, y: pt.y, w: iw, h: ih, url: d.url }
          setItems(prev => { const next = [...prev, ni]; scheduleSaveRef.current(next, bgRef.current); return next })
          setPasteMsg('ok')
        } else setPasteMsg('err')
      } catch { setPasteMsg('err') }
      setTimeout(() => setPasteMsg(''), 1800)
      return
    }

    const text = e.clipboardData?.getData('text/plain')?.trim()
    if (text) {
      // YouTube link
      const ytId = (() => { try { const u = new URL(text); if (u.hostname.includes('youtube.com')) return u.searchParams.get('v'); if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] } catch {} return null })()
      if (ytId) {
        setPasteMsg('loading')
        const pt  = centerSurface()
        let title = '', thumbUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
        try {
          const r = await fetch(`/api/youtube-meta?url=${encodeURIComponent(text)}`)
          if (r.ok) { const d = await r.json(); title = d.title || ''; if (d.thumbnail_url) thumbUrl = d.thumbnail_url }
        } catch {}
        const ni = { id: crypto.randomUUID(), type: 'youtube', x: pt.x, y: pt.y, w: 480, h: 270, url: text, videoId: ytId, thumbUrl, title }
        setItems(prev => { const next = [...prev, ni]; scheduleSaveRef.current(next, bgRef.current); return next })
        setPasteMsg('ok'); setTimeout(() => setPasteMsg(''), 1200)
        return
      }

      const parsedUrl = (() => { try { const u = new URL(text); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u : null } catch { return null } })()
      const isImgUrl = parsedUrl ? /\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?)$/i.test(parsedUrl.pathname) : false
      const pt = centerSurface()
      // Generic link — Open Graph görsel + başlıktan kart oluştur
      const addLinkCard = async () => {
        let title = '', thumbUrl = '', siteName = parsedUrl.hostname
        try {
          const r = await fetch(`/api/link-meta?url=${encodeURIComponent(text)}`)
          if (r.ok) { const d = await r.json(); title = d.title || ''; thumbUrl = d.image || ''; siteName = d.siteName || siteName }
        } catch {}
        const ni = { id: crypto.randomUUID(), type: 'link', x: pt.x, y: pt.y, w: 480, h: 300, url: text, thumbUrl, title, siteName }
        setItems(prev => { const next = [...prev, ni]; scheduleSaveRef.current(next, bgRef.current); return next })
      }
      if (isImgUrl) {
        setPasteMsg('loading')
        const dims = await getImageNaturalSize(text)
        if (dims) {
          const iw = Math.min(MAX_IMG_W, dims.w)
          const ih = Math.round(iw * dims.h / dims.w)
          const ni = { id: crypto.randomUUID(), type: 'image', x: pt.x, y: pt.y, w: iw, h: ih, url: text }
          setItems(prev => { const next = [...prev, ni]; scheduleSaveRef.current(next, bgRef.current); return next })
        } else {
          // Görsel yüklenemedi (hotlink koruması / ölü link) — şeffaf blok yerine link kartı
          await addLinkCard()
        }
      } else if (parsedUrl) {
        setPasteMsg('loading')
        await addLinkCard()
      } else {
        const ni = { id: crypto.randomUUID(), type: 'text', x: pt.x, y: pt.y, w: 500, h: 220, content: text || '', fontSize: 30 }
        setItems(prev => { const next = [...prev, ni]; scheduleSaveRef.current(next, bgRef.current); return next })
        setEditingItemId(ni.id)
      }
      setPasteMsg('ok'); setTimeout(() => setPasteMsg(''), 1200)
    }
  }

  pasteInternalRef.current = async () => {
    if (!canvasMeshClipboard?.items?.length) return
    const clip = canvasMeshClipboard
    let clipItems = clip.items

    if (clip.sourceId !== id) {
      const imgUrls = clipItems
        .filter(it => it.type === 'image' && it.url?.startsWith('/uploads/'))
        .map(it => it.url)
      if (imgUrls.length) {
        setPasteMsg('loading')
        try {
          const r = await fetch('/api/canvas/copy-images', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: imgUrls }),
          })
          const d = await r.json()
          if (r.ok && d.mapping) {
            clipItems = clipItems.map(it =>
              it.type === 'image' && d.mapping[it.url] ? { ...it, url: d.mapping[it.url] } : it
            )
          }
        } catch {}
      }
    }

    const origIds = new Set(clipItems.map(i => i.id))
    const box = getBounds(origIds, clipItems)
    const pt = centerSurface()
    const ox = box ? pt.x - box.x - box.w / 2 : 0
    const oy = box ? pt.y - box.y - box.h / 2 : 0

    const newItems = clipItems.map(it => ({
      ...it,
      id: crypto.randomUUID(),
      x: (it.x ?? 0) + ox,
      y: (it.y ?? 0) + oy,
      ...(it.type === 'arrow' ? { x1: it.x1 + ox, y1: it.y1 + oy, x2: it.x2 + ox, y2: it.y2 + oy } : {}),
    }))

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
    setIsEditMode(false); setIsFullscreen(false); setReaderItemId(null); setReaderEditing(false); setEditingItemId(null)
    setShowUrlInput(false); setUrlValue('')
    setShowRoomSearch(false); setRoomSearchText('')
    setIsPanning(false); setDragState(null); setResizeState(null)
    setDrawMode(null); setDrawingLine(null); setSelRect(null)
    setSelectedIds(new Set())
    setHoveredItemId(null); setHoveredArrowId(null)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stop = (e) => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation() }

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
      const { handle: rh, initBounds: ib, initItems } = resizeState
      const isCorner = rh.length === 2  // nw ne se sw
      let nx = ib.x, ny = ib.y, nw, nh, scale
      if (isCorner) {
        // uniform scale locked to aspect ratio, font scales too
        const rawW = rh.includes('e') ? ib.w + dx : ib.w - dx
        nw = Math.max(40, rawW)
        scale = nw / ib.w
        nh = ib.h * scale
        if (rh.includes('w')) nx = ib.x + ib.w - nw
        if (rh.includes('n')) ny = ib.y + ib.h - nh
      } else {
        // edge: resize only the relevant axis, no font change
        nw = ib.w; nh = ib.h
        if (rh.includes('e')) nw = Math.max(40, ib.w + dx)
        if (rh.includes('s')) nh = Math.max(20, ib.h + dy)
        if (rh.includes('w')) { nw = Math.max(40, ib.w - dx); nx = ib.x + ib.w - nw }
        if (rh.includes('n')) { nh = Math.max(20, ib.h - dy); ny = ib.y + ib.h - nh }
        // Lock aspect ratio for a single image item
        if (initItems.length === 1) {
          const selItem = itemsRef.current.find(it => it.id === initItems[0].id)
          if (selItem?.type === 'image') {
            const ratio = ib.w / ib.h
            if (rh === 'e' || rh === 'w') {
              nh = nw / ratio
            } else {
              nw = nh * ratio
              if (rh === 'n') ny = ib.y + ib.h - nh
            }
          }
        }
        scale = null
      }
      const sx = nw / ib.w, sy = nh / ib.h
      setItems(prev => prev.map(it => {
        const init = initItems.find(ii => ii.id === it.id)
        if (!init) return it
        const updated = { ...it, x: nx + (init.x - ib.x) * sx, y: ny + (init.y - ib.y) * sy, w: init.w * sx, h: init.h * sy }
        if (isCorner && it.type === 'text') updated.fontSize = Math.max(6, Math.round(init.fontSize * scale))
        return updated
      })); return
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

  const addImageFromUrl = async (e) => {
    stop(e); const url = urlValue.trim(); if (!url) return
    const pt   = centerSurface()
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

  const fetchImageBlob = async (url) => {
    const r = await fetch(url, { referrerPolicy: 'no-referrer' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.blob()
  }

  const downloadSelectedImage = async (e) => {
    stop(e)
    const item = getSelImage(); if (!item) return
    try {
      const blob = await fetchImageBlob(item.url)
      const ext  = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      let name = 'canvas-image'
      try { const p = new URL(item.url, location.href).pathname.split('/').pop(); if (p) name = decodeURIComponent(p) } catch {}
      if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += `.${ext}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      // CORS engelli harici görsel — fetch edilemiyorsa yeni sekmede aç
      window.open(item.url, '_blank', 'noopener')
    }
  }

  const copySelectedImage = async (e) => {
    stop(e)
    const item = getSelImage(); if (!item) return
    try {
      const blob = await fetchImageBlob(item.url)
      // Pano API'si çoğu tarayıcıda sadece image/png kabul eder — gerekirse çevir
      let png = blob
      if (blob.type !== 'image/png') {
        const bmp = await createImageBitmap(blob)
        const c = document.createElement('canvas')
        c.width = bmp.width; c.height = bmp.height
        c.getContext('2d').drawImage(bmp, 0, 0)
        bmp.close()
        png = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('PNG dönüşümü başarısız')), 'image/png'))
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      flashMsg('imgcopy')
    } catch { flashMsg('err') }
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
  const markerId = `arr-${id}`, markerIdPre = `arr-pre-${id}`
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

  // tek bir resim seçiliyken toolbar'da indir / resmi-kopyala ikonları görünür
  const selImageItem = selectedIds.size === 1
    ? (items.find(it => selectedIds.has(it.id) && it.type === 'image') || null)
    : null

  // text item currently shown in the fullscreen reader modal
  const readerItem = readerItemId ? items.find(it => it.id === readerItemId && it.type === 'text') : null

  // ── Arrow SVG layer ───────────────────────────────────────────────────────
  const ArrowLayer = ({ editMode }) => (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: 8000, height: 8000, overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#e2e8f0" />
        </marker>
        <marker id={markerIdPre} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="rgba(96,165,250,0.9)" />
        </marker>
      </defs>
      {items.filter(it => it.type === 'arrow').map(item => {
        const isSel = selectedIds.has(item.id)
        const isHov = editMode && (hoveredArrowId === item.id || isSel)
        return (
          <g key={item.id} style={{ pointerEvents: editMode ? 'auto' : 'none' }}
            onMouseEnter={() => editMode && setHoveredArrowId(item.id)}
            onMouseLeave={() => setHoveredArrowId(null)}
            onMouseDown={e => { if (editMode) onItemMouseDown(e, item) }}
          >
            <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth={28} style={{ cursor: 'move' }} />
            <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2}
              stroke={isHov ? '#60a5fa' : (item.color || '#e2e8f0')} strokeWidth={item.strokeWidth || 4}
              markerEnd={item.hasArrow ? `url(#${isHov ? markerIdPre : markerId})` : undefined} style={{ pointerEvents: 'none' }} />
            {isHov && (() => {
              const mx = (item.x1 + item.x2) / 2, my = (item.y1 + item.y2) / 2
              return (
                <>
                  <foreignObject x={mx - 22} y={my - 22} width={44} height={44} style={{ overflow: 'visible' }}>
                    <button onMouseDown={stop}
                      onClick={() => { const toD = item.id; setItems(prev => { const next = prev.filter(it => it.id !== toD); scheduleSave(next, bgRef.current); return next }) }}
                      style={{ width: 44, height: 44, background: '#ef4444', border: '2px solid #fff', borderRadius: '50%', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', pointerEvents: 'auto' }}>×</button>
                  </foreignObject>
                  
                  <foreignObject x={item.x1 - 12} y={item.y1 - 12} width={24} height={24} style={{ overflow: 'visible' }}>
                    <div onMouseDown={e => onArrowHandleMouseDown(e, item, 'start')} 
                         style={{ width: 24, height: 24, background: '#fff', border: '3px solid #60a5fa', borderRadius: '50%', cursor: 'pointer', pointerEvents: 'auto', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
                  </foreignObject>
                  
                  <foreignObject x={item.x2 - 12} y={item.y2 - 12} width={24} height={24} style={{ overflow: 'visible' }}>
                    <div onMouseDown={e => onArrowHandleMouseDown(e, item, 'end')} 
                         style={{ width: 24, height: 24, background: '#fff', border: '3px solid #60a5fa', borderRadius: '50%', cursor: 'pointer', pointerEvents: 'auto', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
                  </foreignObject>
                </>
              )
            })()}
          </g>
        )
      })}
      {drawingLine && (
        <line x1={drawingLine.x1} y1={drawingLine.y1} x2={drawingLine.x2} y2={drawingLine.y2}
          stroke="rgba(96,165,250,0.85)" strokeWidth={4} strokeDasharray="10 5"
          markerEnd={drawMode === 'arrow' ? `url(#${markerIdPre})` : undefined} style={{ pointerEvents: 'none' }} />
      )}
    </svg>
  )

  // ── Room chip visual ──────────────────────────────────────────────────────
  const RoomChip = ({ item }) => (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 8, cursor: 'inherit', boxSizing: 'border-box', pointerEvents: 'none' }}>
      <span style={{ fontSize: 30 }}>🏠</span>
      <span style={{ color: '#93c5fd', fontSize: 28, textDecoration: 'underline', textUnderlineOffset: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.roomName}</span>
    </div>
  )

  // ── Box item content ──────────────────────────────────────────────────────
  const YoutubeCard = ({ item, clickable = false }) => (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden', cursor: clickable ? 'pointer' : 'inherit' }}
      {...(clickable ? { onMouseDown: stop, onClick: (e) => { stop(e); navigator.clipboard?.writeText(item.url).catch(() => {}) } } : {})}>
      <img src={item.thumbUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <svg width="64" height="44" viewBox="0 0 68 48">
          <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/>
          <path d="M45 24L27 14v20" fill="#fff"/>
        </svg>
      </div>
      {item.title && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '28px 12px 10px', color: '#fff', fontSize: 28, lineHeight: 1.35, fontWeight: 600, pointerEvents: 'none' }}>
          {item.title}
        </div>
      )}
    </div>
  )

  const renderBoxContent = (item) => {
    if (item.type === 'room')    return <RoomChip item={item} />
    if (item.type === 'link')    return <LinkCard item={item} />
    if (item.type === 'youtube') return <YoutubeCard item={item} />
    if (item.type === 'image') return <ImageItem item={item} />
    if (item.type === 'text' && editingItemId === item.id) {
      const autoH = el => {
        if (!el) return
        el.style.height = 'auto'
        el.style.height = el.scrollHeight + 'px'
        if (item.h === 0 && el.scrollHeight > 0) setItems(prev => prev.map(it => it.id === item.id && it.h === 0 ? { ...it, h: el.scrollHeight } : it))
      }
      return (
        <textarea autoFocus defaultValue={item.content}
          ref={autoH}
          placeholder="Metin yazın…"
          style={{ width: '100%', height: 'auto', minHeight: 60, background: 'rgba(0,0,0,0.6)', border: '1px solid #60a5fa', borderRadius: 4, color: '#fff', fontSize: item.fontSize || 30, padding: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', overflow: 'hidden', display: 'block' }}
          onInput={e => {
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
            const newH = e.target.scrollHeight
            setItems(prev => prev.map(it => it.id === item.id ? { ...it, h: newH } : it))
          }}
          onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
          onBlur={e => {
            const val = e.target.value
            const newH = e.target.scrollHeight
            setItems(prev => { const next = prev.map(it => it.id === item.id ? { ...it, content: val, h: newH } : it); scheduleSave(next, bgRef.current); return next })
            setEditingItemId(null)
          }}
        />
      )
    }
    if (item.markdown && item.content) {
      return (
        <div className="cvmd" style={{ width: '100%', height: 'auto', minHeight: item.h || 60, background: item.bgColor !== undefined ? item.bgColor : 'rgba(0,0,0,0.38)', borderRadius: 4, color: item.color || '#e2e8f0', fontSize: item.fontSize || 30, padding: 14, overflow: 'visible', boxSizing: 'border-box', pointerEvents: 'none', wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: parseMd(item.content) }} />
      )
    }
    return <div style={{ width: '100%', height: 'auto', minHeight: item.h || 60, background: item.bgColor !== undefined ? item.bgColor : 'rgba(0,0,0,0.38)', borderRadius: 4, color: item.color || '#e2e8f0', fontSize: item.fontSize || 30, padding: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'visible', boxSizing: 'border-box', pointerEvents: 'none' }}>{item.content}</div>
  }

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
                ) : item.type === 'text' ? (
                  item.markdown && item.content
                    ? <div key={item.id} className="cvmd" style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: 'auto', minHeight: item.h || 60, background: item.bgColor !== undefined ? item.bgColor : 'transparent', borderRadius: 4, color: item.color || '#e2e8f0', fontSize: item.fontSize || 30, padding: 14, overflow: 'visible', boxSizing: 'border-box', pointerEvents: 'none', wordBreak: 'break-word' }}
                        dangerouslySetInnerHTML={{ __html: parseMd(item.content) }} />
                    : <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: 'auto', minHeight: item.h || 60, background: item.bgColor !== undefined ? item.bgColor : 'transparent', borderRadius: 4, color: item.color || '#e2e8f0', fontSize: item.fontSize || 30, padding: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'visible', boxSizing: 'border-box', pointerEvents: 'none' }}>{item.content}</div>
                ) : item.type === 'room' ? (
                  <div key={item.id} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, pointerEvents: 'auto', zIndex: 5 }}
                    onMouseDown={stop} onClick={(e) => { stop(e); navigateToRoom(item) }}>
                    <RoomChip item={item} />
                  </div>
                ) : null
              )}
              <ArrowLayer editMode={false} />
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
              : { width: pxW, height: pxH, backgroundColor: bg, position: 'relative', overflow: 'hidden', borderRadius: 4, pointerEvents: 'auto', cursor: drawMode ? 'crosshair' : isPanning ? 'grabbing' : dragState ? 'grabbing' : 'default', userSelect: 'none', boxShadow: '0 0 0 3px rgba(96,165,250,0.45)' }}
            onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={stop}
          >
            {/* ── Toolbar ───────────────────────────────────────────────── */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: tbH, background: 'rgba(5,5,15,0.92)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', zIndex: 20, boxSizing: 'border-box', borderBottom: '1px solid rgba(96,165,250,0.18)', overflowX: isFullscreen ? 'auto' : 'visible', overflowY: 'hidden',
              // fullscreen: buttons are rendered 1:1 so the row is physically large — zoom the
              // whole bar down (width/height compensated so the bar still fills the top edge).
              ...(isFullscreen ? { zoom: FS_TB_ZOOM, width: `${100 / FS_TB_ZOOM}%`, height: tbH / FS_TB_ZOOM } : {}) }}
              onMouseDown={stop}>

              <button onMouseDown={stop} onClick={addText} style={tbBtn}>✏️ Metin</button>
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

                  {/* image download & copy-as-image buttons — only when a single image is selected */}
                  {selImageItem && (
                    <>
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

              {pasteMsg && (
                <span style={{ fontSize: 22, flexShrink: 0, color: pasteMsg === 'loading' ? '#60a5fa' : (pasteMsg === 'ok' || pasteMsg === 'copy' || pasteMsg === 'cut' || pasteMsg === 'imgcopy') ? '#4ade80' : '#f87171' }}>
                  {pasteMsg === 'loading' ? '⟳ Yapıştırılıyor…' : pasteMsg === 'copy' ? '⧉ Kopyalandı' : pasteMsg === 'cut' ? '✂ Kesildi' : pasteMsg === 'imgcopy' ? '🖼 Resim panoya kopyalandı' : pasteMsg === 'ok' ? '✓ Yapıştırıldı' : '✕ Hata'}
                </span>
              )}

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
                    minHeight: item.type === 'text' ? (item.h || 60) : undefined,
                    cursor: drawMode ? 'crosshair' : editingItemId === item.id ? 'text' : 'move',
                    outline: isSel ? '2px solid rgba(96,165,250,0.9)' : isHov && !drawMode ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 4, boxSizing: 'border-box',
                  }}
                    onMouseDown={e => onItemMouseDown(e, item)}
                    onMouseEnter={() => !drawMode && setHoveredItemId(item.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    onDoubleClick={e => { stop(e); if (item.type === 'text' && !drawMode) setEditingItemId(item.id) }}
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

              <ArrowLayer editMode />

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

          {/* scrollable column — 50% viewport width, centered */}
          <div
            style={{
              width: '50%', minWidth: 320, maxHeight: '100vh', overflowY: 'auto',
              boxSizing: 'border-box', padding: '64px 8px 96px',
              color: readerItem.color || '#e2e8f0',
              fontSize: readerFs,
              lineHeight: 1.6, wordBreak: 'break-word',
            }}
          >
            {readerEditing ? (
              <textarea autoFocus defaultValue={readerItem.content}
                ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                placeholder="Metin yazın…"
                onMouseDown={(e) => e.stopPropagation()}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                  const val = e.target.value
                  setItems(prev => { const next = prev.map(it => it.id === readerItem.id ? { ...it, content: val } : it); scheduleSave(next, bgRef.current); return next })
                }}
                style={{
                  width: '100%', minHeight: '60vh', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 8,
                  color: readerItem.color || '#e2e8f0', fontSize: readerFs, lineHeight: 1.6,
                  padding: 18, resize: 'none', outline: 'none', overflow: 'hidden', display: 'block',
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
