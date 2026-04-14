import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

const GRID_SIZE = 20

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
  const { roomModal, closeRoomModal, hoveredTile, addDoor, removeDoor, hiddenWalls, setFloorTexture } = useStore()
  const [activeTab, setActiveTab]   = useState('door')
  const [preview, setPreview]       = useState([])
  const [textures, setTextures]     = useState([])
  const [selectedTex, setSelectedTex] = useState('')

  // Aktif sekmeyi hover tipine göre belirle
  useEffect(() => {
    if (!roomModal) return
    if (typeof hoveredTile?.id === 'number') setActiveTab('floor')
    else setActiveTab('door')
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
    width: '400px',
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
    borderRadius: '8px', fontSize: '13px',
  },
  tabDisabled: {
    flex: 1, padding: '9px',
    background: 'transparent', border: 'none',
    color: '#333', cursor: 'not-allowed',
    borderRadius: '8px', fontSize: '13px',
  },
  activeTab: {
    flex: 1, padding: '9px',
    background: '#2a2a2a', border: 'none',
    color: '#fff', cursor: 'pointer',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600,
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
