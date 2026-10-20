// ── Not balonu düzenleyicisi ─────────────────────────────────────────────────
// Timeline ve canvas tile ortak modal. Taslak üzerinde çalışır; Kaydet / ESC /
// dışarı tıklama taslağı yazar, İptal atar. body'ye portal ile render edilir.
// Klavye: ESC ve Ctrl+Enter window capture'da yakalanır → alttaki yüzeyin
// (canvas edit modu, timeline) document dinleyicilerine ulaşmaz.
import { useState, useEffect, useRef, useMemo, useEffectEvent } from 'react'
import { createPortal } from 'react-dom'
import { parseMd } from '../../utils/markdownRender'
import { pasteRichTextAsMarkdown } from '../../utils/richTextToMarkdown'
import { NOTE_STATUSES, isValidStamp, hasTime, stampValue, stampFromValue, sanitizeNote, todayIso } from '../../utils/timelineModel'
import { uploadImageFile, isImageFile, fetchLinkMeta, saveImageItem, urlsToViewerImages } from './canvasUtils'
import { ImageViewer } from './ImageViewer'

const FONT_UI = "'DM Sans', system-ui, sans-serif"
const FONT_DISPLAY = "'Fraunces', Georgia, serif"
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"
const Z = 2147483640   // canvas tam ekranın (…600) üstünde, resim görüntüleyicinin (…646) altında

if (typeof document !== 'undefined') {
  const s = document.getElementById('tl-ne-styles') || document.createElement('style')
  s.id = 'tl-ne-styles'
  s.textContent = `
    .tl-ne-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 26px; }
    @media (max-width: 780px) { .tl-ne-grid { grid-template-columns: minmax(0, 1fr); } }
    .tl-ne input, .tl-ne textarea, .tl-ne button { font-family: ${FONT_UI}; }
    .tl-ne input::placeholder, .tl-ne textarea::placeholder { color: rgba(236,233,244,0.3); }
    .tl-ne input[type=date] { color-scheme: dark; }
    .tl-ne-field:focus { border-color: rgba(129,140,248,0.7) !important; }
    .tl-ne-thumb:hover .tl-ne-thumb-acts { opacity: 1; }
  `
  document.head.appendChild(s)
}

