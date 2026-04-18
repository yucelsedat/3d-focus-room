import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

const GRID_SIZE = 40

function getDoorIds(instanceId) {
  const face = instanceId % 4
  const j    = Math.floor((instanceId % (GRID_SIZE * 4)) / 4)
  const ids  = []
  for (let dh = 0; dh < 3; dh++) {
    for (let dj = 0; dj < 2; dj++) {
      const jj = j + dj
      if (jj >= GRID_SIZE) continue
      ids.push((dh * GRID_SIZE * 4) + (jj * 4) + face)
    }
  }
  return ids
}

export function RoomModal() {
  const {
    roomModal, closeRoomModal, hoveredTile, addDoor, removeDoor, hiddenWalls, setFloorTexture,
    specialDoors, setSpecialDoors, rooms, setRooms,
  } = useStore()
  const [activeTab, setActiveTab]   = useState('door')
  const [preview, setPreview]       = useState([])
  const [textures, setTextures]     = useState([])
  const [selectedTex, setSelectedTex] = useState('')
  const [childRoomName, setChildRoomName] = useState('')
  const [creating, setCreating] = useState(false)

  // Aktif sekmeyi hover tipine göre belirle
  useEffect(() => {
    if (!roomModal) return
    if (typeof hoveredTile?.id === 'number') setActiveTab('floor')
    else setActiveTab('door')
    setChildRoomName('')
  }, [roomModal])

  // Zemin tab açılınca texture listesini çek
  useEffect(() => {
    if (!roomModal) return
    fetch('/api/floor-textures')
      .then(r => r.json())
      .then(setTextures)
      .catch(() => {})
  }, [roomModal])

  // Kapı preview hesapla
  useEffect(() => {
    const id = hoveredTile?.id
    if (typeof id !== 'string' || !id.startsWith('wall-')) {
      setPreview([])
      return
    }
    const instanceId = parseInt(id.replace('wall-', ''))
    setPreview(getDoorIds(instanceId))
  }, [hoveredTile])

  const isDoorOpen = preview.length > 0 && preview.every(id => hiddenWalls.includes(id))
  const isWall = typeof hoveredTile?.id === 'string' && hoveredTile.id.startsWith('wall-')

  // Özel kapı tespiti
  const anchorId = isWall ? parseInt(hoveredTile.id.replace('wall-', '')) : null
  const existingSpecialDoor = anchorId !== null
    ? specialDoors.find(sd => sd.instanceIds.includes(anchorId))
    : null

  const handleAddDoor = async () => {
    try {
      const r = await fetch('/api/doors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: preview })
      })
      if (!r.ok) throw new Error('Sunucu hatası')
      addDoor(preview)
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRemoveDoor = async () => {
    try {
      const r = await fetch('/api/doors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: preview })
      })
      if (!r.ok) throw new Error('Sunucu hatası')
      removeDoor(preview)
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleApplyFloor = async () => {
    try {
      const r = await fetch('/api/floor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texture: selectedTex })
      })
      if (!r.ok) throw new Error('Sunucu hatası')
      setFloorTexture(selectedTex)
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleCreateSpecialDoor = async () => {
    setCreating(true)
    try {
      const r = await fetch('/api/special-doors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorId, childRoomName }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Sunucu hatası') }
      const { childRoom, specialDoors: updatedDoors } = await r.json()
      setRooms([...rooms, childRoom])
      setSpecialDoors(updatedDoors)
      const newIds = updatedDoors.find(sd => sd.anchorId === anchorId)?.instanceIds ?? []
      addDoor(newIds)
      setChildRoomName('')
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleRemoveSpecialDoor = async (id) => {
    try {
      await fetch(`/api/special-doors/${id}`, { method: 'DELETE' })
      const removed = specialDoors.find(sd => sd.id === id)
      if (removed) removeDoor(removed.instanceIds)
      setSpecialDoors(specialDoors.filter(sd => sd.id !== id))
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    }
  }

  if (!roomModal) return null

  return (
    <div style={s.overlay}>
      <div style={s.modal}>

        <div style={s.header}>
          <h2 style={s.title}>Oda Editörü</h2>
          <button style={s.closeBtn} onClick={closeRoomModal}>✕</button>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          <button style={activeTab === 'door'  ? s.activeTab : s.tab} onClick={() => setActiveTab('door')}>
            🚪 Kapı
          </button>
          <button style={activeTab === 'special-door' ? s.activeTab : s.tab} onClick={() => setActiveTab('special-door')}>
            🔵 Özel Kapı
          </button>
          <button style={activeTab === 'floor' ? s.activeTab : s.tab} onClick={() => setActiveTab('floor')}>
            ⬛ Zemin
          </button>
          <button style={s.tabDisabled} disabled>
            🧱 Duvar
          </button>
        </div>

        {/* Kapı sekmesi */}
        {activeTab === 'door' && (
          <div style={s.section}>
            <div style={s.infoBox}>
              <div style={s.infoRow}>
                <span style={s.infoLabel}>Hedef tile</span>
                <span style={s.infoValue}>{hoveredTile?.id ?? '—'}</span>
              </div>
              <div style={s.infoRow}>
                <span style={s.infoLabel}>Kapı boyutu</span>
                <span style={s.infoValue}>2 × 3 tile</span>
              </div>
              <div style={s.infoRow}>
                <span style={s.infoLabel}>Durum</span>
                <span style={{ ...s.infoValue, color: isDoorOpen ? '#4ade80' : '#aaa' }}>
                  {!isWall ? 'Duvar tile\'ı üzerine gelin' : isDoorOpen ? 'Kapı açık' : 'Kapalı'}
                </span>
              </div>
            </div>

            {!isWall && (
              <p style={s.hint}>Kapı açmak için bir duvar tile'ının üzerine gelin, sonra R tuşuna basın.</p>
            )}
            {isWall && !isDoorOpen && (
              <button style={s.applyBtn} onClick={handleAddDoor}>
                🚪 Kapı Aç
              </button>
            )}
            {isWall && isDoorOpen && (
              <button style={{ ...s.applyBtn, background: '#7f1d1d' }} onClick={handleRemoveDoor}>
                🧱 Kapıyı Kapat
              </button>
            )}
          </div>
        )}

        {/* Özel Kapı sekmesi */}
        {activeTab === 'special-door' && (
          <div style={s.section}>
            {!isWall && (
              <p style={s.hint}>Özel kapı açmak için bir duvar tile'ının üzerine gelin.</p>
            )}

            {isWall && !existingSpecialDoor && (
              <>
                <div style={s.infoBox}>
                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Kapı boyutu</span>
                    <span style={s.infoValue}>2 × 3 tile (mavi)</span>
                  </div>
                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Açıklama</span>
                    <span style={s.infoValue}>Yeni child oda oluşturur</span>
                  </div>
                </div>
                <input
                  style={s.input}
                  placeholder="Yeni oda adı..."
                  value={childRoomName}
                  onChange={e => setChildRoomName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && childRoomName.trim() && !creating) handleCreateSpecialDoor() }}
                  autoFocus
                />
                <button
                  style={{
                    ...s.applyBtn,
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    opacity: childRoomName.trim() ? 1 : 0.4,
                  }}
                  disabled={!childRoomName.trim() || creating}
                  onClick={handleCreateSpecialDoor}
                >
                  🔵 {creating ? '...' : 'Özel Kapı Aç'}
                </button>
              </>
            )}

            {isWall && existingSpecialDoor && (
              <>
                <div style={s.infoBox}>
                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Hedef oda</span>
                    <span style={{ ...s.infoValue, color: '#60a5fa' }}>{existingSpecialDoor.targetRoomName}</span>
                  </div>
                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Durum</span>
                    <span style={{ ...s.infoValue, color: '#4ade80' }}>Özel kapı açık</span>
                  </div>
                </div>
                <button
                  style={{ ...s.applyBtn, background: '#7f1d1d' }}
                  onClick={() => handleRemoveSpecialDoor(existingSpecialDoor.id)}
                >
                  🗑 Özel Kapıyı Kapat
                </button>
              </>
            )}
          </div>
        )}

        {/* Zemin sekmesi */}
        {activeTab === 'floor' && (
          <div style={s.section}>
            <p style={s.hint}>Tüm zemin için bir texture seç, sonra Uygula'ya bas.</p>

            {textures.length === 0 && (
              <p style={{ ...s.hint, color: '#555' }}>
                public/textures/ klasörüne PNG/JPG ekleyin.
              </p>
            )}

            <div style={s.textureGrid}>
              {textures.map(tex => (
                <div
                  key={tex}
                  onClick={() => setSelectedTex(tex)}
                  style={{
                    ...s.textureCard,
                    border: selectedTex === tex ? '2px solid #00f2ff' : '2px solid #2a2a2a',
                  }}
                >
                  <img
                    src={`/textures/${tex}`}
                    alt={tex}
                    style={{ width: '100%', height: '70px', objectFit: 'cover', display: 'block' }}
                  />
                  <p style={s.textureName}>{tex.replace(/\.[^.]+$/, '')}</p>
                </div>
              ))}
            </div>

            <button
              style={{ ...s.applyBtn, opacity: selectedTex ? 1 : 0.4 }}
              disabled={!selectedTex}
              onClick={handleApplyFloor}
            >
              ⬛ Uygula
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
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
    width: '420px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
    border: '1px solid #2a2a2a',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: { margin: 0, fontSize: '20px', fontWeight: 600 },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: '18px',
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    marginBottom: '20px',
    backgroundColor: '#0d0d0d',
    padding: '3px',
    borderRadius: '10px',
    gap: '3px',
  },
  tab: {
    flex: 1, padding: '9px',
    background: 'transparent', border: 'none',
    color: '#888', cursor: 'pointer',
    borderRadius: '8px', fontSize: '12px',
  },
  tabDisabled: {
    flex: 1, padding: '9px',
    background: 'transparent', border: 'none',
    color: '#333', cursor: 'not-allowed',
    borderRadius: '8px', fontSize: '12px',
  },
  activeTab: {
    flex: 1, padding: '9px',
    background: '#2a2a2a', border: 'none',
    color: '#fff', cursor: 'pointer',
    borderRadius: '8px', fontSize: '12px', fontWeight: 600,
  },
  section: { display: 'flex', flexDirection: 'column', gap: '14px' },
  infoBox: {
    backgroundColor: '#0d0d0d',
    borderRadius: '10px',
    border: '1px solid #222',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: '12px', color: '#555' },
  infoValue: { fontSize: '13px', color: '#ccc', fontFamily: 'monospace' },
  hint: { fontSize: '12px', color: '#444', fontStyle: 'italic', margin: 0 },
  input: {
    background: '#0a0a0a', border: '1px solid #2a2a2a',
    borderRadius: '8px', color: '#fff', padding: '10px 12px',
    fontSize: '14px', width: '100%', outline: 'none', boxSizing: 'border-box',
  },
  textureGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  textureCard: {
    borderRadius: '8px',
    cursor: 'pointer',
    overflow: 'hidden',
    background: '#0d0d0d',
    transition: 'border-color 0.15s',
  },
  textureName: {
    margin: '4px 0 6px',
    fontSize: '11px',
    color: '#aaa',
    textAlign: 'center',
  },
  applyBtn: {
    padding: '11px',
    background: 'linear-gradient(135deg, #00c6ff, #0072ff)',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    width: '100%',
  },
}
