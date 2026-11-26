// ── Kitaplık menüsü ──────────────────────────────────────────────────────────
// Canvas tile ve Timeline ortak kullanır: kitaplıktaki bir deftere kart ekler, yeni defter
// oluşturur, defteri düzenler. Ad, renk ve kategori deftere aittir (kitaplık), karta değil.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { useLibrary, refreshLibrary, libKey, KIND_LABEL } from '../notebook/libraryShelf'
import { createLibraryBook, editLibraryBook, libraryMeta } from '../notebook/libraryForm'
import { bookColorOf } from '../../pages/library/theme.js'
import { stopEvt, searchByName } from './canvasUtils'

const FONT_UI = "'DM Sans', system-ui, sans-serif"
const FONT_DISPLAY = "'Fraunces', Georgia, serif"
const PAPER = '#f7f2e4'

// ── Menü ─────────────────────────────────────────────────────────────────────
// Kitaplığın (/kitaplik) defterleri, kategorilerine göre (new-defter-system). Eski oda /
// bağımsız defterler kaldırıldı.
// u: ölçek (canvas tile 2 — 1920 px'lik yüzeyde okunur kalsın; timeline 1).
// onPick(meta) seçilen deftere kart ekler (meta.lib = true, key 'lib:<id>'). "+ Yeni defter" ve
// satırdaki ✎ kitaplığın formunu oyunun içinde açar (libraryForm.js); oluşturulan defter de onPick'le
// karta dönüşür. Form açılınca menü (ör. timeline popover'ı) kapansa da söz çağıranın kapanışıyla çözülür.
// Üstteki arama kutusu (oda aramasıyla aynı davranış): eşleşenler benzerliğe göre sıralanır; yazılan ad
// birebir bir defter değilse listenin başında vurgulu "oluştur ve ekle" durur — Enter formu o adla açar.
// ↑/↓ satırlar arasında gezer, Enter vurgulu satırı seçer.
// pickTitle: satırın ipucu (medya modalında "Duvara defter olarak ekle")
export function NotebookShelfMenu({ u = 1, style, onPick, pickTitle = "Canvas'a kart olarak ekle" }) {
  const { books, categories, state } = useLibrary()
  const held = useStore(st => st.heldNotebook)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const listRef = useRef(null)

  useEffect(() => { refreshLibrary() }, [])

  const pick = (b) => onPick(libraryMeta(b))
  const create = async (title) => {
    if (busy) return
    setBusy(true)
    try {
      const meta = await createLibraryBook({ title: title || undefined })
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
  const catName = new Map(groups.map(g => [g.id, g.name]))

  // Seçilebilir satırlar, ekrandaki sırayla. Aramada liste düz (kategori satırın altında yazar),
  // elindeki defter tekrar edilmez.
  const search = searchByName(groups.flatMap(g => g.books), query, b => b.title)
  const options = search.query
    ? [...(search.exact ? [] : [{ create: true, name: search.query }]), ...search.matches.map(b => ({ book: b }))]
    : [...(heldBook ? [{ book: heldBook, pinned: true }] : []), ...groups.flatMap(g => g.books.map(b => ({ book: b })))]
  const active = Math.max(0, Math.min(activeIdx, options.length - 1))
  const choose = (opt) => opt.create ? create(opt.name) : pick(opt.book)
  const onSearchKey = (e) => {
    // Esc: önce aramayı temizler; boşsa menüyü kapatan dinleyicilere (canvas, timeline) bırakılır
    if (e.key === 'Escape') { if (query) { e.stopPropagation(); setQuery(''); setActiveIdx(0) } return }
    e.stopPropagation()   // yazılan harfler oyun / sayfa kısayollarına gitmesin
    const n = options.length
    if (!n) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n
      setActiveIdx(next)
      listRef.current?.querySelector(`[data-opt="${next}"]`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!e.repeat) choose(options[active])
    }
  }

  const rowShell = (key, i, children) => (
    <div key={key} data-opt={i} onMouseEnter={() => setActiveIdx(i)}
      style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: i === active ? 'rgba(247,242,228,0.09)' : 'transparent' }}>
      {children}
    </div>
  )
  const createRow = (opt, i) => rowShell('create', i, (
    <button type="button" disabled={busy} onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); choose(opt) }}
      style={{ display: 'flex', alignItems: 'center', gap: 12 * u, flex: 1, minWidth: 0, padding: `${8 * u}px ${12 * u}px`, background: 'transparent',
        border: 0, cursor: busy ? 'progress' : 'pointer', textAlign: 'left', color: PAPER }}>
      <span style={{ width: 24 * u, height: 32 * u, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 2 * u, border: `${1 * u}px dashed rgba(247,242,228,0.4)`, font: `200 ${16 * u}px ${FONT_UI}`, color: 'rgba(247,242,228,0.7)' }}>+</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', font: `italic 200 ${17 * u}px/1.15 ${FONT_DISPLAY}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textDecoration: 'underline', textUnderlineOffset: 3 * u }}>{opt.name}</span>
        <span style={{ display: 'block', font: `800 ${9 * u}px ${FONT_UI}`, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'rgba(247,242,228,0.45)', marginTop: 3 * u }}>oluştur ve ekle</span>
      </span>
    </button>
  ))

  const row = (b, i, { pinned = false, withCategory = false } = {}) => {
    const color = bookColorOf(b.color)
    const sub = pinned ? 'elinde'
      : [withCategory && catName.get(known.has(b.category_id) ? b.category_id : 'other'), KIND_LABEL[b.kind] ?? 'Defter', b.year].filter(Boolean).join(' · ')
    return rowShell(`${pinned ? 'held' : 'b'}-${b.id}`, i, (<>
      <button type="button" title={pickTitle} onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); pick(b) }}
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
    </>))
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
        <a href="/kitaplik" target="_blank" rel="noopener" onMouseDown={stopEvt} onClick={stopEvt} title="Kitaplığı yeni sekmede aç" aria-label="Kitaplığı yeni sekmede aç"
          style={{ padding: `${7 * u}px ${9 * u}px`, borderRadius: 4 * u, border: '1px solid rgba(247,242,228,0.2)', color: 'rgba(247,242,228,0.8)',
            textDecoration: 'none', font: `800 ${10 * u}px ${FONT_UI}` }}>
          ↗
        </a>
        <button type="button" disabled={busy} onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); create(search.query) }}
          style={{ padding: `${7 * u}px ${12 * u}px`, borderRadius: 4 * u, border: 0, background: PAPER, color: '#1b1a18', cursor: busy ? 'progress' : 'pointer',
            font: `800 ${10 * u}px ${FONT_UI}`, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          + Yeni defter
        </button>
      </div>
      <div style={{ padding: `${10 * u}px ${12 * u}px`, borderBottom: '1px solid rgba(247,242,228,0.1)' }}>
        <input type="text" autoFocus value={query} placeholder="Defter ara…" aria-label="Defter ara"
          onChange={e => { setQuery(e.target.value); setActiveIdx(0) }} onKeyDown={onSearchKey}
          onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
          style={{ width: '100%', height: 36 * u, padding: `0 ${12 * u}px`, boxSizing: 'border-box', borderRadius: 6 * u, outline: 'none',
            background: 'rgba(247,242,228,0.06)', border: '1px solid rgba(247,242,228,0.22)', color: PAPER,
            font: `200 ${15 * u}px ${FONT_UI}` }} />
      </div>
      <div ref={listRef} style={{ maxHeight: 380 * u, overflowY: 'auto' }}>
        {search.query ? (
          <>
            {options.map((opt, i) => opt.create ? createRow(opt, i) : row(opt.book, i, { withCategory: true }))}
          </>
        ) : (() => {
          let i = 0
          return (
            <>
              {heldBook && row(heldBook, i++, { pinned: true })}
              {groups.map(g => <div key={g.id}>{head(g.name)}{g.books.map(b => row(b, i++))}</div>)}
            </>
          )
        })()}
        {state === 'ready' && !books.length && !search.query && (
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