const label = { display: 'block', font: `800 11px ${FONT_UI}`, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(236,233,244,0.5)', margin: '0 0 8px' }
const field = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, color: '#ece9f4', font: `300 15px ${FONT_UI}`, padding: '10px 12px', outline: 'none' }
const chipBtn = (on, color = '#818cf8') => ({ padding: '8px 12px', borderRadius: 999, border: `1px solid ${on ? color : 'rgba(255,255,255,0.12)'}`, background: on ? `${color}24` : 'transparent', color: on ? color : 'rgba(236,233,244,0.65)', font: `800 12px ${FONT_UI}`, cursor: 'pointer', whiteSpace: 'nowrap' })
const ghostBtn = { padding: '9px 14px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: '#ece9f4', font: `800 13px ${FONT_UI}`, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn = { width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(8,8,14,0.82)', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }

export function NoteEditor({ note, uploadKey, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...note, start: note.start || todayIso() }))
  const [hasEnd, setHasEnd] = useState(!!note.end)
  const [timeOn, setTimeOn] = useState(hasTime(note.start))   // saatli not (gün görünümü)
  const [preview, setPreview] = useState(false)
  const [tagText, setTagText] = useState('')
  const [urlText, setUrlText] = useState(note.link?.kind === 'url' ? note.link.url : '')
  const [imgUrlText, setImgUrlText] = useState('')
  const [linkKind, setLinkKind] = useState(note.link?.kind || 'none')
  const [roomQuery, setRoomQuery] = useState('')
  const [rooms, setRooms] = useState(null)
  const [busy, setBusy] = useState(0)          // süren yükleme sayısı
  const [msg, setMsg] = useState('')
  const [viewerIdx, setViewerIdx] = useState(-1)
  const fileRef = useRef(null)

  const set = (patch) => setDraft(d => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }))
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2600) }

  const save = () => onSave(sanitizeNote({ ...draft, end: hasEnd ? draft.end : null }))

  // ESC = kaydet ve kapat, Ctrl/Cmd+Enter = kaydet. Resim görüntüleyici açıkken ESC onun.
  const onWindowKey = useEffectEvent((e) => {
    if (viewerIdx >= 0) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); save(); return }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); save() }
  })
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    const onKey = (e) => onWindowKey(e)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Oda listesi yalnızca "Oda" bağlantısı seçilince yüklenir
  useEffect(() => {
    if (linkKind !== 'room' || rooms) return
    fetch('/api/rooms').then(r => r.json()).then(list => setRooms(Array.isArray(list) ? list : [])).catch(() => setRooms([]))
  }, [linkKind, rooms])

  const addImageFiles = async (files) => {
    const imgs = files.filter(isImageFile)
    if (!imgs.length) return false
    setBusy(b => b + 1)
    try {
      const res = await Promise.all(imgs.map(f => uploadImageFile(f, uploadKey).catch(() => null)))
      const ok = res.filter(Boolean).map(r => r.url)
      if (ok.length) set(d => ({ images: [...(d.images || []), ...ok] }))
      if (ok.length < imgs.length) flash(`${imgs.length - ok.length} resim yüklenemedi`)
    } finally { setBusy(b => b - 1) }
    return true
  }

  const onBodyPaste = (e) => {
    // Panoda resim dosyası varsa (ve biçimli metin yoksa) galeriye ekle
    const cd = e.clipboardData
    const hasHtml = [...(cd?.items || [])].some(it => it.type === 'text/html')
    const files = [...(cd?.files || [])]
    if (!hasHtml && files.some(isImageFile)) { e.preventDefault(); addImageFiles(files); return }
    pasteRichTextAsMarkdown(e)
  }

  // Modal herhangi bir yerine (alan dışı) resim yapıştırma
  const onRootPaste = (e) => {
    e.stopPropagation()
    const t = e.target
    if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
    const files = [...(e.clipboardData?.files || [])]
    if (files.some(isImageFile)) { e.preventDefault(); addImageFiles(files) }
  }

  const addImageUrl = () => {
    const u = imgUrlText.trim()
    // Yalnız harici adres: yerel /uploads yolu başka öğenin dosyasını paylaşırdı (silmede ikisi de gider)
    if (!/^https?:\/\//i.test(u)) { flash('Adres http:// veya https:// ile başlamalı'); return }
    set(d => ({ images: [...(d.images || []), u] }))
    setImgUrlText('')
  }

  const moveImage = (i, dir) => set(d => {
    const a = [...d.images]; const j = i + dir
    if (j < 0 || j >= a.length) return {}
    ;[a[i], a[j]] = [a[j], a[i]]
    return { images: a }
  })
  const removeImage = (i) => set(d => ({ images: d.images.filter((_, k) => k !== i) }))

  const addTag = (raw) => {
    const parts = raw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    if (!parts.length) return
    set(d => ({ tags: [...new Set([...(d.tags || []), ...parts])] }))
    setTagText('')
  }

  const fetchUrlLink = async () => {
    const u = urlText.trim()
    if (!/^https?:\/\//i.test(u)) { flash('Adres http:// veya https:// ile başlamalı'); return }
    setBusy(b => b + 1)
    try {
      const meta = await fetchLinkMeta(u)
      set({ link: { kind: 'url', url: u, ...meta } })
    } finally { setBusy(b => b - 1) }
  }

  const pickLinkKind = (k) => {
    setLinkKind(k)
    if (k === 'none') set({ link: null })
    if (k === 'url' && draft.link?.kind !== 'url') set({ link: null })
    if (k === 'room' && draft.link?.kind !== 'room') set({ link: null })
  }

  const filteredRooms = useMemo(() => {
    const q = roomQuery.trim().toLocaleLowerCase('tr')
    return (rooms || []).filter(r => !q || r.name.toLocaleLowerCase('tr').includes(q)).slice(0, 40)
  }, [rooms, roomQuery])

  // Tarih ve saat ayrı alanlarda düzenlenir, damga olarak birleşir ('YYYY-MM-DD' | 'YYYY-MM-DDTHH:MM')
  const datePart = (s) => (s || '').slice(0, 10)
  const timePart = (s, def) => (hasTime(s) ? s.slice(11) : def)
  const join = (date, time) => (timeOn && date ? `${date}T${time}` : date)
  const toggleTime = (on) => {
    setTimeOn(on)
    set(d => {
      const sd = datePart(d.start)
      if (!on) return { start: sd, end: d.end ? datePart(d.end) : d.end }
      const start = `${sd}T${timePart(d.start, '09:00')}`
      const end = d.end ? `${datePart(d.end)}T${timePart(d.end, '10:00')}` : d.end
      return { start, end }
    })
  }
  const enableEnd = (on) => {
    setHasEnd(on)
    if (!on || draft.end) return
    // varsayılan bitiş: saatliyse 1 saat sonra, değilse aynı gün
    set(d => ({ end: timeOn && isValidStamp(d.start) ? stampFromValue(stampValue(d.start) + 1 / 24, true) : datePart(d.start) }))
  }

  const startOk = isValidStamp(draft.start)
  // sanitize bitişi düşürecekse (başlangıçtan önce / eşit) uyar — kural tek yerde
  const endInvalid = hasEnd && startOk && isValidStamp(draft.end) && sanitizeNote({ id: '', start: draft.start, end: draft.end }).end === null
  const images = draft.images || []
  const stop = (e) => e.stopPropagation()

  return createPortal(
    <div className="tl-ne"
      onMouseDown={(e) => { stop(e); if (e.target === e.currentTarget) save() }}
      onMouseUp={stop} onMouseMove={stop} onClick={stop} onDoubleClick={stop} onWheel={stop} onKeyDown={stop} onKeyUp={stop}
      onPaste={onRootPaste}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault() }}
      onDrop={(e) => { e.preventDefault(); stop(e); addImageFiles([...e.dataTransfer.files]) }}
      style={{ position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(5,5,10,0.74)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', pointerEvents: 'auto' }}>
      <div role="dialog" aria-label="Not balonu"
        style={{ width: 'min(960px, 100%)', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box', background: '#111118',
          border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)', color: '#ece9f4',
          fontFamily: FONT_UI, padding: '22px 26px 20px' }}>

        {/* Başlık satırı */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ font: `800 11px ${FONT_UI}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(236,233,244,0.45)' }}>Not balonu</span>
          {busy > 0 && <span style={{ font: `200 12px ${FONT_MONO}`, color: '#93c5fd' }}>⟳ yükleniyor…</span>}
          {msg && <span style={{ font: `200 12px ${FONT_MONO}`, color: '#fbbf24' }}>{msg}</span>}
          <span style={{ flex: 1 }} />
          <span style={{ font: `200 11px ${FONT_MONO}`, color: 'rgba(236,233,244,0.35)' }}>ESC kaydet · Ctrl+Enter</span>
          <button onClick={save} title="Kaydet ve kapat" style={{ ...iconBtn, width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', fontSize: 16 }}>✕</button>
        </div>

        <input className="tl-ne-field" autoFocus value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="Başlık"
          style={{ ...field, font: `800 30px/1.15 ${FONT_DISPLAY}`, letterSpacing: '-0.01em', padding: '8px 2px', background: 'transparent', borderWidth: '0 0 1px 0', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 0, marginBottom: 20 }} />

        <div className="tl-ne-grid">
          {/* ── Sol: durum, tarih, gövde ── */}
          <div style={{ minWidth: 0 }}>
            <span style={label}>Durum</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {NOTE_STATUSES.map(s => (
                <button key={s.id} onClick={() => set({ status: s.id })} style={chipBtn(draft.status === s.id, s.color)}>{s.label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ ...label, margin: 0 }}>Zaman</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => toggleTime(false)} style={{ ...chipBtn(!timeOn), padding: '4px 10px' }}>Bütün gün</button>
              <button onClick={() => toggleTime(true)} style={{ ...chipBtn(timeOn), padding: '4px 10px' }}>Saatli</button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
              <div style={{ flex: '1 1 170px' }}>
                <span style={label}>Başlangıç</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="tl-ne-field" type="date" value={datePart(draft.start)} onChange={e => set({ start: join(e.target.value, timePart(draft.start, '09:00')) })}
                    style={{ ...field, fontFamily: FONT_MONO, fontWeight: 200, minWidth: 0 }} />
                  {timeOn && (
                    <input className="tl-ne-field" type="time" step={900} value={timePart(draft.start, '09:00')} aria-label="Başlangıç saati"
                      onChange={e => e.target.value && set({ start: join(datePart(draft.start), e.target.value) })}
                      style={{ ...field, fontFamily: FONT_MONO, fontWeight: 200, width: 104, flexShrink: 0 }} />
                  )}
                </div>
              </div>
              <div style={{ flex: '1 1 170px' }}>
                <span style={label}>
                  <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={hasEnd} onChange={e => enableEnd(e.target.checked)} style={{ accentColor: '#818cf8' }} />
                    Bitiş
                  </label>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="tl-ne-field" type="date" disabled={!hasEnd} value={hasEnd ? datePart(draft.end) : ''} min={datePart(draft.start) || undefined}
                    onChange={e => set({ end: join(e.target.value, timePart(draft.end, '10:00')) })}
                    style={{ ...field, fontFamily: FONT_MONO, fontWeight: 200, minWidth: 0, opacity: hasEnd ? 1 : 0.4, borderColor: endInvalid ? '#f87171' : 'rgba(255,255,255,0.12)' }} />
                  {timeOn && (
                    <input className="tl-ne-field" type="time" step={900} disabled={!hasEnd} value={hasEnd ? timePart(draft.end, '10:00') : ''} aria-label="Bitiş saati"
                      onChange={e => e.target.value && set({ end: join(datePart(draft.end) || datePart(draft.start), e.target.value) })}
                      style={{ ...field, fontFamily: FONT_MONO, fontWeight: 200, width: 104, flexShrink: 0, opacity: hasEnd ? 1 : 0.4, borderColor: endInvalid ? '#f87171' : 'rgba(255,255,255,0.12)' }} />
                  )}
                </div>
              </div>
            </div>
            {!startOk && <div style={{ font: `300 12px ${FONT_UI}`, color: '#fbbf24', margin: '-10px 0 14px' }}>Tarihsiz not eksene bağlanmaz.</div>}
            {endInvalid && <div style={{ font: `300 12px ${FONT_UI}`, color: '#f87171', margin: '-10px 0 14px' }}>Bitiş başlangıçtan sonra olmalı — bitişsiz kaydedilir.</div>}

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ ...label, margin: 0 }}>Not</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setPreview(false)} style={{ ...chipBtn(!preview), padding: '4px 10px' }}>Yaz</button>
              <button onClick={() => setPreview(true)} style={{ ...chipBtn(preview), padding: '4px 10px', marginLeft: 6 }}>Önizle</button>
            </div>
            {preview ? (
              <div className="cvmd" style={{ ...field, minHeight: 260, maxHeight: 420, overflowY: 'auto', fontSize: 15, lineHeight: 1.55 }}
                dangerouslySetInnerHTML={{ __html: draft.body ? parseMd(draft.body, { newTabLinks: true }) : '<p style="opacity:.4">Boş</p>' }} />
            ) : (
              <textarea className="tl-ne-field" value={draft.body} onChange={e => set({ body: e.target.value })} onPaste={onBodyPaste}
                placeholder={'Ne yaptınız / ne planlıyorsunuz? Markdown desteklenir.\nBiçimli metin yapıştırınca Markdown\'a çevrilir; resim yapıştırınca galeriye eklenir.'}
                style={{ ...field, minHeight: 260, height: 300, resize: 'vertical', lineHeight: 1.55 }} />
            )}
          </div>

          {/* ── Sağ: resimler, etiketler, bağlantı ── */}
          <div style={{ minWidth: 0 }}>
            <span style={label}>Resimler {images.length > 0 && <span style={{ fontFamily: FONT_MONO, fontWeight: 200 }}>· {images.length}</span>}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, marginBottom: 10 }}>
              {images.map((u, i) => (
                <div key={`${i}:${u}`} className="tl-ne-thumb" style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', background: '#1d1d27',
                  outline: i === 0 ? '2px solid #818cf8' : 'none', outlineOffset: -2 }}>
                  <img src={u} alt="" referrerPolicy="no-referrer" draggable={false} onClick={() => setViewerIdx(i)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
                  {i === 0 && <span style={{ position: 'absolute', left: 6, top: 6, font: `800 9px ${FONT_UI}`, letterSpacing: '0.1em', textTransform: 'uppercase', background: '#818cf8', color: '#0b0b10', padding: '2px 6px', borderRadius: 999 }}>Kapak</span>}
                  <div className="tl-ne-thumb-acts" style={{ position: 'absolute', right: 4, bottom: 4, display: 'flex', gap: 3, opacity: 0, transition: 'opacity 120ms' }}>
                    {i > 0 && <button title="Öne al" onClick={() => moveImage(i, -1)} style={iconBtn}>←</button>}
                    {i < images.length - 1 && <button title="Arkaya al" onClick={() => moveImage(i, 1)} style={iconBtn}>→</button>}
                    <button title="Kaldır" onClick={() => removeImage(i)} style={{ ...iconBtn, background: 'rgba(220,38,38,0.9)' }}>×</button>
                  </div>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()}
                style={{ aspectRatio: '1 / 1', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.22)', background: 'transparent', color: 'rgba(236,233,244,0.6)',
                  font: `800 12px ${FONT_UI}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 200 }}>+</span>Ekle
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { const f = [...e.target.files]; e.target.value = ''; addImageFiles(f) }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input className="tl-ne-field" value={imgUrlText} onChange={e => setImgUrlText(e.target.value)} placeholder="veya resim adresi"
                onKeyDown={e => { if (e.key === 'Enter') addImageUrl() }} style={{ ...field, flex: 1, minWidth: 0 }} />
              <button onClick={addImageUrl} style={ghostBtn}>Ekle</button>
            </div>
            <div style={{ font: `200 11px ${FONT_MONO}`, color: 'rgba(236,233,244,0.35)', marginBottom: 20 }}>Sürükle-bırak ve Ctrl+V de çalışır · ilk resim kapak</div>

            <span style={label}>Etiketler</span>
            <div className="tl-ne-field" style={{ ...field, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '7px 8px', marginBottom: 20 }}>
              {(draft.tags || []).map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: `200 12px ${FONT_MONO}`, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 999, padding: '3px 4px 3px 9px' }}>
                  #{t}
                  <button onClick={() => set(d => ({ tags: d.tags.filter(x => x !== t) }))} style={{ border: 'none', background: 'none', color: 'rgba(236,233,244,0.6)', cursor: 'pointer', fontSize: 13, padding: '0 3px' }}>×</button>
                </span>
              ))}
              <input value={tagText} onChange={e => { const v = e.target.value; if (v.includes(',')) addTag(v); else setTagText(v) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag(tagText) }
                  else if (e.key === 'Backspace' && !tagText && draft.tags?.length) set(d => ({ tags: d.tags.slice(0, -1) }))
                }}
                onBlur={() => addTag(tagText)}
                placeholder={draft.tags?.length ? '' : 'etiket, Enter ile ekle'}
                style={{ flex: '1 1 90px', minWidth: 60, border: 'none', background: 'transparent', outline: 'none', color: '#ece9f4', font: `300 14px ${FONT_UI}`, padding: '3px 2px' }} />
            </div>

            <span style={label}>Bağlantı</span>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['none', 'Yok'], ['url', 'Web'], ['room', 'Oda']].map(([k, l]) => (
                <button key={k} onClick={() => pickLinkKind(k)} style={chipBtn(linkKind === k)}>{l}</button>
              ))}
            </div>
            {linkKind === 'url' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="tl-ne-field" value={urlText} onChange={e => setUrlText(e.target.value)} placeholder="https://…"
                    onKeyDown={e => { if (e.key === 'Enter') fetchUrlLink() }} style={{ ...field, flex: 1, minWidth: 0, fontFamily: FONT_MONO, fontWeight: 200, fontSize: 13 }} />
                  <button onClick={fetchUrlLink} style={ghostBtn}>Getir</button>
                </div>
                {draft.link?.kind === 'url' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                    {draft.link.thumbUrl && <img src={draft.link.thumbUrl} alt="" referrerPolicy="no-referrer" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: `800 13px ${FONT_UI}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{draft.link.title || draft.link.url}</div>
                      <div style={{ font: `200 11px ${FONT_MONO}`, opacity: 0.6 }}>{draft.link.siteName}</div>
                    </div>
                  </div>
                )}
              </>
            )}
            {linkKind === 'room' && (
              <>
                {draft.link?.kind === 'room' && (
                  <div style={{ font: `800 13px ${FONT_UI}`, color: '#c7d2fe', marginBottom: 8 }}>🏠 {draft.link.roomName}</div>
                )}
                <input className="tl-ne-field" value={roomQuery} onChange={e => setRoomQuery(e.target.value)} placeholder="Oda ara…" style={{ ...field, marginBottom: 6 }} />
                <div style={{ maxHeight: 168, overflowY: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                  {rooms === null && <div style={{ padding: 10, font: `200 12px ${FONT_MONO}`, opacity: 0.5 }}>yükleniyor…</div>}
                  {rooms && filteredRooms.length === 0 && <div style={{ padding: 10, font: `300 13px ${FONT_UI}`, opacity: 0.5 }}>Oda bulunamadı</div>}
                  {filteredRooms.map(r => {
                    const on = draft.link?.kind === 'room' && draft.link.roomId === r.id
                    return (
                      <button key={r.id} onClick={() => set({ link: { kind: 'room', roomId: r.id, roomName: r.name } })}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: on ? 'rgba(129,140,248,0.16)' : 'transparent', color: on ? '#c7d2fe' : '#ece9f4', font: `300 14px ${FONT_UI}`, cursor: 'pointer' }}>
                        🏠 {r.name}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Alt çubuk */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {onDelete && (
            <button onClick={() => { if (confirm('Bu not silinsin mi?')) onDelete() }}
              style={{ ...ghostBtn, color: '#f87171', borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)' }}>Sil</button>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtn}>Vazgeç</button>
          <button onClick={save} disabled={busy > 0}
            style={{ ...ghostBtn, background: '#818cf8', borderColor: '#818cf8', color: '#0b0b10', opacity: busy > 0 ? 0.5 : 1, cursor: busy > 0 ? 'progress' : 'pointer' }}>
            Kaydet
          </button>
        </div>
      </div>

      {viewerIdx >= 0 && images[viewerIdx] && (
        <ImageViewer ownKeys images={urlsToViewerImages(images)} index={viewerIdx}
          onStep={(d) => setViewerIdx(i => d === 'first' ? 0 : d === 'last' ? images.length - 1 : (i + d + images.length) % images.length)}
          onJump={setViewerIdx} onClose={() => setViewerIdx(-1)}
          onDownload={(it) => saveImageItem(it).catch(() => window.open(it.url, '_blank', 'noopener'))} />
      )}
    </div>,
    document.body
  )
}
