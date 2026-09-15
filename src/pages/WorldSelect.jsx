import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// Boş = relative istekler. Dev'de Vite /api'yi backend'e proxy'ler ve /uploads'ı
// public/ üzerinden sunar; production'da backend aynı origin'den her ikisini sunar.
// VITE_API_URL ile ayrı bir origin'e (ör. farklı porttaki backend) yönlendirilebilir.
const API = import.meta.env.VITE_API_URL ?? ''

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #ff9500 0%, #ff6000 100%)',
  'linear-gradient(135deg, #0ba360 0%, #3cba92 100%)',
]

function hashIndex(str, len) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % len
}

// Daraltılmış filtre çubuğunda gösterilecek etiket sayısı (seçili olanlar her zaman görünür).
const TAG_PREVIEW_LIMIT = 12

function roomTagNames(ctx) {
  return (ctx.categories ?? []).map(c => c.name)
}

// ─── Tag Filter Bar ───────────────────────────────────────────────────────────
function TagFilterBar({
  tags, activeTags, matchAll, totalCount, visibleCount, allCount,
  onToggle, onClear, onMatchAllChange,
}) {
  const [expanded, setExpanded] = useState(false)

  const shownTags = expanded
    ? tags
    : tags.filter((t, i) => i < TAG_PREVIEW_LIMIT || activeTags.includes(t.name))
  const hiddenCount = tags.length - shownTags.length
  const hasSelection = activeTags.length > 0

  return (
    <div className="tag-filter">
      <div className="tag-filter__inner">
        <div className="tag-filter__chips" role="group" aria-label="Etikete göre filtrele">
          <button
            type="button"
            className="tag-chip tag-chip--all"
            aria-pressed={!hasSelection}
            onClick={onClear}
          >
            Tümü
            <span className="tag-chip__count">{allCount}</span>
          </button>

          <span className="tag-filter__divider" aria-hidden="true" />

          {shownTags.map(tag => {
            const selected = activeTags.includes(tag.name)
            return (
              <button
                key={tag.name}
                type="button"
                className="tag-chip"
                aria-pressed={selected}
                data-empty={!selected && tag.count === 0}
                onClick={() => onToggle(tag.name)}
              >
                {selected && <span className="tag-chip__check" aria-hidden="true">✓</span>}
                {tag.name}
                <span className="tag-chip__count">{tag.count}</span>
              </button>
            )
          })}

          {(hiddenCount > 0 || expanded) && tags.length > TAG_PREVIEW_LIMIT && (
            <button
              type="button"
              className="tag-filter__more"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? 'Daha az göster' : `+${hiddenCount} etiket daha`}
            </button>
          )}
        </div>

        <div className="tag-filter__meta">
          <span className="tag-filter__result">
            <strong>{visibleCount}</strong>
            {visibleCount === totalCount ? ' oda' : ` / ${totalCount} oda`}
          </span>

          {activeTags.length >= 2 && (
            <div className="tag-filter__mode" role="radiogroup" aria-label="Etiket eşleşme modu">
              <button
                type="button"
                role="radio"
                aria-checked={!matchAll}
                title="Seçili etiketlerden en az birine sahip odalar"
                onClick={() => onMatchAllChange(false)}
              >
                Herhangi biri
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={matchAll}
                title="Seçili etiketlerin hepsine sahip odalar"
                onClick={() => onMatchAllChange(true)}
              >
                Hepsi
              </button>
            </div>
          )}

          {hasSelection && (
            <button type="button" className="tag-filter__clear" onClick={onClear}>
              Temizle
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Card Menu (3 nokta) ──────────────────────────────────────────────────────
function CardMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    function close(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          background: 'rgba(0,0,0,0.55)',
          border: 'none',
          borderRadius: 8,
          color: '#ccc',
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 16,
          backdropFilter: 'blur(4px)',
          letterSpacing: 1,
        }}
      >
        ···
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 36,
          right: 0,
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 10,
          padding: 4,
          minWidth: 130,
          zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          <MenuItem
            icon="✎"
            label="Düzenle"
            onClick={() => { setOpen(false); onEdit() }}
          />
          <MenuItem
            icon="✕"
            label="Sil"
            danger
            onClick={() => { setOpen(false); onDelete() }}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, danger, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 12px',
        background: hov ? (danger ? 'rgba(255,80,80,0.12)' : 'rgba(255,255,255,0.06)') : 'none',
        border: 'none',
        borderRadius: 7,
        color: danger ? '#ff6060' : '#ccc',
        fontSize: 13,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span>
      {label}
    </button>
  )
}

