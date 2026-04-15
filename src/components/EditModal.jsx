import React, { useState, useEffect, useRef } from 'react'
import { marked } from 'marked'
import { useStore } from '../store/useStore'

export function EditModal() {
  const { activeModal, selectedTile, worldMedia, closeModal, addMedia, removeMedia } = useStore()
  const [activeTab, setActiveTab] = useState('image')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [width, setWidth] = useState(1)
  const [height, setHeight] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [naturalRatio, setNaturalRatio] = useState(null) // ratio = width / height
  const [markdownContent, setMarkdownContent] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [pastePreview, setPastePreview] = useState(null)
  const mdMeasureRef = useRef(null)

  // Markdown: h=5 sabit, içerik ölçülüp kaç sütun gerektiği hesaplanır → w=nCols*2
  const MD_COL_PX_W = 600   // her sütunun CSS piksel genişliği
  const MD_COL_PX_H = 1000  // her sütunun CSS piksel yüksekliği (5 birim × 200 px/birim)
  const MD_H = 5             // sabit 3D yükseklik
  const MD_COL_W = MD_COL_PX_W / (MD_COL_PX_H / MD_H) // = 600/200 = 3 birim/sütun

  useEffect(() => {
    if (activeTab !== 'markdown') return
    if (!markdownContent.trim()) {
      setHeight(MD_H)
      setWidth(MD_COL_W)
      return
    }
    const el = mdMeasureRef.current
    if (!el) return
    el.innerHTML = marked(markdownContent)
    const nCols = Math.max(1, Math.ceil(el.scrollHeight / MD_COL_PX_H))
    setHeight(MD_H)
    setWidth(Number((nCols * MD_COL_W).toFixed(2)))
  }, [markdownContent, activeTab])

  const tileMedia = selectedTile ? worldMedia.filter(
    (m) => String(m.tileId) === String(selectedTile.id)
  ) : []

  React.useEffect(() => {
    const probeAspectRatio = (sourceUrl, type) => {
      if (type === 'youtube' || type === 'embed') {
        setNaturalRatio(16/9)
        setHeight(w => Number((w / (16/9)).toFixed(2)))
        return
      }
      if (!sourceUrl) return
      if (type === 'video') {
         const vid = document.createElement('video')
         vid.onloadedmetadata = () => {
           if (vid.videoWidth) {
             const ratio = vid.videoWidth / vid.videoHeight
             setNaturalRatio(ratio)
             setHeight(w => Number((w / ratio).toFixed(2)))
           }
         }
         vid.src = sourceUrl
      } else {
         const img = new Image()
         img.onload = () => {
           if (img.width) {
             const ratio = img.width / img.height
             setNaturalRatio(ratio)
             setHeight(w => Number((w / ratio).toFixed(2)))
           }
         }
         img.src = sourceUrl
      }
    }

    if (file) {
      const objectUrl = URL.createObjectURL(file)
      probeAspectRatio(objectUrl, activeTab)
      return () => URL.revokeObjectURL(objectUrl)
    } else if (activeTab === 'youtube' || activeTab === 'embed') {
      probeAspectRatio(url, activeTab)
    } else if (url && url.length > 5 && url.startsWith('http')) {
      probeAspectRatio(url, activeTab)
    } else {
      setNaturalRatio(null)
    }
  }, [file, url, activeTab])

  const handleFileChange = (e) => {
    const f = e.target.files[0] || null
    setFile(f)
    if (f) { setUrl(''); setPastePreview(null) }
  }

  const handlePasteZone = (e) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()
    const blob = imgItem.getAsFile()
    const previewUrl = URL.createObjectURL(blob)
    setFile(blob)
    setUrl('')
    setPastePreview(previewUrl)
  }

  const handleWidthChange = (val) => {
    setWidth(val)
    const w = parseFloat(val)
    if (!isNaN(w) && w > 0 && naturalRatio) {
      setHeight(Number((w / naturalRatio).toFixed(2)))
    }
  }

  const handleHeightChange = (val) => {
    setHeight(val)
    const h = parseFloat(val)
    if (!isNaN(h) && h > 0 && naturalRatio) {
      setWidth(Number((h * naturalRatio).toFixed(2)))
    }
  }

  const handleApply = async () => {
    if (activeTab === 'markdown') {
      if (!markdownContent.trim()) {
        alert('Lütfen metin girin.')
        return
      }
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/add-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            content: markdownContent,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation)
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Kayıt hatası')
        addMedia(d)
        closeModal()
        setMarkdownContent('')
        setWidth(1)
        setHeight(1)
      } catch (err) {
        console.error(err)
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (!file && !url.trim()) {
      alert('Lütfen bir dosya seçin veya URL girin.')
      return
    }

    setLoading(true)
    setLoadingStep(file ? 'saving' : 'downloading')

    try {
      let resolvedUrl = url.trim()
      let resolvedType = activeTab

      if (resolvedType === 'youtube') {
        let src = resolvedUrl;
        const iframeMatch = resolvedUrl.match(/<iframe.*?src=["'](.*?)["']/i);
        if (iframeMatch) src = iframeMatch[1];
        
        try {
          const u = new URL(src);
          if (u.hostname.includes('youtube.com') && u.searchParams.has('v')) {
            src = `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
          } else if (u.hostname.includes('youtu.be')) {
            src = `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
          }
        } catch (e) {}
        resolvedUrl = src;
      }

      // Download external URL server-side to avoid CORS
      if (!file && resolvedUrl && resolvedType !== 'youtube' && resolvedType !== 'embed') {
        const r = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: resolvedUrl }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'URL indirilemedi')
        resolvedUrl = d.localUrl
        resolvedType = d.type
        setLoadingStep('saving')
      }

      const body = new FormData()
      body.append('tileId', selectedTile.id)
      body.append('type', resolvedType)
      body.append('width', width)
      body.append('height', height)
      body.append('position', JSON.stringify(selectedTile.position))
      body.append('rotation', JSON.stringify(selectedTile.rotation))
      if (file) {
        body.append('file', file)
      } else {
        body.append('url', resolvedUrl)
      }

      const r = await fetch('/api/upload', { method: 'POST', body })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Yükleme hatası')

      addMedia(d)
      closeModal()
      setUrl('')
      setFile(null)
      setWidth(1)
      setHeight(1)
    } catch (err) {
      console.error(err)
      alert(err.message)
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  const handleDelete = async (id) => {
    try {
      const r = await fetch(`/api/media/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Sunucu hatası')
      removeMedia(id)
    } catch (err) {
      console.error(err)
      alert('Silme hatası!')
    }
  }

  const handleSaveContent = async (id) => {
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      })
      if (!r.ok) throw new Error('Güncelleme başarısız')
      const updated = await r.json()
      useStore.getState().updateMedia(updated)
      setEditingId(null)
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  const handleUpdateSize = async (id, newWidth, newHeight) => {
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ width: newWidth, height: newHeight })
      })
      if (!r.ok) throw new Error('Güncelleme başarısız')
      const updatedItem = await r.json()
      useStore.getState().updateMedia(updatedItem)
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  const loadingLabel =
    loadingStep === 'downloading' ? '⬇ İndiriliyor...' : '💾 Kaydediliyor...'

  if (!activeModal || !selectedTile) return null

  return (
    <div style={s.overlay}>
      {/* Gizli ölçüm div'i — markdown'un gerçek yüksekliğini hesaplamak için */}
      <div
        ref={mdMeasureRef}
        style={{
          position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
          width: '600px', fontSize: '16px', lineHeight: '1.6',
          fontFamily: 'system-ui, sans-serif', padding: '24px',
          boxSizing: 'border-box', top: '-9999px', left: '-9999px',
        }}
      />
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>Grid Düzenle</h2>
            <span style={s.subtitle}>ID: {String(selectedTile.id)}</span>
          </div>
          <button style={s.closeBtn} onClick={closeModal}>✕</button>
        </div>

        {/* Existing media on this tile */}
        {tileMedia.length > 0 && (
          <div style={s.existingSection}>
            <p style={s.sectionLabel}>Bu tile'daki medyalar</p>
            {tileMedia.map((m) => (
              <div key={m.id} style={{ borderBottom: '1px solid #1e1e1e' }}>
                <div style={s.mediaItem}>
                  <div style={{ flex: 1, marginRight: '10px' }}>
                    <span style={s.mediaItemLabel}>
                      {m.type === 'video' ? '🎬' : m.type === 'youtube' ? '▶️' : m.type === 'markdown' ? '📝' : '🖼'}{' '}
                      {m.type === 'youtube' ? 'YouTube Video' : m.type === 'markdown' ? 'Metin' : (m.url || '').split('/').pop()}
                    </span>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'flex', alignItems: 'center' }}>
                        G:
                        <input
                          type="number"
                          defaultValue={m.width}
                          step="0.1"
                          style={{ width: '45px', marginLeft: '4px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '11px', padding: '3px' }}
                          onBlur={e => handleUpdateSize(m.id, e.target.value, m.height)}
                        />
                      </label>
                      <label style={{ fontSize: '11px', color: '#888', display: 'flex', alignItems: 'center' }}>
                        Y:
                        <input
                          type="number"
                          defaultValue={m.height}
                          step="0.1"
                          style={{ width: '45px', marginLeft: '4px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '11px', padding: '3px' }}
                          onBlur={e => handleUpdateSize(m.id, m.width, e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                    {(m.type === 'youtube' || m.type === 'embed') && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '3px 8px', maxWidth: '200px' }}>
                        <span style={{ fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {m.url}
                        </span>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: copiedId === m.id ? '#4ade80' : '#888', fontSize: '14px', flexShrink: 0 }}
                          title="Linki kopyala"
                          onClick={() => {
                            navigator.clipboard.writeText(m.url)
                            setCopiedId(m.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }}
                        >
                          {copiedId === m.id ? '✓' : '⧉'}
                        </button>
                      </div>
                    )}
                    {m.type === 'markdown' && (
                      <button
                        style={s.editBtn}
                        onClick={() => {
                          if (editingId === m.id) {
                            setEditingId(null)
                          } else {
                            setEditingId(m.id)
                            setEditingContent(m.content || '')
                          }
                        }}
                      >
                        {editingId === m.id ? 'Kapat' : 'Düzenle'}
                      </button>
                    )}
                    <button style={s.deleteBtn} onClick={() => handleDelete(m.id)}>
                      Sil
                    </button>
                  </div>
                </div>

                {/* Inline markdown editör */}
                {editingId === m.id && (
                  <div style={s.inlineEditor}>
                    <textarea
                      style={s.inlineTextarea}
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button style={s.cancelBtn} onClick={() => setEditingId(null)}>İptal</button>
                      <button style={s.applyBtn} onClick={() => handleSaveContent(m.id)}>Kaydet</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={s.tabs}>
          <button
            style={activeTab === 'image' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('image')}
          >
            🖼 Resim
          </button>
          <button
            style={activeTab === 'video' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('video')}
          >
            🎬 Video
          </button>
          <button
            style={activeTab === 'youtube' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('youtube')}
          >
            ▶️ YouTube
          </button>
          <button
            style={activeTab === 'markdown' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('markdown')}
          >
            📝 Metin
          </button>
          <button
            style={activeTab === 'embed' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('embed')}
          >
            🌐 Site
          </button>
        </div>

        {/* Form */}
        <div style={s.form}>

          {/* Markdown textarea */}
          {activeTab === 'markdown' && (
            <div style={s.inputGroup}>
              <label style={s.label}>Markdown İçerik</label>
              <textarea
                style={{ ...s.input, height: '260px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }}
                value={markdownContent}
                onChange={e => setMarkdownContent(e.target.value)}
                placeholder={'# Başlık\n\nMetin buraya...\n\n**kalın**, _italik_'}
              />
            </div>
          )}

          {/* URL input */}
          {activeTab !== 'markdown' && (
          <div style={s.inputGroup}>
            <label style={s.label}>
              {activeTab === 'image' ? 'Resim Linki' : activeTab === 'video' ? 'Video Linki' : activeTab === 'embed' ? 'Site URL' : 'YouTube Linki (veya iframe)'}
            </label>
            <input
              style={{ ...s.input, opacity: file ? 0.4 : 1 }}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                activeTab === 'image'
                  ? 'https://example.com/image.jpg'
                  : activeTab === 'video'
                  ? 'https://example.com/video.mp4'
                  : activeTab === 'embed'
                  ? 'https://example.com'
                  : 'https://youtube.com/watch?v=... veya <iframe...>'
              }
              disabled={!!file}
            />
            {activeTab === 'embed' && (
              <p style={s.note}>⚠ Bazı siteler iframe'e izin vermez (Google, Twitter vb.)</p>
            )}
            {file && <p style={s.note}>URL devre dışı — dosya seçildi</p>}
          </div>
          )}

          {/* File input */}
          {activeTab !== 'youtube' && activeTab !== 'markdown' && activeTab !== 'embed' && (
            <div style={s.inputGroup}>
              <label style={s.label}>
                {activeTab === 'image' ? 'veya Dosya Seç' : 'veya Video Dosyası Seç'}
              </label>
              <input
                style={s.fileInput}
                type="file"
                accept={activeTab === 'image' ? 'image/*' : 'video/*'}
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Paste zone — sadece resim tabında */}
          {activeTab === 'image' && (
            <div style={s.inputGroup}>
              <label style={s.label}>veya Panodan Yapıştır</label>
              <div
                style={{
                  ...s.pasteZone,
                  ...(pastePreview ? s.pasteZoneActive : {}),
                }}
                tabIndex={0}
                onPaste={handlePasteZone}
                onClick={e => e.currentTarget.focus()}
              >
                {pastePreview ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={pastePreview} alt="yapıştırılan resim" style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '6px', display: 'block' }} />
                    <button
                      style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', padding: '2px 6px' }}
                      onClick={e => { e.stopPropagation(); setFile(null); setPastePreview(null) }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: '13px', color: '#555' }}>
                    Tıkla ve <kbd style={{ background: '#222', border: '1px solid #444', borderRadius: '3px', padding: '1px 5px', fontSize: '11px', color: '#aaa' }}>Ctrl+V</kbd> ile yapıştır
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Size inputs */}
          <div style={s.row}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>
                Genişlik (tile) {activeTab === 'markdown' ? '⚡ otomatik' : ''}
              </label>
              <input
                style={{ ...s.input, opacity: activeTab === 'markdown' ? 0.5 : 1 }}
                type="number"
                min="0.1"
                step="0.1"
                value={width}
                onChange={(e) => handleWidthChange(e.target.value)}
                readOnly={activeTab === 'markdown'}
              />
            </div>
            <div style={{ width: 12 }} />
            <div style={{ flex: 1 }}>
              <label style={s.label}>
                Yükseklik (tile) {activeTab === 'markdown' ? '⚡ otomatik' : naturalRatio ? '🔗' : ''}
              </label>
              <input
                style={{ ...s.input, opacity: activeTab === 'markdown' ? 0.5 : 1 }}
                type="number"
                min="0.1"
                step="0.1"
                value={height}
                onChange={(e) => handleHeightChange(e.target.value)}
                readOnly={activeTab === 'markdown'}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={closeModal}>İptal</button>
          <button style={s.applyBtn} onClick={handleApply} disabled={loading}>
            {loading ? loadingLabel : 'Uygula'}
          </button>
        </div>

      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2147483647,
    backdropFilter: 'blur(6px)',
  },
  modal: {
    backgroundColor: '#181818',
    color: '#fff',
    padding: '28px',
    borderRadius: '16px',
    width: '720px',
    maxHeight: '92vh',
    overflowY: 'auto',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
    border: '1px solid #2a2a2a',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
  },
  title: { margin: 0, fontSize: '20px', fontWeight: 600, color: '#fff' },
  subtitle: { fontSize: '11px', color: '#555', marginTop: '2px', display: 'block' },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '2px 4px',
  },
  existingSection: {
    marginBottom: '18px',
    padding: '12px',
    backgroundColor: '#0d0d0d',
    borderRadius: '10px',
    border: '1px solid #222',
  },
  sectionLabel: {
    margin: '0 0 8px',
    fontSize: '11px',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  mediaItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 0',
    borderBottom: '1px solid #1e1e1e',
  },
  mediaItemLabel: {
    fontSize: '13px',
    color: '#bbb',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '300px',
  },
  deleteBtn: {
    padding: '3px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #7f1d1d',
    color: '#f87171',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    flexShrink: 0,
  },
  editBtn: {
    padding: '3px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #2a4a6b',
    color: '#60a5fa',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    flexShrink: 0,
  },
  inlineEditor: {
    padding: '10px 0 12px',
  },
  pasteZone: {
    width: '100%',
    minHeight: '80px',
    border: '2px dashed #2a2a2a',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '16px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  pasteZoneActive: {
    border: '2px dashed #3a5a3a',
    backgroundColor: '#0a120a',
  },
  inlineTextarea: {
    width: '100%',
    height: '300px',
    padding: '10px 12px',
    backgroundColor: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'monospace',
    lineHeight: '1.6',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  },
  tabs: {
    display: 'flex',
    marginBottom: '18px',
    backgroundColor: '#0d0d0d',
    padding: '3px',
    borderRadius: '10px',
    gap: '3px',
  },
  tab: {
    flex: 1,
    padding: '9px',
    background: 'transparent',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    borderRadius: '8px',
    fontSize: '13px',
  },
  activeTab: {
    flex: 1,
    padding: '9px',
    background: '#2a2a2a',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
  },
  form: { marginBottom: '22px' },
  inputGroup: { marginBottom: '14px' },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    color: '#888',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  fileInput: {
    width: '100%',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '8px 0',
  },
  note: {
    margin: '4px 0 0',
    fontSize: '11px',
    color: '#444',
    fontStyle: 'italic',
  },
  row: { display: 'flex', alignItems: 'flex-start' },
  actions: { display: 'flex', gap: '10px' },
  cancelBtn: {
    flex: 1,
    padding: '11px',
    background: 'transparent',
    border: '1px solid #2a2a2a',
    color: '#aaa',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  applyBtn: {
    flex: 2,
    padding: '11px',
    background: 'linear-gradient(135deg, #00c6ff, #0072ff)',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    letterSpacing: '0.02em',
  },
}
