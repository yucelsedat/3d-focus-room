import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore'

let canvasClipboard = null
const PASTE_STEP = 20

export default function CanvasEditor({ mediaId }) {
  const updateMedia       = useStore(s => s.updateMedia)
  const closeCanvasEditor = useStore(s => s.closeCanvasEditor)
  const worldMedia        = useStore(s => s.worldMedia)

  const media = worldMedia.find(m => m.id === mediaId)
  const initialData = (() => {
    try { return JSON.parse(media?.content) } catch { return { items: [], bg: '#1a1a2e' } }
  })()
  const id = mediaId

  const [items,         setItems]         = useState(initialData.items || [])
  const [bg,            setBg]            = useState(initialData.bg    || '#1a1a2e')
  const [dragState,     setDragState]     = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [hoveredItemId, setHoveredItemId] = useState(null)
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [clipboardSize, setClipboardSize] = useState(canvasClipboard?.items?.length ?? 0)

  // Pan/zoom — React state yerine ref: sıfır React re-render pan/zoom sırasında
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const isPanningRef = useRef(false)
  const panStartRef  = useRef({ x: 0, y: 0 })
  const rafRef       = useRef(null)

  // DOM refs
  const surfaceRef    = useRef(null)
  const containerRef  = useRef(null)
  const fileInputRef  = useRef(null)
  const zoomLabelRef  = useRef(null)

  // Stale closure'ları önlemek için
  const saveTimerRef       = useRef(null)
  const doSaveRef          = useRef(null)
  const closeEditorRef     = useRef(null)
  const itemsRef           = useRef(items)
  const bgRef              = useRef(bg)
  const selectedIdsRef     = useRef(selectedIds)
  const editingItemIdRef   = useRef(editingItemId)
  const actionRef          = useRef({})

  useEffect(() => { itemsRef.current = items },             [items])
  useEffect(() => { bgRef.current = bg },                   [bg])
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
  useEffect(() => { editingItemIdRef.current = editingItemId }, [editingItemId])

  // CSS transform'u doğrudan DOM'a yaz — React render'ı atla
  const applyTransform = useCallback(() => {
    rafRef.current = null
    if (!surfaceRef.current) return
    const { x, y, scale } = transformRef.current
    surfaceRef.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`
    }
  }, [])

  const scheduleTransform = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(applyTransform)
  }, [applyTransform])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // Wheel: scroll=pan, Ctrl+scroll/pinch=zoom (trackpad pinch de ctrlKey:true gönderir)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (e) => {
      e.preventDefault()
      const { x, y, scale } = transformRef.current

      if (e.ctrlKey) {
        // Zoom — imleç altındaki dünya noktasını sabit tut
        const rect = container.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const delta = e.deltaY * (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 400 : 1)
        const factor = Math.exp(-delta * 0.001)
        const newScale = Math.min(Math.max(scale * factor, 0.05), 8)
        const wx = (mx - x) / scale
        const wy = (my - y) / scale
        transformRef.current = { x: mx - wx * newScale, y: my - wy * newScale, scale: newScale }
      } else {
        // Pan — delta normalizasyonu (mouse wheel vs trackpad)
        const dx = e.deltaMode === 0 ? e.deltaX : e.deltaX * 20
        const dy = e.deltaMode === 0 ? e.deltaY : e.deltaY * 20
        transformRef.current = { x: x - dx, y: y - dy, scale }
      }
      scheduleTransform()
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [scheduleTransform])

  // Klavye
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    const block = e => {
      e.stopPropagation()
      const ctrl   = e.ctrlKey || e.metaKey
      const inText = editingItemIdRef.current !== null

      if (e.key === 'Escape') {
        e.preventDefault()
        if (editingItemIdRef.current) { setEditingItemId(null); return }
        clearTimeout(saveTimerRef.current)
        doSaveRef.current?.(itemsRef.current, bgRef.current)
        closeEditorRef.current?.()
        return
      }
      if (ctrl && e.key === 'a' && !inText) { e.preventDefault(); actionRef.current.selectAll?.(); return }
      if (ctrl && e.key === 'c' && !inText) { e.preventDefault(); actionRef.current.copy?.(); return }
      if (ctrl && e.key === 'v' && !inText) { e.preventDefault(); actionRef.current.paste?.(); return }
      if (ctrl && e.key === 'd' && !inText) { e.preventDefault(); actionRef.current.duplicate?.(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inText) {
        e.preventDefault(); actionRef.current.deleteSelected?.(); return
      }
    }
    document.addEventListener('keydown', block, true)
    return () => { document.removeEventListener('keydown', block, true); clearTimeout(saveTimerRef.current) }
  }, [])

  // Save
  const doSave = useCallback(async (currentItems, currentBg) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify({ items: currentItems, bg: currentBg }) }),
      })
      if (r.ok) updateMedia(await r.json())
    } catch (e) { console.error('[CanvasEditor] save failed', e) }
    finally { setSaving(false) }
  }, [id, updateMedia])

  doSaveRef.current      = doSave
  closeEditorRef.current = closeCanvasEditor

  const scheduleSave = useCallback((newItems, newBg) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(newItems, newBg), 500)
  }, [doSave])

  const handleClose = () => {
    clearTimeout(saveTimerRef.current)
    doSave(itemsRef.current, bgRef.current)
    closeCanvasEditor()
  }

  // Pan — ref tabanlı, sıfır React re-render per pixel
  const handleViewportMouseDown = (e) => {
    if (e.target !== e.currentTarget) return
    if (editingItemId) { setEditingItemId(null); return }
    setSelectedIds(new Set())
    isPanningRef.current = true
    panStartRef.current = {
      x: e.clientX - transformRef.current.x,
      y: e.clientY - transformRef.current.y,
    }
    // Cursor + pointer-events direkt DOM — React re-render tetiklememek için
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
    if (surfaceRef.current)   surfaceRef.current.style.pointerEvents = 'none'
  }

  const handleMouseMove = (e) => {
    if (isPanningRef.current) {
      transformRef.current = {
        ...transformRef.current,
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      }
      scheduleTransform()
      return
    }
    if (dragState) {
      const scale = transformRef.current.scale
      const dx = (e.clientX - dragState.startMouse.x) / scale
      const dy = (e.clientY - dragState.startMouse.y) / scale
      setItems(prev => prev.map(it => {
        const orig = dragState.originsMap[it.id]
        return orig ? { ...it, x: orig.x + dx, y: orig.y + dy } : it
      }))
    }
  }

  const handleMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false
      if (surfaceRef.current) surfaceRef.current.style.pointerEvents = ''
    }
    if (containerRef.current) containerRef.current.style.cursor = 'default'
    if (dragState) scheduleSave(itemsRef.current, bgRef.current)
    setDragState(null)
  }

  // Item etkileşimleri
  const handleItemMouseDown = (e, item) => {
    e.stopPropagation()
    if (editingItemId === item.id) return

    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.has(item.id) ? next.delete(item.id) : next.add(item.id)
        return next
      })
      return
    }

    const isSelected = selectedIdsRef.current.has(item.id)
    const dragIds    = isSelected ? [...selectedIdsRef.current] : [item.id]
    if (!isSelected) setSelectedIds(new Set([item.id]))

    const originsMap = {}
    dragIds.forEach(did => {
      const it = itemsRef.current.find(i => i.id === did)
      if (it) originsMap[did] = { x: it.x, y: it.y }
    })
    setDragState({ originsMap, startMouse: { x: e.clientX, y: e.clientY } })
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
  }

  const handleItemDoubleClick = (e, item) => {
    e.stopPropagation()
    if (item.type === 'text') { setEditingItemId(item.id); setSelectedIds(new Set([item.id])) }
  }

  // İmlecin altındaki canvas dünya koordinatını döner
  const screenToWorld = (sx, sy) => {
    const { x, y, scale } = transformRef.current
    const container = containerRef.current
    const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return {
      x: (sx - rect.left - x) / scale,
      y: (sy - rect.top  - y) / scale,
    }
  }

  // Viewport merkezine yeni item ekle
  const viewportCenter = () => {
    const { x, y, scale } = transformRef.current
    const container = containerRef.current
    const cx = container ? container.clientWidth  / 2 : 400
    const cy = container ? container.clientHeight / 2 : 300
    return { x: (cx - x) / scale, y: (cy - y) / scale }
  }

  // CRUD
  const addTextItem = () => {
    const { x: wx, y: wy } = viewportCenter()
    const newItem = {
      id: crypto.randomUUID(), type: 'text',
      x: wx, y: wy, w: 300, h: 150, content: 'Yeni metin...',
    }
    setItems(prev => { const next = [...prev, newItem]; scheduleSave(next, bgRef.current); return next })
    setEditingItemId(newItem.id)
    setSelectedIds(new Set([newItem.id]))
  }

  const handleImageFileSelect = async (e) => {
    const file = e.target.files[0]; if (!file) return
    e.target.value = ''
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await fetch(`/api/canvas/${id}/upload`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { alert(d.error); return }
      const { x: wx, y: wy } = viewportCenter()
      const newItem = {
        id: crypto.randomUUID(), type: 'image',
        x: wx, y: wy, w: 400, h: 300, url: d.url,
      }
      setItems(prev => { const next = [...prev, newItem]; scheduleSave(next, bgRef.current); return next })
      setSelectedIds(new Set([newItem.id]))
    } catch (err) { alert('Resim yüklenemedi: ' + err.message) }
  }

  const deleteItem = (e, itemId) => {
    e.stopPropagation()
    setItems(prev => { const next = prev.filter(it => it.id !== itemId); scheduleSave(next, bgRef.current); return next })
    setSelectedIds(prev => { const next = new Set(prev); next.delete(itemId); return next })
  }

  const handleBgChange = (e) => {
    const newBg = e.target.value; setBg(newBg); scheduleSave(itemsRef.current, newBg)
  }

  // Copy / Paste / Select-all / Delete / Duplicate
  const copySelected = () => {
    if (selectedIdsRef.current.size === 0) return
    const copied = itemsRef.current.filter(it => selectedIdsRef.current.has(it.id))
    canvasClipboard = { items: copied, sourceMediaId: id, pasteCount: 0 }
    setClipboardSize(copied.length)
  }

  const pasteItems = async () => {
    if (!canvasClipboard?.items?.length) return
    const offset   = PASTE_STEP + canvasClipboard.pasteCount * PASTE_STEP
    let srcItems   = canvasClipboard.items

    if (canvasClipboard.sourceMediaId !== id) {
      const imageUrls = srcItems
        .filter(it => it.type === 'image' && it.url?.startsWith('/uploads/'))
        .map(it => it.url)
      if (imageUrls.length > 0) {
        try {
          const r = await fetch('/api/canvas/copy-images', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: imageUrls }),
          })
          if (r.ok) {
            const { mapping } = await r.json()
            srcItems = srcItems.map(it =>
              it.type === 'image' && mapping[it.url] ? { ...it, url: mapping[it.url] } : it
            )
          }
        } catch {}
      }
    }

    const pasted = srcItems.map(it => ({ ...it, id: crypto.randomUUID(), x: it.x + offset, y: it.y + offset }))
    setItems(prev => { const next = [...prev, ...pasted]; scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set(pasted.map(it => it.id)))
    canvasClipboard = { ...canvasClipboard, pasteCount: canvasClipboard.pasteCount + 1 }
  }

  const selectAll = () => setSelectedIds(new Set(itemsRef.current.map(it => it.id)))

  const deleteSelected = () => {
    if (selectedIdsRef.current.size === 0) return
    setItems(prev => {
      const next = prev.filter(it => !selectedIdsRef.current.has(it.id))
      scheduleSave(next, bgRef.current)
      return next
    })
    setSelectedIds(new Set())
  }

  const duplicate = () => {
    if (selectedIdsRef.current.size === 0) return
    const toDupe = itemsRef.current.filter(it => selectedIdsRef.current.has(it.id))
    const duped  = toDupe.map(it => ({ ...it, id: crypto.randomUUID(), x: it.x + PASTE_STEP, y: it.y + PASTE_STEP }))
    setItems(prev => { const next = [...prev, ...duped]; scheduleSave(next, bgRef.current); return next })
    setSelectedIds(new Set(duped.map(it => it.id)))
  }

  actionRef.current = { copy: copySelected, paste: pasteItems, selectAll, deleteSelected, duplicate }

  // Render
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#0a0a0f', userSelect: 'none' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <span style={{ color: '#888', fontSize: 13, marginRight: 4 }}>🎨 Canvas</span>

        <button onClick={addTextItem} style={tbBtn}>✏️ Metin Ekle</button>
        <button onClick={() => fileInputRef.current?.click()} style={tbBtn}>🖼️ Resim Ekle</button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFileSelect} />

        {selectedIds.size > 0 && (
          <>
            <div style={tbDivider} />
            <button onClick={copySelected} style={tbBtn} title="Ctrl+C">
              ⧉ Kopyala {selectedIds.size > 1 ? `(${selectedIds.size})` : ''}
            </button>
            <button onClick={deleteSelected} style={{ ...tbBtn, color: '#f87171' }} title="Delete">
              🗑 Sil
            </button>
          </>
        )}

        {clipboardSize > 0 && (
          <>
            <div style={tbDivider} />
            <button onClick={pasteItems} style={{ ...tbBtn, borderColor: 'rgba(96,165,250,0.4)', color: '#93c5fd' }} title="Ctrl+V">
              ⌘ Yapıştır {clipboardSize > 1 ? `(${clipboardSize})` : ''}
            </button>
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#aaa', fontSize: 12, marginLeft: 8 }}>
          Arka plan
          <input type="color" value={bg} onChange={handleBgChange}
            style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
        </label>

        {/* Zoom göstergesi — direkt DOM update, React state yok */}
        <div style={tbDivider} />
        <span ref={zoomLabelRef} style={{ fontSize: 11, color: '#666', minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          100%
        </span>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: saving ? '#60a5fa' : '#4ade80' }}>
          {saving ? '⟳ Kaydediliyor...' : '✓ Kaydedildi'}
        </span>

        <span style={{ fontSize: 10, color: '#444', marginLeft: 8 }}>
          Ctrl+A · C · V · D · Del · Ctrl+Scroll: Zoom
        </span>

        <button onClick={handleClose} style={{ ...tbBtn, marginLeft: 8, background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
          ✕ Kapat
        </button>
      </div>

      {/* Canvas viewport */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
        onMouseDown={handleViewportMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Canvas surface — transform: ref + RAF, React render'dan bağımsız */}
        <div
          ref={surfaceRef}
          style={{
            position: 'absolute', width: 8000, height: 8000, top: 0, left: 0,
            backgroundColor: bg,
            transformOrigin: '0 0',
            willChange: 'transform',
            // transform buraya yazılmıyor — React re-render'da RAF değerini ezmemesi için
          }}
        >
          {items.map(item => {
            const isSelected = selectedIds.has(item.id)
            const isHovered  = hoveredItemId === item.id
            const isDragging = dragState?.originsMap?.[item.id] !== undefined

            let outline = '1px solid transparent'
            if (isSelected)                   outline = '2px solid #60a5fa'
            else if (isHovered || isDragging) outline = '1px solid rgba(96,165,250,0.5)'

            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h,
                  cursor: editingItemId === item.id ? 'text' : 'move',
                  outline, borderRadius: 4, boxSizing: 'border-box',
                  boxShadow: isSelected ? '0 0 0 1px rgba(96,165,250,0.2)' : 'none',
                }}
                onMouseDown={e => handleItemMouseDown(e, item)}
                onMouseEnter={() => setHoveredItemId(item.id)}
                onMouseLeave={() => setHoveredItemId(null)}
                onDoubleClick={e => handleItemDoubleClick(e, item)}
              >
                {item.type === 'image' ? (
                  <img src={item.url} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, display: 'block', pointerEvents: 'none' }} />
                ) : item.type === 'text' && editingItemId === item.id ? (
                  <textarea
                    autoFocus
                    defaultValue={item.content}
                    style={{
                      width: '100%', height: '100%',
                      background: 'rgba(0,0,0,0.5)', border: '1px solid #60a5fa', borderRadius: 4,
                      color: '#fff', fontSize: 14, padding: 8, resize: 'none', outline: 'none',
                      boxSizing: 'border-box', fontFamily: 'inherit',
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    onBlur={e => {
                      const newContent = e.target.value
                      setItems(prev => {
                        const next = prev.map(it => it.id === item.id ? { ...it, content: newContent } : it)
                        scheduleSave(next, bgRef.current)
                        return next
                      })
                      setEditingItemId(null)
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', background: 'rgba(0,0,0,0.35)', borderRadius: 4,
                    color: '#e2e8f0', fontSize: 14, padding: 8, whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word', overflow: 'hidden', boxSizing: 'border-box', pointerEvents: 'none',
                  }}>
                    {item.content}
                  </div>
                )}

                {(isHovered || isSelected) && editingItemId !== item.id && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => deleteItem(e, item.id)}
                    style={{
                      position: 'absolute', top: -10, right: -10, width: 20, height: 20,
                      background: '#ef4444', border: 'none', borderRadius: '50%', color: '#fff',
                      fontSize: 12, lineHeight: '20px', textAlign: 'center', cursor: 'pointer',
                      padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                    }}
                  >×</button>
                )}
              </div>
            )
          })}

          {items.length === 0 && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.15)', fontSize: 16, textAlign: 'center', pointerEvents: 'none' }}>
              Metin veya resim ekleyin<br />
              <span style={{ fontSize: 12 }}>Sürükle: Pan · Ctrl+Scroll: Zoom</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const tbBtn = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, color: '#e2e8f0', padding: '6px 12px', cursor: 'pointer', fontSize: 12,
}

const tbDivider = {
  width: 1, height: 24, background: 'rgba(255,255,255,0.1)', flexShrink: 0,
}