// ─── Context Card ─────────────────────────────────────────────────────────────
function ContextCard({ ctx, activeTags, onTagClick, onPlay, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const gradient = GRADIENTS[hashIndex(ctx.id, GRADIENTS.length)]
  // Filtreyle eşleşen etiketler önde: kartın neden listelendiği ilk bakışta görünsün.
  const cardTags = [...(ctx.categories ?? [])].sort(
    (a, b) => activeTags.includes(b.name) - activeTags.includes(a.name)
  )

  return (
    <div
      style={{
        background: '#181818',
        border: `1px solid ${hovered ? '#ff9500' : '#2a2a2a'}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 40px rgba(255,149,0,0.18)' : '0 2px 12px rgba(0,0,0,0.4)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Kapak görseli */}
      <div style={{
        height: 180,
        background: ctx.coverImage
          ? `url("${ctx.coverImage.startsWith('http') ? ctx.coverImage : API + ctx.coverImage}") center/cover no-repeat`
          : gradient,
        position: 'relative',
        flexShrink: 0,
      }}>
        {/* Tip badge — sol üst */}
        <span style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(0,0,0,0.6)', color: '#aaa',
          fontSize: 11, padding: '3px 8px', borderRadius: 20,
          backdropFilter: 'blur(4px)', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          {ctx.roomType === 'cadde' ? 'Cadde' : 'Oda'}
        </span>

        {/* 3 nokta menü — sağ üst */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <CardMenu onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      {/* İçerik */}
      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
          {ctx.name}
        </h3>
        {cardTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cardTags.slice(0, 3).map(cat => (
              <button
                key={cat.id}
                type="button"
                className="card-tag"
                aria-pressed={activeTags.includes(cat.name)}
                title={activeTags.includes(cat.name) ? 'Filtreden çıkar' : 'Bu etikete göre filtrele'}
                onClick={() => onTagClick(cat.name)}
              >
                {cat.name}
              </button>
            ))}
            {cardTags.length > 3 && (
              <span style={{ color: '#555', fontSize: 11, padding: '2px 2px', alignSelf: 'center' }}>
                +{cardTags.length - 3}
              </span>
            )}
          </div>
        )}
        <div style={{ color: '#555', fontSize: 12, marginTop: 'auto' }}>
          {ctx.children && ctx.children.length > 0 ? `${ctx.children.length} alt oda` : 'Tek oda'}
        </div>
      </div>

      {/* Play butonu */}
      <div style={{ padding: '0 18px 18px' }}>
        <button
          onClick={() => onPlay(ctx)}
          style={{
            width: '100%', padding: '11px 0',
            background: 'linear-gradient(135deg, #ff9500, #ff6000)',
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          ▶ PLAY
        </button>
      </div>
    </div>
  )
}

// ─── Context Modal (Create + Edit) ───────────────────────────────────────────
function ContextModal({ onClose, onCreate, onUpdate, editCtx = null }) {
  const isEdit = !!editCtx

  const [name, setName] = useState(editCtx?.name ?? '')
  const [tags, setTags] = useState(editCtx?.categories?.map(c => c.name) ?? [])
  const [tagInput, setTagInput] = useState('')
  const [imagePreview, setImagePreview] = useState(() => {
    if (!editCtx?.coverImage) return null
    return editCtx.coverImage.startsWith('http')
      ? editCtx.coverImage
      : API + editCtx.coverImage
  })
  const [imageFile, setImageFile] = useState(null)
  const [imageUrl, setImageUrl] = useState(editCtx?.coverImage?.startsWith('http') ? editCtx.coverImage : '')
  const [urlInput, setUrlInput] = useState(editCtx?.coverImage?.startsWith('http') ? editCtx.coverImage : '')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dropRef = useRef()
  const fileRef = useRef()

  function addTag(raw) {
    const val = raw.trim().replace(/,+$/, '').trim()
    if (!val || tags.includes(val)) { setTagInput(''); return }
    setTags(prev => [...prev, val])
    setTagInput('')
  }

  function removeTag(tag) {
    setTags(prev => prev.filter(t => t !== tag))
  }

  function applyFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    setImageUrl('')
    setUrlInput('')
    const reader = new FileReader()
    reader.onload = e => {
      if (e.target.result) {
        setImagePreview(e.target.result)
        setError('')
      }
    }
    reader.onerror = () => setError('Resim yüklenemedi')
    reader.readAsDataURL(file)
  }

  function applyUrl(url) {
    if (!url.startsWith('http')) return
    setImageUrl(url)
    setImageFile(null)
    setImagePreview(url)
    setUrlInput(url)
  }

  useEffect(() => {
    function onPaste(e) {
      // İlk olarak files'ı check et (daha güvenilir)
      if (e.clipboardData?.files?.length > 0) {
        const file = e.clipboardData.files[0]
        if (file.type.startsWith('image/')) {
          applyFile(file)
          return
        }
      }

      // items üzerinde döngü
      const items = e.clipboardData?.items
      if (!items) {
        const text = e.clipboardData?.getData('text')
        if (text?.startsWith('http')) applyUrl(text)
        return
      }

      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            applyFile(file)
            return
          }
        }
      }

      // URL text'i try et
      const text = e.clipboardData.getData('text')
      if (text?.startsWith('http')) applyUrl(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    applyFile(e.dataTransfer.files[0])
  }

  async function resolveCoverImage() {
    if (imageFile) {
      const fd = new FormData()
      fd.append('file', imageFile)
      const res = await fetch(`${API}/api/upload-cover`, { method: 'POST', body: fd })
      const data = await res.json()
      return data.url
    }
    if (imageUrl) return imageUrl
    if (!imagePreview && editCtx?.coverImage) return null  // kullanıcı görseli kaldırdı
    return editCtx?.coverImage ?? null
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Oda adı gerekli'); return }
    setLoading(true)
    setError('')
    try {
      const coverImage = await resolveCoverImage()

      if (isEdit) {
        // Güncelle
        const res = await fetch(`${API}/api/rooms/${editCtx.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), categoryNames: tags, coverImage }),
        })
        const updated = await res.json()
        if (!res.ok) throw new Error(updated.error || 'Güncellenemedi')
        onUpdate({ ...updated, coverImage })
      } else {
        // Yeni oluştur
        const res = await fetch(`${API}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), parentId: null, categoryNames: tags }),
        })
        const room = await res.json()
        if (!res.ok) throw new Error(room.error || 'Oluşturulamadı')

        if (coverImage) {
          await fetch(`${API}/api/rooms/${room.id}/cover-image`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coverImage }),
          })
          room.coverImage = coverImage
        }
        onCreate(room)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#111', border: '1px solid #2a2a2a', borderRadius: 20,
        padding: 32, width: 480, maxWidth: '94vw',
        display: 'flex', flexDirection: 'column', gap: 20,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff' }}>
            {isEdit ? 'Oda Düzenle' : 'Yeni Oda Oluştur'}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#666',
            fontSize: 22, cursor: 'pointer', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Görsel alanı */}
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>
            Kapak Görseli
          </label>
          <div
            ref={dropRef}
            onClick={() => !imagePreview && fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              height: 180, borderRadius: 12,
              border: `2px dashed ${dragOver ? '#ff9500' : imagePreview ? 'transparent' : '#333'}`,
              background: imagePreview
                ? `url("${imagePreview}") center/cover no-repeat #0a0a0a`
                : dragOver ? 'rgba(255,149,0,0.06)' : '#0a0a0a',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', cursor: imagePreview ? 'default' : 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {!imagePreview && (
              <>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🖼</div>
                <div style={{ color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
                  Tıkla veya sürükle<br />
                  <span style={{ color: '#444', fontSize: 12 }}>Ctrl+V ile yapıştır · URL yapıştır</span>
                </div>
              </>
            )}
            {imagePreview && (
              <button
                onClick={e => { e.stopPropagation(); setImagePreview(null); setImageFile(null); setImageUrl(''); setUrlInput('') }}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.7)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '4px 10px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Kaldır
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => applyFile(e.target.files[0])} />

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyUrl(urlInput)}
              placeholder="https://... URL yapıştır ve Enter"
              style={{
                flex: 1, background: '#0a0a0a', border: '1px solid #2a2a2a',
                borderRadius: 8, padding: '8px 12px', color: '#ccc', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => applyUrl(urlInput)}
              style={{
                background: '#1e1e1e', border: '1px solid #333', borderRadius: 8,
                color: '#ccc', fontSize: 13, padding: '0 14px', cursor: 'pointer',
              }}
            >Uygula</button>
          </div>
        </div>

        {/* Oda adı */}
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>
            Oda Adı
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Örn: Tasarım Dünyası, Geliştirme..."
            autoFocus
            style={{
              width: '100%', background: '#0a0a0a', border: '1px solid #2a2a2a',
              borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 15,
              outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = '#ff9500'}
            onBlur={e => e.target.style.borderColor = '#2a2a2a'}
          />
        </div>

        {/* Etiketler */}
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>
            Etiketler
          </label>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {tags.map(tag => (
                <span key={tag} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#0a0a0a', color: '#00f2ff', fontSize: 12,
                  padding: '3px 10px', borderRadius: 20, border: '1px solid #1a3a3a',
                }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} style={{
                    background: 'none', border: 'none', color: '#555',
                    cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0,
                  }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
              if (e.key === 'Backspace' && !tagInput && tags.length) removeTag(tags[tags.length - 1])
            }}
            onBlur={e => { e.target.style.borderColor = '#2a2a2a'; if (tagInput.trim()) addTag(tagInput) }}
            placeholder="Etiket yaz, Enter veya virgül ile ekle"
            style={{
              width: '100%', background: '#0a0a0a', border: '1px solid #2a2a2a',
              borderRadius: 10, padding: '10px 14px', color: '#ccc', fontSize: 14,
              outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = '#ff9500'}
          />
          <div style={{ fontSize: 11, color: '#444', marginTop: 5 }}>
            Enter veya virgül ile ekle · Backspace ile sonuncuyu sil
          </div>
        </div>

        {error && (
          <div style={{ color: '#ff7070', fontSize: 13, background: '#1a0a0a', padding: '10px 14px', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {/* Butonlar */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', background: '#1a1a1a', border: '1px solid #2a2a2a',
            borderRadius: 10, color: '#888', fontSize: 15, cursor: 'pointer',
          }}>
            İptal
          </button>
          <button onClick={handleSubmit} disabled={loading} style={{
            flex: 2, padding: '12px 0',
            background: loading ? '#553300' : 'linear-gradient(135deg, #ff9500, #ff6000)',
            border: 'none', borderRadius: 10, color: '#fff', fontSize: 15,
            fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? (isEdit ? 'Kaydediliyor...' : 'Oluşturuluyor...') : (isEdit ? 'Kaydet' : 'Oluştur')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ ctx, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/rooms/${ctx.id}?cascade=true`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Silinemedi')
      onDeleted(ctx.id)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#111', border: '1px solid #3a1a1a', borderRadius: 20,
        padding: 32, width: 400, maxWidth: '94vw',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#fff' }}>
            Oda Silinsin mi?
          </h2>
          <p style={{ margin: 0, color: '#888', fontSize: 14, lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>"{ctx.name}"</strong> ve tüm alt odaları
            kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>
        </div>

        {error && (
          <div style={{ color: '#ff7070', fontSize: 13, background: '#1a0a0a', padding: '10px 14px', borderRadius: 8, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', background: '#1a1a1a', border: '1px solid #2a2a2a',
            borderRadius: 10, color: '#888', fontSize: 15, cursor: 'pointer',
          }}>
            İptal
          </button>
          <button onClick={handleDelete} disabled={loading} style={{
            flex: 1, padding: '12px 0',
            background: loading ? '#3a0a0a' : 'linear-gradient(135deg, #ff4040, #cc2020)',
            border: 'none', borderRadius: 10, color: '#fff', fontSize: 15,
            fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Siliniyor...' : 'Evet, Sil'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WorldSelect() {
  const [contexts, setContexts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // null | 'create' | { mode:'edit', ctx } | { mode:'delete', ctx }
  const [searchQuery, setSearchQuery] = useState('')
  // Etiket filtresi URL'de tutulur (?tag=a&tag=b&match=all): oyundan geri dönünce
  // korunur ve filtrelenmiş görünüm link olarak paylaşılabilir.
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const matchAll = searchParams.get('match') === 'all'

  // Tüm etiketler, kullanım sıklığına göre (eşitlikte alfabetik) — sıra filtreyle değişmez.
  const allTags = useMemo(() => {
    const totals = new Map()
    for (const ctx of contexts) {
      for (const name of new Set(roomTagNames(ctx))) totals.set(name, (totals.get(name) ?? 0) + 1)
    }
    return [...totals]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'tr'))
  }, [contexts])

  // Artık hiçbir odada bulunmayan etiketler (ör. düzenlemede silinmiş) seçimden düşer.
  const activeTags = useMemo(() => {
    const existing = new Set(allTags.map(t => t.name))
    return [...new Set(searchParams.getAll('tag'))].filter(t => existing.has(t))
  }, [searchParams, allTags])

  const searchedRooms = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr')
    if (!q) return contexts
    return contexts.filter(ctx =>
      ctx.name.toLocaleLowerCase('tr').includes(q) ||
      roomTagNames(ctx).some(name => name.toLocaleLowerCase('tr').includes(q))
    )
  }, [contexts, searchQuery])

  const visibleRooms = useMemo(() => {
    if (activeTags.length === 0) return searchedRooms
    return searchedRooms.filter(ctx => {
      const names = new Set(roomTagNames(ctx))
      return matchAll ? activeTags.every(t => names.has(t)) : activeTags.some(t => names.has(t))
    })
  }, [searchedRooms, activeTags, matchAll])

  // Her etiketin sayısı = o etiket seçilirse listede kaç oda olacağı.
  // "Hepsi" modunda mevcut sonuç daraltılır; "Herhangi biri" modunda aramaya uyan
  // odalardan o etikete sahip olanlar eklenir.
  const tagFacets = useMemo(() => {
    const pool = matchAll && activeTags.length > 0 ? visibleRooms : searchedRooms
    const counts = new Map()
    for (const ctx of pool) {
      for (const name of new Set(roomTagNames(ctx))) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return allTags.map(t => ({ name: t.name, count: counts.get(t.name) ?? 0 }))
  }, [allTags, activeTags, matchAll, searchedRooms, visibleRooms])

  function writeFilter(tags, nextMatchAll) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('tag')
      next.delete('match')
      tags.forEach(t => next.append('tag', t))
      if (tags.length > 0 && nextMatchAll) next.set('match', 'all')
      return next
    }, { replace: true })
  }

  function toggleTag(name) {
    writeFilter(
      activeTags.includes(name) ? activeTags.filter(t => t !== name) : [...activeTags, name],
      matchAll
    )
  }

  function clearTags() {
    writeFilter([], false)
  }

  useEffect(() => {
    fetch(`${API}/api/rooms`)
      .then(r => r.json())
      .then(data => { setContexts(data.filter(r => r.parent === null)); setLoading(false) })
      .catch(() => { setError('Odalar yüklenemedi'); setLoading(false) })
  }, [])

  function handlePlay(ctx) {
    localStorage.setItem('lastRoomId', ctx.id)
    localStorage.setItem('lastRoomName', ctx.name)
    navigate('/game')
  }

  function handleCreated(room) {
    setContexts(prev => [{ ...room, categories: room.categories ?? [], children: room.children ?? [] }, ...prev])
    setModal(null)
  }

  function handleUpdated(updated) {
    setContexts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    setModal(null)
  }

  function handleDeleted(id) {
    setContexts(prev => prev.filter(c => c.id !== id))
    setModal(null)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#050505',
      color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Navbar */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 64, background: '#0a0a0a',
        borderBottom: '1px solid #1e1e1e', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #ff9500, #ff6000)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 900, color: '#fff',
          }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.5 }}>Focus Room</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Oda veya etiket ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: '#0a0a0a',
                border: 'none',
                borderRadius: '20px',
                padding: '10px 20px 10px 42px',
                color: '#fff',
                fontSize: '14px',
                width: '260px',
                outline: 'none',
                boxShadow: 'inset 3px 3px 6px rgba(0,0,0, 0.8), inset -3px -3px 6px rgba(255,255,255, 0.03)',
                transition: 'box-shadow 0.3s ease',
              }}
              onFocus={e => e.target.style.boxShadow = 'inset 4px 4px 8px rgba(0,0,0, 0.9), inset -4px -4px 8px rgba(255,255,255, 0.05)'}
              onBlur={e => e.target.style.boxShadow = 'inset 3px 3px 6px rgba(0,0,0, 0.8), inset -3px -3px 6px rgba(255,255,255, 0.03)'}
            />
            <span style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#555',
              fontSize: '14px',
              pointerEvents: 'none'
            }}>
              🔍
            </span>
          </div>
          <button
            onClick={() => setModal('create')}
            style={{
              padding: '8px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, #ff9500, #ff6000)',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', letterSpacing: 0.3,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            + Oda Oluştur
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ padding: '60px 40px 40px', textAlign: 'center' }}>
        <h1 style={{
          margin: '0 0 12px', fontSize: 42, fontWeight: 900,
          background: 'linear-gradient(135deg, #fff 0%, #888 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text', letterSpacing: -1,
        }}>
          Bir Oda Seç
        </h1>
        <p style={{ margin: 0, color: '#555', fontSize: 16 }}>
          Keşfetmek istediğin odaya gir
        </p>
      </div>

      {/* Etiket filtresi */}
      {!loading && !error && allTags.length > 0 && (
        <TagFilterBar
          tags={tagFacets}
          activeTags={activeTags}
          matchAll={matchAll}
          allCount={searchedRooms.length}
          totalCount={contexts.length}
          visibleCount={visibleRooms.length}
          onToggle={toggleTag}
          onClear={clearTags}
          onMatchAllChange={value => writeFilter(activeTags, value)}
        />
      )}

      {/* Grid */}
      <div style={{ padding: '0 40px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#444', padding: '80px 0', fontSize: 16 }}>
            Yükleniyor...
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', color: '#ff7070', padding: '80px 0', fontSize: 16 }}>
            {error}
          </div>
        )}
        {!loading && !error && contexts.length === 0 && (
          <div style={{ textAlign: 'center', color: '#444', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
            <div style={{ fontSize: 16, marginBottom: 20 }}>Henüz oda yok</div>
            <button onClick={() => setModal('create')} style={{
              padding: '12px 28px', background: 'linear-gradient(135deg, #ff9500, #ff6000)',
              border: 'none', borderRadius: 12, color: '#fff', fontSize: 15,
              fontWeight: 700, cursor: 'pointer',
            }}>+ İlk Odayı Oluştur</button>
          </div>
        )}
        {!loading && !error && contexts.length > 0 && visibleRooms.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', padding: '80px 0' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#888', marginBottom: 8 }}>
              Eşleşen oda bulunamadı
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              {activeTags.length > 0
                ? 'Seçili etiketleri azaltmayı ya da eşleşme modunu değiştirmeyi dene.'
                : 'Farklı bir arama terimi dene.'}
            </div>
            {activeTags.length > 0 && (
              <button type="button" className="tag-filter__clear" onClick={clearTags}>
                Etiket filtresini temizle
              </button>
            )}
          </div>
        )}
        {!loading && !error && visibleRooms.length > 0 && (
          <div className="context-grid">
            {/* API odaları lastActiveAt desc döndürür (en son aktif olan başta),
                bu yüzden burada ekstra sıralama/ters çevirme yok. */}
            {visibleRooms.map(ctx => (
              <ContextCard
                key={ctx.id}
                ctx={ctx}
                activeTags={activeTags}
                onTagClick={toggleTag}
                onPlay={handlePlay}
                onEdit={() => setModal({ mode: 'edit', ctx })}
                onDelete={() => setModal({ mode: 'delete', ctx })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modallar */}
      {modal === 'create' && (
        <ContextModal onClose={() => setModal(null)} onCreate={handleCreated} onUpdate={() => {}} />
      )}
      {modal?.mode === 'edit' && (
        <ContextModal
          onClose={() => setModal(null)}
          onCreate={() => {}}
          onUpdate={handleUpdated}
          editCtx={modal.ctx}
        />
      )}
      {modal?.mode === 'delete' && (
        <DeleteConfirmModal
          ctx={modal.ctx}
          onClose={() => setModal(null)}
          onDeleted={handleDeleted}
        />
      )}

      <style>{`
        .context-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 24px;
          max-width: 1800px;
          margin: 0 auto;
        }
        @media (max-width: 1200px) { .context-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 950px)  { .context-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 700px)  { .context-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px)  { .context-grid { grid-template-columns: 1fr; } }

        .tag-filter {
          position: sticky; top: 64px; z-index: 90;
          padding: 14px 40px; margin-bottom: 28px;
          background: rgba(5,5,5,0.86);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid #161616;
        }
        .tag-filter__inner {
          max-width: 1800px; margin: 0 auto;
          display: flex; align-items: flex-start; justify-content: space-between; gap: 20px;
        }
        .tag-filter__chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
        .tag-filter__divider { width: 1px; height: 20px; background: #262626; margin: 0 4px; }

        .tag-chip {
          display: inline-flex; align-items: center; gap: 7px;
          height: 32px; padding: 0 8px 0 13px;
          background: #0e0e0e; color: #aaa;
          border: 1px solid #242424; border-radius: 999px;
          font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;
        }
        .tag-chip:hover { border-color: #3a3a3a; color: #eee; background: #141414; }
        .tag-chip[aria-pressed="true"] {
          background: rgba(255,149,0,0.12); border-color: rgba(255,149,0,0.55); color: #ffb54d;
        }
        .tag-chip--all[aria-pressed="true"] { background: #f2f2f2; border-color: #f2f2f2; color: #0a0a0a; }
        .tag-chip[data-empty="true"] { opacity: 0.38; }
        .tag-chip[data-empty="true"]:hover { opacity: 0.7; }
        .tag-chip__check { font-size: 11px; font-weight: 800; }
        .tag-chip__count {
          min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 999px; background: rgba(255,255,255,0.06);
          font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: #777;
        }
        .tag-chip[aria-pressed="true"] .tag-chip__count { background: rgba(255,149,0,0.18); color: #ffb54d; }
        .tag-chip--all[aria-pressed="true"] .tag-chip__count { background: rgba(0,0,0,0.1); color: #333; }

        .tag-filter__more {
          height: 32px; padding: 0 10px; background: none; border: none;
          color: #777; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .tag-filter__more:hover { color: #ff9500; }

        .tag-filter__meta { display: flex; align-items: center; gap: 12px; flex-shrink: 0; min-height: 32px; }
        .tag-filter__result { color: #666; font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .tag-filter__result strong { color: #ddd; font-weight: 800; }

        .tag-filter__mode { display: inline-flex; padding: 3px; background: #0e0e0e; border: 1px solid #242424; border-radius: 999px; }
        .tag-filter__mode button {
          height: 24px; padding: 0 11px; border: none; border-radius: 999px;
          background: none; color: #777; font: inherit; font-size: 12px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
        }
        .tag-filter__mode button:hover { color: #ddd; }
        .tag-filter__mode button[aria-checked="true"] { background: #262626; color: #fff; }

        .tag-filter__clear {
          height: 30px; padding: 0 14px; background: none;
          border: 1px solid #2a2a2a; border-radius: 999px;
          color: #aaa; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .tag-filter__clear:hover { border-color: #ff9500; color: #ff9500; }

        .card-tag {
          background: #0a0a0a; color: #00f2ff; font: inherit; font-size: 11px;
          padding: 2px 8px; border-radius: 20px; border: 1px solid #1a3a3a; cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .card-tag:hover { border-color: #00f2ff; }
        .card-tag[aria-pressed="true"] {
          background: rgba(255,149,0,0.12); border-color: rgba(255,149,0,0.55); color: #ffb54d;
        }

        .tag-chip:focus-visible, .tag-filter__more:focus-visible, .tag-filter__mode button:focus-visible,
        .tag-filter__clear:focus-visible, .card-tag:focus-visible {
          outline: 2px solid #ff9500; outline-offset: 2px;
        }

        @media (max-width: 950px) {
          .tag-filter { padding: 12px 20px; }
          .tag-filter__inner { flex-direction: column; gap: 10px; }
        }
      `}</style>
    </div>
  )
}
