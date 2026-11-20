// ── Kitaplık menüsü ──────────────────────────────────────────────────────────
// Canvas tile ve Timeline ortak kullanır: kitaplıktaki bir deftere kart ekler, yeni defter
// oluşturur, defteri düzenler. Ad, renk ve kategori deftere aittir (kitaplık), karta değil.
import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { useLibrary, refreshLibrary, libKey, KIND_LABEL } from '../notebook/libraryShelf'
import { createLibraryBook, editLibraryBook, libraryMeta } from '../notebook/libraryForm'
import { bookColorOf } from '../../pages/library/theme.js'
import { stopEvt } from './canvasUtils'

const FONT_UI = "'DM Sans', system-ui, sans-serif"
const FONT_DISPLAY = "'Fraunces', Georgia, serif"
const PAPER = '#f7f2e4'

// ── Menü ─────────────────────────────────────────────────────────────────────
// Kitaplığın (ana sayfa) defterleri, kategorilerine göre (new-defter-system). Eski oda /
// bağımsız defterler kaldırıldı.
// u: ölçek (canvas tile 2 — 1920 px'lik yüzeyde okunur kalsın; timeline 1).
// onPick(meta) seçilen deftere kart ekler (meta.lib = true, key 'lib:<id>'). "+ Yeni defter" ve
// satırdaki ✎ kitaplığın formunu oyunun içinde açar (libraryForm.js); oluşturulan defter de onPick'le
// karta dönüşür. Form açılınca menü (ör. timeline popover'ı) kapansa da söz çağıranın kapanışıyla çözülür.
export function NotebookShelfMenu({ u = 1, style, onPick }) {
  const { books, categories, state } = useLibrary()
  const held = useStore(st => st.heldNotebook)
  const [busy, setBusy] = useState(false)

  useEffect(() => { refreshLibrary() }, [])

  const pick = (b) => onPick(libraryMeta(b))
  const create = async () => {
    if (busy) return
    setBusy(true)
    try {
      const meta = await createLibraryBook()
      if (meta) onPick(meta)
    } finally { setBusy(false) }
  }
  const heldBook = books.find(b => libKey(b.id) === held)
  const known = new Set(categories.map(c => c.id))
  const groups = categories
    .map(c => ({ id: c.id, name: c.name, books: books.filter(b => b.category_id === c.id) }))
    .filter(g => g.books.length)
  // Kategorisi listede olmayan defter (ör. bu arada silinen kategori) en sonda
  const orphans = books.filter(b => !known.has(b.category_id))
  if (orphans.length) groups.push({ id: 'other', name: 'Diğer', books: orphans })

  const row = (b, pinned = false) => {
    const color = bookColorOf(b.color)
    const sub = pinned ? 'elinde' : [KIND_LABEL[b.kind] ?? 'Defter', b.year].filter(Boolean).join(' · ')
    return (
      <div key={`${pinned ? 'held' : 'b'}-${b.id}`} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(247,242,228,0.07)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <button type="button" title="Canvas'a kart olarak ekle" onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); pick(b) }}
        style={{ display: 'flex', alignItems: 'center', gap: 12 * u, flex: 1, minWidth: 0, padding: `${8 * u}px ${4 * u}px ${8 * u}px ${12 * u}px`, background: 'transparent',
          border: 0, cursor: 'pointer', textAlign: 'left', color: PAPER }}>
        <span style={{ position: 'relative', width: 24 * u, height: 32 * u, flexShrink: 0, overflow: 'hidden',
          borderRadius: b.binding === 'file' ? 2 * u : `${2 * u}px ${4 * u}px ${4 * u}px ${2 * u}px`, background: color.cover,
          boxShadow: `inset ${3 * u}px 0 0 rgba(0,0,0,0.3)` }}>
          {b.binding !== 'file' && <span style={{ position: 'absolute', top: 0, bottom: 0, right: 4 * u, width: 2 * u, background: color.band }} />}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', font: `italic 200 ${17 * u}px/1.15 ${FONT_DISPLAY}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
          <span style={{ display: 'block', font: `800 ${9 * u}px ${FONT_UI}`, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: pinned ? '#f4d35e' : 'rgba(247,242,228,0.45)', marginTop: 3 * u }}>{sub}</span>
        </span>
      </button>
      <button type="button" aria-label={`${b.title} — düzenle`} title="Defteri düzenle (ad, renk, kategori)"
        onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); editLibraryBook(b.id) }}
        style={{ width: 40 * u, flexShrink: 0, border: 0, background: 'transparent', color: 'rgba(247,242,228,0.5)', cursor: 'pointer',
          font: `200 ${16 * u}px ${FONT_UI}` }}
        onMouseEnter={e => { e.currentTarget.style.color = PAPER }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(247,242,228,0.5)' }}>
        ✎
      </button>
      </div>
    )
  }
  const head = (text) => (
    <div style={{ padding: `${10 * u}px ${12 * u}px ${4 * u}px`, font: `800 ${9 * u}px ${FONT_UI}`, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(247,242,228,0.4)' }}>{text}</div>
  )

  return (
    <div onMouseDown={stopEvt} onClick={stopEvt} onWheel={(e) => e.stopPropagation()}
      style={{ width: 360 * u, background: 'rgba(14,14,17,0.97)', border: '1px solid rgba(247,242,228,0.14)', borderRadius: 10 * u,
        boxShadow: '0 18px 40px -18px rgba(0,0,0,0.8)', overflow: 'hidden', fontFamily: FONT_UI, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 * u, padding: `${12 * u}px ${12 * u}px`, borderBottom: '1px solid rgba(247,242,228,0.1)' }}>
        <span style={{ flex: 1, font: `italic 200 ${22 * u}px ${FONT_DISPLAY}`, color: PAPER }}>Kitaplık</span>
        <a href="/" target="_blank" rel="noopener" onMouseDown={stopEvt} onClick={stopEvt} title="Kitaplığı yeni sekmede aç" aria-label="Kitaplığı yeni sekmede aç"
          style={{ padding: `${7 * u}px ${9 * u}px`, borderRadius: 4 * u, border: '1px solid rgba(247,242,228,0.2)', color: 'rgba(247,242,228,0.8)',
            textDecoration: 'none', font: `800 ${10 * u}px ${FONT_UI}` }}>
          ↗
        </a>
        <button type="button" disabled={busy} onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); create() }}
          style={{ padding: `${7 * u}px ${12 * u}px`, borderRadius: 4 * u, border: 0, background: PAPER, color: '#1b1a18', cursor: busy ? 'progress' : 'pointer',
            font: `800 ${10 * u}px ${FONT_UI}`, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          + Yeni defter
        </button>
      </div>
      <div style={{ maxHeight: 380 * u, overflowY: 'auto' }}>
        {heldBook && row(heldBook, true)}
        {groups.map(g => <div key={g.id}>{head(g.name)}{g.books.map(b => row(b))}</div>)}
        {state === 'ready' && !books.length && (
          <div style={{ padding: 18 * u, font: `200 ${13 * u}px ${FONT_UI}`, color: 'rgba(247,242,228,0.55)', textAlign: 'center' }}>
            Kitaplıkta henüz defter yok
          </div>
        )}
        {state !== 'ready' && !books.length && (
          <div style={{ padding: 18 * u, font: `200 ${13 * u}px ${FONT_UI}`, color: 'rgba(247,242,228,0.55)', textAlign: 'center' }}>
            {state === 'error' ? 'Kitaplık yüklenemedi' : 'yükleniyor…'}
          </div>
        )}
      </div>
    </div>
  )
}
