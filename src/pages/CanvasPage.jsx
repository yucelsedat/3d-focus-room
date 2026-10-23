import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CanvasMesh from '../components/CanvasMesh'
import { useStore } from '../store/useStore'

// /canvas — oyundaki canvas tile'ın birebir aynısı (CanvasMesh standalone), tam ekran.
// Canvas sunucuda gizli sistem odasındaki sıradan bir Media satırıdır; bu yüzden
// Kopyala / Kes / Sync-Kopyala oyundaki tile panosuna yazılır ve herhangi bir odanın
// duvarına EditModal'daki aynı Yapıştır hattıyla eklenir.

const CLIP_ACTIONS = [
  { mode: 'copy', label: 'Kopyala',      done: 'Kopyalandı',      hint: 'Bağımsız kopya' },
  { mode: 'cut',  label: 'Kes',          done: 'Kesildi',         hint: 'Duvara taşınır, sayfa boşalır' },
  { mode: 'sync', label: 'Sync-Kopyala', done: 'Sync-Kopyalandı', hint: 'Duvardaki kopya bununla ortak içerik kullanır' },
]

// Okuma modu tarayıcı başına hatırlanır (son bırakılan modda açılır)
const READ_KEY = 'canvasPage:readOnly'
const readSaved = () => { try { return localStorage.getItem(READ_KEY) === '1' } catch { return false } }

export default function CanvasPage() {
  const navigate         = useNavigate()
  const setRooms         = useStore(s => s.setRooms)
  const tileClipboard    = useStore(s => s.tileClipboard)
  const setTileClipboard = useStore(s => s.setTileClipboard)
  const [media, setMedia]       = useState(null)
  const [error, setError]       = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [readOnly, setReadOnly] = useState(readSaved)
  const menuRef = useRef(null)

  useEffect(() => {
    let alive = true
    fetch('/api/canvas-page')
      .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || 'Canvas yüklenemedi'); return d }))
      .then(d => { if (alive) setMedia(d) })
      .catch(err => { if (alive) setError(err.message) })
    // "Oda" butonu ve oda kartları oda listesini store'dan okur (oyun açılmadan da dolu olsun)
    fetch('/api/rooms').then(r => r.json()).then(setRooms).catch(() => {})
    return () => { alive = false }
  }, [setRooms])

  // Menü dışına tıklayınca / ESC'de kapan. Canvas olayları stopImmediatePropagation
  // kullandığından capture fazında dinlenir.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !e.target.closest?.('[data-cvpage-menu-btn]')) setMenuOpen(false) }
    const onKey  = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen])

  // Uygulama içinden gelindiyse bir adım geri, doğrudan açıldıysa ana sayfa
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))

  // Oda kartı / not linki: oyunu o odada aç (App açılışta lastRoomId'yi yükler)
  const openRoom = (room) => {
    localStorage.setItem('lastRoomId', room.id)
    localStorage.setItem('lastRoomName', room.name)
    navigate('/game')
  }

  const toggleRead = () => setReadOnly(v => {
    try { localStorage.setItem(READ_KEY, v ? '0' : '1') } catch {}
    return !v
  })

  const pick = (mode) => {
    const active = tileClipboard?.id === media.id && tileClipboard?.mode === mode
    setTileClipboard(active ? null : { id: media.id, type: 'canvas', label: 'Canvas', mode })
  }

  if (error || !media) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#07070d', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: 15 }}>
        {error
          ? <><span>{error}</span><button onClick={goBack} style={retryBtn}>Geri dön</button></>
          : <span style={{ fontWeight: 200, letterSpacing: 2 }}>canvas açılıyor…</span>}
      </div>
    )
  }

  const activeMode = tileClipboard?.id === media.id ? tileClipboard.mode : null

  return (
    <CanvasMesh
      id={media.id} content={media.content} width={media.width} height={media.height}
      syncGroupId={media.syncGroupId} syncCount={media.syncCount}
      standalone readOnly={readOnly} onOpenRoom={openRoom}
      toolbarStart={
        <div style={{ ...stickySlot, left: 0, marginRight: 6 }}>
          <button onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); goBack() }} title="Geri" aria-label="Geri" style={iconBtn}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      }
      toolbarEnd={
        <div style={{ ...stickySlot, right: 0, marginLeft: 6, gap: 10 }}>
          <button onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); toggleRead() }}
            title={readOnly ? 'Düzenleme moduna dön' : 'Okuma modu (salt okunur)'} aria-label="Okuma modu" aria-pressed={readOnly}
            style={{ ...iconBtn, ...(readOnly ? iconBtnOn : {}) }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
              <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
            </svg>
          </button>
          <button data-cvpage-menu-btn onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); setMenuOpen(v => !v) }}
            title="Canvas işlemleri" aria-label="Canvas işlemleri" aria-haspopup="menu" aria-expanded={menuOpen}
            style={{ ...iconBtn, ...(menuOpen || activeMode ? iconBtnOn : {}) }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      }
      overlay={menuOpen && (
        <div ref={menuRef} role="menu" onMouseDown={stopEvt} onClick={stopEvt} style={menuBox}>
          {CLIP_ACTIONS.map(a => {
            const on = activeMode === a.mode
            return (
              <button key={a.mode} role="menuitem" onClick={() => pick(a.mode)} style={{ ...menuItem, ...(on ? menuItemOn : {}) }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{on ? `✓ ${a.done}` : a.label}</span>
                <span style={{ fontWeight: 200, fontSize: 12, color: on ? '#bfdbfe' : '#94a3b8' }}>{on ? 'Tekrar tıkla: iptal' : a.hint}</span>
              </button>
            )
          })}
          <div style={menuFoot}>
            {activeMode
              ? 'Oyunda bir duvar tile\'ı seçip açılan pencerede Yapıştır\'a bas.'
              : 'Seçtiğin işlemle bu canvas bir odanın duvarına eklenir.'}
            {media.syncGroupId && <div style={{ marginTop: 6, color: '#fca5a5', fontWeight: 800, letterSpacing: 1 }}>SENKRON · {media.syncCount || '?'} kopya</div>}
          </div>
        </div>
      )}
    />
  )
}

const stopEvt = (e) => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation() }

// Araç çubuğu tam ekranda 0.6 zoom'la çizilir: buradaki ölçüler canvas toolbar'ıyla aynı
// (54px buton) ve kaydırılan çubukta iki uç sabit kalsın diye sticky.
const stickySlot = { position: 'sticky', zIndex: 2, display: 'flex', alignItems: 'center', flexShrink: 0, background: '#05050f', padding: '0 6px' }
const iconBtn    = { width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', flexShrink: 0 }
const iconBtnOn  = { background: 'rgba(96,165,250,0.22)', borderColor: 'rgba(96,165,250,0.55)', color: '#93c5fd' }

// Menü editör kabının içinde, zoom'suz katmanda (toolbar'ın görünür yüksekliği 76px)
const menuBox    = { position: 'absolute', top: 84, right: 12, zIndex: 40, width: 280, padding: 6, background: 'rgba(8,8,20,0.97)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 2 }
const menuItem   = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', padding: '10px 12px', background: 'transparent', border: '1px solid transparent', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }
const menuItemOn = { background: 'rgba(96,165,250,0.16)', borderColor: 'rgba(96,165,250,0.45)', color: '#93c5fd' }
const menuFoot   = { margin: '4px 6px 4px', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 200, lineHeight: 1.5, color: '#94a3b8' }
const retryBtn   = { padding: '8px 14px', borderRadius: 8, border: '1px solid #262626', background: 'transparent', color: '#ddd', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800 }
