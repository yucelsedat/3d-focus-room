// ── Kitaplık menüsü + defter kartı ayarları ──────────────────────────────────
// Canvas tile ve Timeline ortak kullanır. Menü bir deftere kart ekler (ya da yeni
// defter açar); ayar penceresi kartın defterinin adını / kapağını kitaplıkta
// değiştirir — aynı deftere bakan bütün kartlar ve açık defterin rayı birlikte
// güncellenir. Ad ve kapak deftere aittir, karta değil.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/useStore'
import {
  useShelf, refreshShelf, createBook, saveBookMeta, deleteBook, uploadCover, clothOf,
} from '../notebook/shelfStore'
import { NotebookCard } from './cards'
import { stopEvt } from './canvasUtils'

const FONT_UI = "'DM Sans', system-ui, sans-serif"
const FONT_DISPLAY = "'Fraunces', Georgia, serif"
const PAPER = '#f7f2e4'

const imageFileOf = (dt) => [...(dt?.files || [])].find(f => f.type.startsWith('image/')) ||
  [...(dt?.items || [])].find(it => it.kind === 'file' && it.type.startsWith('image/'))?.getAsFile() || null

// ── Menü ─────────────────────────────────────────────────────────────────────
// u: ölçek (canvas tile 2 — 1920 px'lik yüzeyde okunur kalsın; timeline 1).
// onPick(meta) mevcut deftere kart, onCreate(meta) yeni defter + kart.
export function NotebookShelfMenu({ u = 1, style, onPick, onCreate }) {
  const { byKey, order, hereKey, state } = useShelf()
  const held = useStore(st => st.heldNotebook)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { refreshShelf() }, [])

  const create = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try { onCreate(await createBook('Yeni defter')) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const pinned = [held, hereKey].filter((k, i, a) => k && byKey[k] && a.indexOf(k) === i)
  const books = order.filter(k => k.startsWith('book:') && !pinned.includes(k))
  const rooms = order.filter(k => k.startsWith('room:') && !pinned.includes(k))

  const row = (key) => {
    const b = byKey[key]
    const sub = key === held ? 'elinde' : key === hereKey ? 'bu odanın defteri'
      : b.kind === 'room' ? (b.customName ? `oda defteri · ${b.roomName}` : 'oda defteri') : 'defter'
    return (
      <button key={key} type="button" onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); onPick(b) }}
        style={{ display: 'flex', alignItems: 'center', gap: 12 * u, width: '100%', padding: `${8 * u}px ${12 * u}px`, background: 'transparent',
          border: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left', color: PAPER }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(247,242,228,0.07)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
        <span style={{ width: 24 * u, height: 32 * u, flexShrink: 0, borderRadius: `${2 * u}px ${4 * u}px ${4 * u}px ${2 * u}px`, background: clothOf(key),
          backgroundImage: b.cover ? `url("${b.cover}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center',
          boxShadow: `inset ${3 * u}px 0 0 rgba(0,0,0,0.35)` }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', font: `italic 200 ${17 * u}px/1.15 ${FONT_DISPLAY}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
          <span style={{ display: 'block', font: `800 ${9 * u}px ${FONT_UI}`, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: key === held ? '#f4d35e' : 'rgba(247,242,228,0.45)', marginTop: 3 * u }}>{sub}</span>
        </span>
      </button>
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
        <button type="button" disabled={busy} onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); create() }}
          style={{ padding: `${7 * u}px ${12 * u}px`, borderRadius: 4 * u, border: 0, background: PAPER, color: '#1b1a18', cursor: busy ? 'progress' : 'pointer',
            font: `800 ${10 * u}px ${FONT_UI}`, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          + Yeni defter
        </button>
      </div>
      <div style={{ maxHeight: 380 * u, overflowY: 'auto' }}>
        {pinned.map(row)}
        {books.length > 0 && <>{head('Defterler')}{books.map(row)}</>}
        {rooms.length > 0 && <>{head('Oda defterleri')}{rooms.map(row)}</>}
        {state !== 'ready' && !order.length && (
          <div style={{ padding: 18 * u, font: `200 ${13 * u}px ${FONT_UI}`, color: 'rgba(247,242,228,0.55)', textAlign: 'center' }}>
            {state === 'error' ? 'Kitaplık yüklenemedi' : 'yükleniyor…'}
          </div>
        )}
        {err && <div style={{ padding: `${8 * u}px ${12 * u}px`, font: `200 ${12 * u}px ${FONT_UI}`, color: '#f0a29a' }}>{err}</div>}
      </div>
    </div>
  )
}

// ── Ayar penceresi ───────────────────────────────────────────────────────────
// body'ye portal (canvas tile'da <Html> içinden de react-dom'da kalır). Tıklama ve
// tuşlar kökte durur: drei PointerLockControls / oyun kısayolları duymasın.
// onSaved(meta) kartın kendi kopyasını tazeler, onDeleted defter silinince kartı kaldırır.
export function NotebookCardDialog({ item, onClose, onSaved, onTake, onDeleted }) {
  const live = useShelf(st => st.byKey[item.src])
  const isRoom = item.src?.startsWith('room:')
  const initialName = live ? (live.customName ?? '') : (item.name ?? '')
  const [name, setName] = useState(initialName)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [savedName, setSavedName] = useState(initialName)

  const run = async (what, fn) => {
    setBusy(what); setErr('')
    try { return await fn() } catch (e) { setErr(e.message || 'İşlem başarısız') } finally { setBusy('') }
  }
  const save = (patch) => run('save', async () => {
    const meta = await saveBookMeta(item.src, patch)
    onSaved(meta)
    return meta
  })

  const commitName = async () => {
    const next = name.trim()
    if (next === savedName.trim()) return
    if (!next && !isRoom) { setName(savedName); setErr('Defter adı boş olamaz'); return }
    const meta = await save({ name: next })
    if (meta) setSavedName(meta.customName ?? '')
  }
  const applyFile = (file) => file && run('upload', async () => {
    const cover = await uploadCover(file)
    const meta = await saveBookMeta(item.src, { cover })
    onSaved(meta)
  })
  const applyUrl = () => { const v = url.trim(); if (v) save({ cover: v }).then(m => { if (m) setUrl('') }) }
  const remove = () => run('delete', async () => {
    await deleteBook(item.src)
    onDeleted()
  })

  const onKeyDown = (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }
  const cover = live ? live.cover : item.cover
  const preview = { ...item, w: 180, h: 240 }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Defter ayarları"
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) { commitName(); onClose() } }}
      onClick={stopEvt} onWheel={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
      onPaste={(e) => { const f = imageFileOf(e.clipboardData); if (f) { e.preventDefault(); e.stopPropagation(); applyFile(f) } }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); applyFile(imageFileOf(e.dataTransfer)) }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483646, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6,6,10,0.62)', pointerEvents: 'auto', fontFamily: FONT_UI, cursor: 'default' }}>
      <div style={{ display: 'flex', gap: 28, padding: 28, width: 'min(640px, calc(100vw - 32px))', boxSizing: 'border-box', flexWrap: 'wrap',
        background: 'rgba(14,14,17,0.96)', border: '1px solid rgba(247,242,228,0.14)', borderRadius: 12, color: PAPER,
        boxShadow: '0 30px 60px -24px rgba(0,0,0,0.85)' }}>
        <div style={{ width: 180, height: 240, flexShrink: 0 }}>
          <NotebookCard item={preview} width={180} />
        </div>

        <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={label}>{isRoom ? 'Oda defteri' : 'Defter'}</div>
            <div style={{ font: `italic 200 30px/1.05 ${FONT_DISPLAY}` }}>Defter ayarları</div>
          </div>

          <label style={{ display: 'block' }}>
            <span style={label}>Ad</span>
            <input value={name} autoFocus maxLength={60} onChange={(e) => setName(e.target.value)}
              placeholder={isRoom ? (live?.roomName || 'oda adı') : 'Defter adı'}
              onBlur={commitName} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitName() } }}
              onMouseDown={(e) => e.stopPropagation()} style={input} />
            {isRoom && <span style={hint}>Boş bırakırsan kök odanın adı görünür.</span>}
          </label>

          <div>
            <span style={label}>Kapak</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...btn, cursor: busy ? 'progress' : 'pointer' }}>
                {busy === 'upload' ? 'Yükleniyor…' : 'Resim yükle'}
                <input type="file" accept="image/*" disabled={!!busy} style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; applyFile(f) }} />
              </label>
              {cover && <button type="button" disabled={!!busy} onClick={() => save({ cover: null })} style={btnGhost}>Kapağı kaldır</button>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ya da resim adresi yapıştır…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyUrl() } }}
                onMouseDown={(e) => e.stopPropagation()} style={{ ...input, flex: 1, minWidth: 0 }} />
              <button type="button" disabled={!url.trim() || !!busy} onClick={applyUrl} style={{ ...btnGhost, opacity: url.trim() ? 1 : 0.4 }}>Kullan</button>
            </div>
            <span style={hint}>Resmi bu pencereye sürükleyip bırakabilir ya da yapıştırabilirsin.</span>
          </div>

          {err && <div role="alert" style={{ font: `200 13px ${FONT_UI}`, color: '#f0a29a' }}>{err}</div>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', alignItems: 'center' }}>
            <button type="button" onClick={() => { commitName(); onTake() }} style={btnPrimary}>Elime al</button>
            <button type="button" onClick={() => { commitName(); onClose() }} style={btnGhost}>Kapat</button>
            {!isRoom && (confirmDel ? (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                <span style={{ font: `200 12px ${FONT_UI}`, color: '#f0a29a' }}>Tüm sayfalar silinir.</span>
                <button type="button" disabled={!!busy} onClick={remove} style={btnDanger}>Evet, sil</button>
                <button type="button" onClick={() => setConfirmDel(false)} style={btnGhost}>Vazgeç</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} style={{ ...btnGhost, marginLeft: 'auto', color: '#f0a29a' }}>Defteri sil</button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const label = { display: 'block', font: `800 10px ${FONT_UI}`, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(247,242,228,0.5)', marginBottom: 6 }
const hint = { display: 'block', marginTop: 6, font: `200 12px ${FONT_UI}`, color: 'rgba(247,242,228,0.5)' }
const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(247,242,228,0.2)',
  background: 'rgba(247,242,228,0.06)', color: PAPER, font: `200 15px ${FONT_UI}`, outline: 'none' }
const btnBase = { padding: '9px 14px', borderRadius: 5, font: `800 10px ${FONT_UI}`, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }
const btn = { ...btnBase, border: '1px solid rgba(247,242,228,0.25)', background: 'rgba(247,242,228,0.1)', color: PAPER }
const btnGhost = { ...btnBase, border: '1px solid rgba(247,242,228,0.16)', background: 'transparent', color: 'rgba(247,242,228,0.8)' }
const btnPrimary = { ...btnBase, border: 0, background: '#f4d35e', color: '#1b1a18' }
const btnDanger = { ...btnBase, border: 0, background: '#e0685c', color: '#1b1a18' }
