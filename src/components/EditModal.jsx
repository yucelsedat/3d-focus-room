import React, { useState } from 'react'
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

  const tileMedia = selectedTile ? worldMedia.filter(
    (m) => String(m.tileId) === String(selectedTile.id)
  ) : []

  React.useEffect(() => {
    const probeAspectRatio = (sourceUrl, type) => {
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
    } else if (url && url.length > 5 && url.startsWith('http')) {
      probeAspectRatio(url, activeTab)
    } else {
      setNaturalRatio(null)
    }
  }, [file, url, activeTab])

  const handleFileChange = (e) => {
    const f = e.target.files[0] || null
    setFile(f)
    if (f) setUrl('')
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
    if (!file && !url.trim()) {
      alert('Lütfen bir dosya seçin veya URL girin.')
      return
    }

    setLoading(true)
    setLoadingStep(file ? 'saving' : 'downloading')

    try {
      let resolvedUrl = url.trim()
      let resolvedType = activeTab

      // Download external URL server-side to avoid CORS
      if (!file && resolvedUrl) {
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
              <div key={m.id} style={s.mediaItem}>
                <div style={{ flex: 1, marginRight: '10px' }}>
                  <span style={s.mediaItemLabel}>
                    {m.type === 'video' ? '🎬' : '🖼'} {(m.url || '').split('/').pop()}
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
                <button style={s.deleteBtn} onClick={() => handleDelete(m.id)}>
                  Sil
                </button>
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
        </div>

        {/* Form */}
        <div style={s.form}>

          {/* URL input */}
          <div style={s.inputGroup}>
            <label style={s.label}>
              {activeTab === 'image' ? 'Resim Linki' : 'Video Linki'}
            </label>
            <input
              style={{ ...s.input, opacity: file ? 0.4 : 1 }}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                activeTab === 'image'
                  ? 'https://example.com/image.jpg'
                  : 'https://example.com/video.mp4'
              }
              disabled={!!file}
            />
            {file && <p style={s.note}>URL devre dışı — dosya seçildi</p>}
          </div>

          {/* File input */}
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

          {/* Size inputs */}
          <div style={s.row}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Genişlik (tile)</label>
              <input
                style={s.input}
                type="number"
                min="0.1"
                step="0.1"
                value={width}
                onChange={(e) => handleWidthChange(e.target.value)}
              />
            </div>
            <div style={{ width: 12 }} />
            <div style={{ flex: 1 }}>
              <label style={s.label}>Yükseklik (tile) {naturalRatio ? '🔗' : ''}</label>
              <input
                style={s.input}
                type="number"
                min="0.1"
                step="0.1"
                value={height}
                onChange={(e) => handleHeightChange(e.target.value)}
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
    width: '460px',
    maxHeight: '88vh',
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
