import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

export function MainMenu() {
  const {
    menuModal, closeMenuModal,
    currentRoomId, currentRoomName, setCurrentRoom,
    rooms, setRooms,
    setWorldMedia, setHiddenWalls, setFloorTexture,
  } = useStore()

  const [view, setView] = useState('main')       // 'main' | 'new-room' | 'rooms' | 'save'
  const [newRoomName, setNewRoomName] = useState('')
  const [saveRoomName, setSaveRoomName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset inner view when menu opens/closes
  useEffect(() => {
    if (menuModal) {
      setView('main')
      setNewRoomName('')
      setSaveRoomName(currentRoomName || '')
      setError('')
    }
  }, [menuModal, currentRoomName])

  if (!menuModal) return null

  // ── Load a room: activate on server then refetch all data ──────────────────
  async function loadRoom(id, name) {
    setLoading(true)
    setError('')
    try {
      const actRes = await fetch(`/api/rooms/${id}/activate`, { method: 'POST' })
      if (!actRes.ok) throw new Error('Oda aktifleştirilemedi')

      const [media, doors, floor] = await Promise.all([
        fetch('/api/media').then(r => r.json()),
        fetch('/api/doors').then(r => r.json()),
        fetch('/api/floor').then(r => r.json()),
      ])

      setWorldMedia(media)
      setHiddenWalls(doors)
      setFloorTexture(floor.texture)
      setCurrentRoom(id, name)
      closeMenuModal()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Create a new empty room ────────────────────────────────────────────────
  async function createRoom() {
    if (!newRoomName.trim()) { setError('Oda adı girin'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoomName.trim() }),
      })
      if (!res.ok) {
        const e = await res.json(); throw new Error(e.error || 'Oluşturulamadı')
      }
      const room = await res.json()

      setRooms([...rooms, room])
      await loadRoom(room.id, room.name)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  // ── Rename / "save" current room ──────────────────────────────────────────
  async function saveRoom() {
    if (!saveRoomName.trim()) { setError('Oda adı girin'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rooms/${currentRoomId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveRoomName.trim() }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Kaydedilemedi') }
      const updated = await res.json()

      setCurrentRoom(updated.id, updated.name)
      setRooms(rooms.map(r => r.id === updated.id ? updated : r))
      closeMenuModal()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Delete a room ─────────────────────────────────────────────────────────
  async function deleteRoom(id) {
    if (id === 'default') return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rooms/${id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Silinemedi') }

      const updated = rooms.filter(r => r.id !== id)
      setRooms(updated)

      // If we deleted the active room, load default
      if (id === currentRoomId) {
        const def = updated.find(r => r.id === 'default') || updated[0]
        if (def) await loadRoom(def.id, def.name)
      }
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.overlay}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.title}>FOCUS ROOM</div>
          {currentRoomName && view === 'main' && (
            <div style={s.subtitle}>{currentRoomName}</div>
          )}
        </div>

        {/* Error */}
        {error && <div style={s.errorBox}>{error}</div>}

        {/* ── Main view ─────────────────────────────── */}
        {view === 'main' && (
          <div style={s.btnStack}>
            <button style={s.continueBtn} onClick={closeMenuModal} disabled={loading}>
              Devam Et
            </button>
            <button style={s.otherBtn} onClick={() => { setView('new-room'); setError('') }} disabled={loading}>
              Yeni Oda
            </button>
            <button
              style={s.otherBtn}
              onClick={() => { setSaveRoomName(currentRoomName || ''); setView('save'); setError('') }}
              disabled={loading}
            >
              Kaydet
            </button>
            <button style={s.otherBtn} onClick={() => { setView('rooms'); setError('') }} disabled={loading}>
              Odalar
            </button>
          </div>
        )}

        {/* ── New room view ──────────────────────────── */}
        {view === 'new-room' && (
          <div style={s.subView}>
            <div style={s.subTitle}>Yeni Oda</div>
            <input
              style={s.input}
              placeholder="Oda adı..."
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createRoom()}
              autoFocus
            />
            <div style={s.row}>
              <button style={s.backBtn} onClick={() => { setView('main'); setError('') }} disabled={loading}>
                ← Geri
              </button>
              <button style={s.actionBtn} onClick={createRoom} disabled={loading || !newRoomName.trim()}>
                {loading ? '...' : 'Oluştur'}
              </button>
            </div>
          </div>
        )}

        {/* ── Save view ─────────────────────────────── */}
        {view === 'save' && (
          <div style={s.subView}>
            <div style={s.subTitle}>Odayı Kaydet</div>
            <input
              style={s.input}
              placeholder="Oda adı..."
              value={saveRoomName}
              onChange={e => setSaveRoomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveRoom()}
              autoFocus
            />
            <div style={s.row}>
              <button style={s.backBtn} onClick={() => { setView('main'); setError('') }} disabled={loading}>
                ← Geri
              </button>
              <button style={s.actionBtn} onClick={saveRoom} disabled={loading || !saveRoomName.trim()}>
                {loading ? '...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        {/* ── Rooms list view ───────────────────────── */}
        {view === 'rooms' && (
          <div style={s.subView}>
            <div style={s.subTitle}>Odalar</div>
            <div style={s.roomList}>
              {rooms.length === 0 && <div style={s.emptyMsg}>Oda bulunamadı.</div>}
              {rooms.map(room => (
                <div key={room.id} style={s.roomRow}>
                  <span style={{ ...s.roomName, ...(room.id === currentRoomId ? s.activeRoom : {}) }}>
                    {room.name}
                    {room.id === currentRoomId && <span style={s.activeBadge}> ●</span>}
                  </span>
                  <div style={s.roomActions}>
                    <button
                      style={s.loadBtn}
                      onClick={() => loadRoom(room.id, room.name)}
                      disabled={loading || room.id === currentRoomId}
                    >
                      Yükle
                    </button>
                    <button
                      style={{ ...s.deleteBtn, ...(room.id === 'default' ? s.disabledBtn : {}) }}
                      onClick={() => deleteRoom(room.id)}
                      disabled={loading || room.id === 'default'}
                      title={room.id === 'default' ? 'Varsayılan oda silinemez' : ''}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button style={{ ...s.backBtn, marginTop: '12px' }} onClick={() => { setView('main'); setError('') }} disabled={loading}>
              ← Geri
            </button>
          </div>
        )}

        {/* Hint */}
        {view === 'main' && (
          <div style={s.hint}>Q tuşu ile menüyü aç/kapat</div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2147483647,
    backdropFilter: 'blur(8px)',
  },
  modal: {
    backgroundColor: '#181818',
    color: '#fff',
    padding: '36px',
    borderRadius: '20px',
    width: '400px',
    border: '1px solid #2a2a2a',
    boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    textAlign: 'center',
    marginBottom: '28px',
  },
  title: {
    fontSize: '26px',
    fontWeight: 700,
    letterSpacing: '6px',
    color: '#fff',
  },
  subtitle: {
    marginTop: '6px',
    fontSize: '13px',
    color: '#888',
    letterSpacing: '1px',
  },
  errorBox: {
    backgroundColor: '#2a0a0a',
    border: '1px solid #6b2020',
    color: '#ff7070',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  btnStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  continueBtn: {
    background: 'linear-gradient(135deg, #ff9500, #ff6000)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '14px',
    width: '100%',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.5px',
  },
  otherBtn: {
    background: 'transparent',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '10px',
    padding: '12px',
    width: '100%',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  subView: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  subTitle: {
    fontSize: '14px',
    color: '#888',
    fontWeight: 500,
    marginBottom: '4px',
  },
  input: {
    background: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#fff',
    padding: '10px 12px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
    gap: '8px',
  },
  backBtn: {
    flex: 1,
    background: 'transparent',
    color: '#888',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  actionBtn: {
    flex: 2,
    background: 'linear-gradient(135deg, #ff9500, #ff6000)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  roomList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '240px',
    overflowY: 'auto',
  },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#111',
    border: '1px solid #222',
    borderRadius: '8px',
    padding: '10px 12px',
    gap: '8px',
  },
  roomName: {
    fontSize: '14px',
    color: '#ccc',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  activeRoom: {
    color: '#fff',
    fontWeight: 600,
  },
  activeBadge: {
    color: '#ff9500',
    fontSize: '10px',
  },
  roomActions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  loadBtn: {
    background: 'transparent',
    color: '#aaa',
    border: '1px solid #333',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  deleteBtn: {
    background: 'transparent',
    color: '#c44',
    border: '1px solid #4a1a1a',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  disabledBtn: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  emptyMsg: {
    color: '#555',
    fontSize: '13px',
    textAlign: 'center',
    padding: '20px 0',
  },
  hint: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '11px',
    color: '#444',
    letterSpacing: '0.5px',
  },
}
