import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore'

export default function CanvasEditor({ mediaId }) {
  const updateMedia      = useStore(s => s.updateMedia)
  const closeCanvasEditor = useStore(s => s.closeCanvasEditor)
  const worldMedia       = useStore(s => s.worldMedia)

  const media = worldMedia.find(m => m.id === mediaId)
  const initialData = (() => {
    try { return JSON.parse(media?.content) } catch { return { items: [], bg: '#1a1a2e' } }
  })()
  const id = mediaId

  const [items, setItems] = useState(initialData.items || [])
  const [bg, setBg] = useState(initialData.bg || '#1a1a2e')
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [dragState, setDragState] = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [hoveredItemId, setHoveredItemId] = useState(null)

  const saveTimerRef = useRef(null)
  const doSaveRef = useRef(null)
  const closeCanvasEditorRef = useRef(null)
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)
  const itemsRef = useRef(items)
  const bgRef = useRef(bg)
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { bgRef.current = bg }, [bg])

  // Block game controls while editor is open; ESC closes editor
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    const block = e => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        clearTimeout(saveTimerRef.current)
        doSaveRef.current(itemsRef.current, bgRef.current)
        closeCanvasEditorRef.current()
      }
    }
    document.addEventListener('keydown', block, true)
    return () => {
      document.removeEventListener('keydown', block, true)
      clearTimeout(saveTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doSave = useCallback(async (currentItems, currentBg) => {
    setSaving(true)
    try {
      const content = JSON.stringify({ items: currentItems, bg: currentBg })
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (r.ok) updateMedia(await r.json())
    } catch (e) {
      console.error('[CanvasEditor] save failed', e)
    } finally {
      setSaving(false)
    }
  }, [id, updateMedia])

  doSaveRef.current = doSave
  closeCanvasEditorRef.current = closeCanvasEditor

  const scheduleSave = useCallback((newItems, newBg) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(newItems, newBg), 500)
  }, [doSave])

  const handleClose = () => {
    clearTimeout(saveTimerRef.current)
    doSave(itemsRef.current, bgRef.current)
    closeCanvasEditor()
  }

  // ── Panning ───────────────────────────────────────────────────────────────
  const handleViewportMouseDown = (e) => {
    if (e.target !== e.currentTarget) return
    if (editingItemId) { setEditingItemId(null); return }
    setIsPanning(true)
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
      return
    }
    if (dragState) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const newX = e.clientX - dragState.offsetX - rect.left - pan.x
      const newY = e.clientY - dragState.offsetY - rect.top - pan.y
      setItems(prev => prev.map(it =>
        it.id === dragState.itemId ? { ...it, x: newX, y: newY } : it
      ))
    }
  }

  const handleMouseUp = () => {
    if (dragState) {
      scheduleSave(itemsRef.current, bgRef.current)
    }
    setIsPanning(false)
    setDragState(null)
  }

  // ── Item drag ─────────────────────────────────────────────────────────────
  const handleItemMouseDown = (e, item) => {
    e.stopPropagation()
    if (editingItemId === item.id) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setDragState({
      itemId: item.id,
      offsetX: e.clientX - (rect.left + pan.x + item.x),
      offsetY: e.clientY - (rect.top + pan.y + item.y),
    })
  }

  // ── Add items ─────────────────────────────────────────────────────────────
  const addTextItem = () => {
    const newItem = {
      id: crypto.randomUUID(),
      type: 'text',
      x: -pan.x + 100,
      y: -pan.y + 100,
      w: 300,
      h: 150,
      content: 'Yeni metin...',
    }
    setItems(prev => {
      const next = [...prev, newItem]
      scheduleSave(next, bgRef.current)
      return next
    })
    setEditingItemId(newItem.id)
  }

  const handleImageFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const formData = new FormData()
    formData.append('file', file)
    try {
      const r = await fetch(`/api/canvas/${id}/upload`, { method: 'POST', body: formData })
      const d = await r.json()
      if (!r.ok) { alert(d.error); return }
      const newItem = {
        id: crypto.randomUUID(),
        type: 'image',
        x: -pan.x + 100,
        y: -pan.y + 100,
        w: 400,
        h: 300,
        url: d.url,
      }
      setItems(prev => {
        const next = [...prev, newItem]
        scheduleSave(next, bgRef.current)
        return next
      })
    } catch (err) {
      alert('Resim yüklenemedi: ' + err.message)
    }
  }

  const deleteItem = (e, itemId) => {
    e.stopPropagation()
    setItems(prev => {
      const next = prev.filter(it => it.id !== itemId)
      scheduleSave(next, bgRef.current)
      return next
    })
  }

  const handleBgChange = (e) => {
    const newBg = e.target.value
    setBg(newBg)
    scheduleSave(itemsRef.current, newBg)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: '#0a0a0f',
      userSelect: 'none',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        <span style={{ color: '#888', fontSize: 13, marginRight: 8 }}>🎨 Canvas</span>

        <button onClick={addTextItem} style={toolbarBtn}>
          ✏️ Metin Ekle
        </button>

        <button onClick={() => fileInputRef.current?.click()} style={toolbarBtn}>
          🖼️ Resim Ekle
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageFileSelect}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#aaa', fontSize: 12 }}>
          Arka plan
          <input
            type="color"
            value={bg}
            onChange={handleBgChange}
            style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          />
        </label>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: saving ? '#60a5fa' : '#4ade80' }}>
          {saving ? '⟳ Kaydediliyor...' : '✓ Kaydedildi'}
        </span>

        <button onClick={handleClose} style={{ ...toolbarBtn, marginLeft: 8, background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
          ✕ Kapat
        </button>
      </div>

      {/* Canvas viewport */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          cursor: isPanning ? 'grabbing' : dragState ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleViewportMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Canvas surface */}
        <div style={{
          position: 'absolute',
          width: 8000,
          height: 8000,
          top: 0,
          left: 0,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          backgroundColor: bg,
        }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                left: item.x,
                top: item.y,
                width: item.w,
                height: item.h,
                cursor: editingItemId === item.id ? 'text' : 'move',
                outline: hoveredItemId === item.id || dragState?.itemId === item.id
                  ? '1px solid rgba(96,165,250,0.6)' : '1px solid transparent',
                borderRadius: 4,
                boxSizing: 'border-box',
              }}
              onMouseDown={e => handleItemMouseDown(e, item)}
              onMouseEnter={() => setHoveredItemId(item.id)}
              onMouseLeave={() => setHoveredItemId(null)}
              onDoubleClick={e => { e.stopPropagation(); if (item.type === 'text') setEditingItemId(item.id) }}
            >
              {/* Item content */}
              {item.type === 'image' ? (
                <img
                  src={item.url}
                  alt=""
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, display: 'block', pointerEvents: 'none' }}
                />
              ) : item.type === 'text' && editingItemId === item.id ? (
                <textarea
                  autoFocus
                  defaultValue={item.content}
                  style={{
                    width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid #60a5fa',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 14,
                    padding: 8,
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
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
                  width: '100%', height: '100%',
                  background: 'rgba(0,0,0,0.35)',
                  borderRadius: 4,
                  color: '#e2e8f0',
                  fontSize: 14,
                  padding: 8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }}>
                  {item.content}
                </div>
              )}

              {/* Delete button */}
              {hoveredItemId === item.id && editingItemId !== item.id && (
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => deleteItem(e, item.id)}
                  style={{
                    position: 'absolute', top: -10, right: -10,
                    width: 20, height: 20,
                    background: '#ef4444', border: 'none',
                    borderRadius: '50%', color: '#fff',
                    fontSize: 12, lineHeight: '20px', textAlign: 'center',
                    cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1,
                  }}
                >×</button>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'rgba(255,255,255,0.15)',
              fontSize: 16,
              textAlign: 'center',
              pointerEvents: 'none',
            }}>
              Metin veya resim ekleyin<br />
              <span style={{ fontSize: 12 }}>Gezinmek için sürükleyin</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const toolbarBtn = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: '#e2e8f0',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 12,
}
