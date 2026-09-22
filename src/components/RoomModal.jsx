import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { ROOM_CONFIGS, getDoorInstanceIds } from '../utils/roomConfig'

const OUTER_CONFIG  = { gx: 60, gz: 60, wh: 6 }
const OUTER2_CONFIG = { gx: 80, gz: 80, wh: 6 }

// hoveredTile.id → duvar katmanı ('wall-N'=iç 0, 'outer-N'=bahçe1 1, 'outer2-N'=bahçe2 2)
// 'outer2-' önce kontrol edilmeli (prefix çakışmasını önlemek için).
function parseWallId(hoverId) {
  if (typeof hoverId !== 'string') return null
  if (hoverId.startsWith('outer2-')) return { layer: 2, id: parseInt(hoverId.slice(7)) }
  if (hoverId.startsWith('outer-'))  return { layer: 1, id: parseInt(hoverId.slice(6)) }
  if (hoverId.startsWith('wall-'))   return { layer: 0, id: parseInt(hoverId.slice(5)) }
  return null
}

function configForLayer(layer, roomType) {
  if (layer === 2) return OUTER2_CONFIG
  if (layer === 1) return OUTER_CONFIG
  return ROOM_CONFIGS[roomType] ?? ROOM_CONFIGS.room
}

export function RoomModal() {
  const {
    roomModal, closeRoomModal, hoveredTile,
    addDoor, removeDoor, hiddenWalls,
    addOuterDoor, removeOuterDoor, hiddenOuterWalls,
    addOuterDoor2, removeOuterDoor2, hiddenOuterWalls2,
    setFloorTexture,
    specialDoors, setSpecialDoors,
    outerSpecialDoors, setOuterSpecialDoors,
    outerSpecialDoors2, setOuterSpecialDoors2,
    roomLinks, setRoomLinks,
    outerRoomLinks, setOuterRoomLinks,
    outerRoomLinks2, setOuterRoomLinks2,
    rooms, setRooms, currentRoomId, currentRoomType,
  } = useStore()
  const [activeTab, setActiveTab]   = useState('special-door')
  const [preview, setPreview]       = useState([])
  const [textures, setTextures]     = useState([])
  const [selectedTex, setSelectedTex] = useState('')
  const [childRoomName, setChildRoomName] = useState('')
  const [childRoomType, setChildRoomType] = useState('room')
  const [creating, setCreating] = useState(false)
  const [createMode, setCreateMode] = useState('new')
  const [linkType, setLinkType]     = useState('child')
  const [linkSearch, setLinkSearch] = useState('')
  const [linkTargetId, setLinkTargetId] = useState(null)
  // Bağlantı kapısı sekmesi (özel kapıdan bağımsız kendi state'i)
  const [rlMode, setRlMode]         = useState('new')
  const [rlName, setRlName]         = useState('')
  const [rlType, setRlType]         = useState('room')
  const [rlSearch, setRlSearch]     = useState('')
  const [rlTargetId, setRlTargetId] = useState(null)
  const [rlBusy, setRlBusy]         = useState(false)

  // Aktif sekmeyi hover tipine göre belirle
  useEffect(() => {
    if (!roomModal) return
    if (typeof hoveredTile?.id === 'number') setActiveTab('floor')
    else setActiveTab('special-door')
    setChildRoomName('')
    setChildRoomType('room')
    setCreateMode('new')
    setLinkSearch('')
    setLinkTargetId(null)
    setRlMode('new')
    setRlName('')
    setRlType('room')
    setRlSearch('')
    setRlTargetId(null)
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
    const w = parseWallId(hoveredTile?.id)
    if (!w) { setPreview([]); return }
    setPreview(getDoorInstanceIds(w.id, configForLayer(w.layer, currentRoomType)))
  }, [hoveredTile, currentRoomType])

  // Aktif duvar katmanı (0=iç, 1=bahçe1, 2=bahçe2) ve katman-bazlı store erişimleri
  const wall   = parseWallId(hoveredTile?.id)
  const isWall = wall !== null
  const layer  = wall?.layer ?? 0
  const anchorId = wall?.id ?? null

  const hiddenByLayer     = [hiddenWalls, hiddenOuterWalls, hiddenOuterWalls2]
  const specialByLayer    = [specialDoors, outerSpecialDoors, outerSpecialDoors2]
  const addDoorByLayer    = [addDoor, addOuterDoor, addOuterDoor2]
  const removeDoorByLayer = [removeDoor, removeOuterDoor, removeOuterDoor2]

  const roomLinksByLayer  = [roomLinks, outerRoomLinks, outerRoomLinks2]

  const activeHiddenWalls  = hiddenByLayer[layer]
  const activeSpecialDoors = specialByLayer[layer]
  const activeRoomLinks    = roomLinksByLayer[layer]

  const isDoorOpen = preview.length > 0 && preview.every(id => activeHiddenWalls.includes(id))

  const existingSpecialDoor = anchorId !== null
    ? activeSpecialDoors.find(sd => sd.instanceIds.includes(anchorId))
    : null

  const existingRoomLink = anchorId !== null
    ? activeRoomLinks.find(l => l.instanceIds.includes(anchorId))
    : null

  // Sunucudan dönen tüm özel kapıları katmana göre store'a dağıtır
  const distributeSpecialDoors = (updatedDoors) => {
    const byLayer = [[], [], []]
    for (const sd of updatedDoors) (byLayer[sd.layer] ?? byLayer[0]).push(sd)
    setSpecialDoors(byLayer[0])
    setOuterSpecialDoors(byLayer[1])
    setOuterSpecialDoors2(byLayer[2])
    return byLayer
  }

  const handleAddDoor = async () => {
    try {
      const r = await fetch('/api/doors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: preview, layer })
      })
      if (!r.ok) throw new Error('Sunucu hatası')
      addDoorByLayer[layer](preview)
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
        body: JSON.stringify({ ids: preview, layer })
      })
      if (!r.ok) throw new Error('Sunucu hatası')
      removeDoorByLayer[layer](preview)
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
        body: JSON.stringify({ anchorId, childRoomName, layer, roomType: childRoomType }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Sunucu hatası') }
      const { childRoom, specialDoors: updatedDoors } = await r.json()
      setRooms([...rooms, childRoom])
      const byLayer = distributeSpecialDoors(updatedDoors)
      const newIds = byLayer[layer].find(sd => sd.anchorId === anchorId)?.instanceIds ?? []
      addDoorByLayer[layer](newIds)
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
      const lists = [
        [specialDoors, removeDoor, setSpecialDoors],
        [outerSpecialDoors, removeOuterDoor, setOuterSpecialDoors],
        [outerSpecialDoors2, removeOuterDoor2, setOuterSpecialDoors2],
      ]
      for (const [list, removeD, setList] of lists) {
        const removed = list.find(sd => sd.id === id)
        if (removed) { removeD(removed.instanceIds); setList(list.filter(sd => sd.id !== id)) }
      }
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleLinkRoom = async () => {
    if (!linkTargetId) return
    try {
      const r = await fetch('/api/special-doors/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorId, targetRoomId: linkTargetId, linkType, layer }),
      })
      if (!r.ok) { const e = await r.json(); alert(e.error); return }
      const { specialDoors: updatedDoors, rooms: updatedRooms } = await r.json()
      setRooms(updatedRooms)
      const byLayer = distributeSpecialDoors(updatedDoors)
      const newIds = byLayer[layer].find(sd => sd.anchorId === anchorId)?.instanceIds ?? []
      addDoorByLayer[layer](newIds)
      setLinkSearch('')
      setLinkTargetId(null)
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    }
  }

  // Sunucudan dönen bağlantı kapılarını katmana göre store'a dağıtır
  const distributeRoomLinks = (updated) => {
    const byLayer = [[], [], []]
    for (const l of updated) (byLayer[l.layer] ?? byLayer[0]).push(l)
    setRoomLinks(byLayer[0])
    setOuterRoomLinks(byLayer[1])
    setOuterRoomLinks2(byLayer[2])
    return byLayer
  }

  // Yeni oda + bağlantı kapısı. Parent/child kurulmaz; yeni odada karşı duvara
  // geri bağlantı kapısı sunucu tarafında açılır (çift yönlü).
  const handleCreateLinkRoom = async () => {
    setRlBusy(true)
    try {
      const r = await fetch('/api/room-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorId, roomName: rlName, layer, roomType: rlType }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Sunucu hatası') }
      const { linkedRoom, roomLinks: updated } = await r.json()
      setRooms([...rooms, linkedRoom])
      const byLayer = distributeRoomLinks(updated)
      const newIds = byLayer[layer].find(l => l.anchorId === anchorId)?.instanceIds ?? []
      addDoorByLayer[layer](newIds)
      setRlName('')
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    } finally {
      setRlBusy(false)
    }
  }

  // Mevcut odaya bağla — tek yönlü: kapı yalnızca bu odada açılır, hedef oda
  // kendi bağlantı kapısını açana kadar orada kapı görünmez.
  const handleLinkExistingRoom = async () => {
    if (!rlTargetId) return
    setRlBusy(true)
    try {
      const r = await fetch('/api/room-links/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorId, targetRoomId: rlTargetId, layer }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Sunucu hatası') }
      const { roomLinks: updated } = await r.json()
      const byLayer = distributeRoomLinks(updated)
      const newIds = byLayer[layer].find(l => l.anchorId === anchorId)?.instanceIds ?? []
      addDoorByLayer[layer](newIds)
      setRlSearch('')
      setRlTargetId(null)
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    } finally {
      setRlBusy(false)
    }
  }

  // Bağlantıyı kaldır: sunucu iki odadaki kapıları da siler. Burada yalnızca aktif
  // odadan kaybolan kapıların duvar tile'ları geri kapatılır.
  const handleRemoveRoomLink = async (id) => {
    try {
      const r = await fetch(`/api/room-links/${id}`, { method: 'DELETE' })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Sunucu hatası') }
      const { roomLinks: updated } = await r.json()
      const keptIds = new Set(updated.map(l => l.id))
      const removedByLayer = [[], [], []]
      for (const l of [...roomLinks, ...outerRoomLinks, ...outerRoomLinks2]) {
        if (!keptIds.has(l.id)) (removedByLayer[l.layer] ?? removedByLayer[0]).push(...l.instanceIds)
      }
      removedByLayer.forEach((ids, i) => { if (ids.length) removeDoorByLayer[i](ids) })
      distributeRoomLinks(updated)
      closeRoomModal()
    } catch (err) {
      alert(err.message)
    }
  }

  const currentRoom = rooms.find(r => r.id === currentRoomId)
  const linkableRooms = linkType === 'parent'
    ? rooms.filter(r => r.id === currentRoom?.parent?.id)
    : rooms.filter(r => r.id !== currentRoomId)
  const filteredLinkRooms = linkableRooms.filter(r =>
    r.name.toLowerCase().includes(linkSearch.toLowerCase())
  )
  // Bağlantı kapısında hiyerarşi yok: kendisi dışındaki tüm odalar aday, yalnızca isimle aranır
  const filteredRlRooms = rooms.filter(r =>
    r.id !== currentRoomId && r.name.toLowerCase().includes(rlSearch.toLowerCase())
  )

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
          <button style={activeTab === 'special-door' ? s.activeTab : s.tab} onClick={() => setActiveTab('special-door')}>
            🔵 Özel Kapı
          </button>
          <button style={activeTab === 'room-link' ? s.activeTab : s.tab} onClick={() => setActiveTab('room-link')}>
            🔗 Bağlantı Kapısı
          </button>
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

        {/* Özel Kapı sekmesi */}
        {activeTab === 'special-door' && (
          <div style={s.section}>
            {!isWall && (
              <p style={s.hint}>Özel kapı açmak için bir duvar tile'ının üzerine gelin.</p>
            )}

            {isWall && !existingSpecialDoor && (
              <>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    style={createMode === 'new' ? s.activeTab : s.tab}
                    onClick={() => setCreateMode('new')}
                  >
                    ✨ Yeni Oda
                  </button>
                  <button
                    style={createMode === 'link' ? s.activeTab : s.tab}
                    onClick={() => { setCreateMode('link'); setLinkSearch(''); setLinkTargetId(null) }}
                  >
                    🔗 Mevcut Odayı Bağla
                  </button>
                </div>

                {createMode === 'new' && (
                  <>
                    {/* Oda tipi seçici */}
                    <div style={s.typeRow}>
                      <label style={{ ...s.typeOption, ...(childRoomType === 'room' ? s.typeActive : {}) }}>
                        <input type="radio" checked={childRoomType === 'room'} onChange={() => setChildRoomType('room')} style={{ display: 'none' }} />
                        🏠 Oda
                      </label>
                      <label style={{ ...s.typeOption, ...(childRoomType === 'cadde' ? s.typeActive : {}) }}>
                        <input type="radio" checked={childRoomType === 'cadde'} onChange={() => setChildRoomType('cadde')} style={{ display: 'none' }} />
                        🛣️ Cadde
                      </label>
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

                {createMode === 'link' && (
                  <>
                    <div style={{ display: 'flex', gap: '16px', padding: '4px 0' }}>
                      <label style={{ fontSize: '13px', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="radio"
                          checked={linkType === 'child'}
                          onChange={() => { setLinkType('child'); setLinkTargetId(null); setLinkSearch('') }}
                        />
                        child bağla
                      </label>
                      <label style={{ fontSize: '13px', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="radio"
                          checked={linkType === 'parent'}
                          onChange={() => { setLinkType('parent'); setLinkTargetId(null); setLinkSearch('') }}
                        />
                        parent bağla
                      </label>
                    </div>

                    {linkType === 'parent' && !currentRoom?.parent && (
                      <p style={s.hint}>Bu odanın henüz bir parent odası yok.</p>
                    )}

                    {(linkType === 'child' || currentRoom?.parent) && (
                      <input
                        style={s.input}
                        placeholder="Oda ara..."
                        value={linkSearch}
                        onChange={e => { setLinkSearch(e.target.value); setLinkTargetId(null) }}
                      />
                    )}

                    {filteredLinkRooms.length > 0 && linkSearch.length > 0 && (
                      <div style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: '8px', overflow: 'hidden' }}>
                        {filteredLinkRooms.slice(0, 6).map(r => (
                          <div
                            key={r.id}
                            onClick={() => { setLinkTargetId(r.id); setLinkSearch(r.name) }}
                            style={{
                              padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                              color: linkTargetId === r.id ? '#fff' : '#aaa',
                              background: linkTargetId === r.id ? '#1a1a1a' : 'transparent',
                            }}
                          >
                            {r.name}
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      style={{
                        ...s.applyBtn,
                        background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
                        opacity: linkTargetId ? 1 : 0.4,
                      }}
                      disabled={!linkTargetId}
                      onClick={handleLinkRoom}
                    >
                      🔗 Bağla
                    </button>
                  </>
                )}
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

        {/* Bağlantı Kapısı sekmesi — özel kapıdan farkı: parent/child kurmaz,
            kapı yalnızca bağlantıyı kuran odada görünür. */}
        {activeTab === 'room-link' && (
          <div style={s.section}>
            {!isWall && (
              <p style={s.hint}>Bağlantı kapısı açmak için bir duvar tile'ının üzerine gelin.</p>
            )}

            {isWall && existingSpecialDoor && !existingRoomLink && (
              <p style={s.hint}>Bu duvarda zaten bir özel kapı var. Önce "Özel Kapı" sekmesinden kaldırın.</p>
            )}

            {isWall && !existingSpecialDoor && !existingRoomLink && (
              <>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    style={rlMode === 'new' ? s.activeTab : s.tab}
                    onClick={() => setRlMode('new')}
                  >
                    ✨ Yeni Oda
                  </button>
                  <button
                    style={rlMode === 'existing' ? s.activeTab : s.tab}
                    onClick={() => { setRlMode('existing'); setRlSearch(''); setRlTargetId(null) }}
                  >
                    🔗 Mevcut Odaya Bağla
                  </button>
                </div>

                {rlMode === 'new' && (
                  <>
                    <div style={s.typeRow}>
                      <label style={{ ...s.typeOption, ...(rlType === 'room' ? s.typeActive : {}) }}>
                        <input type="radio" checked={rlType === 'room'} onChange={() => setRlType('room')} style={{ display: 'none' }} />
                        🏠 Oda
                      </label>
                      <label style={{ ...s.typeOption, ...(rlType === 'cadde' ? s.typeActive : {}) }}>
                        <input type="radio" checked={rlType === 'cadde'} onChange={() => setRlType('cadde')} style={{ display: 'none' }} />
                        🛣️ Cadde
                      </label>
                    </div>
                    <input
                      style={s.input}
                      placeholder="Yeni oda adı..."
                      value={rlName}
                      onChange={e => setRlName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && rlName.trim() && !rlBusy) handleCreateLinkRoom() }}
                      autoFocus
                    />
                    <p style={s.hint}>Yeni oda bağımsız kalır (parent/child kurulmaz), karşı duvarında geri bağlantı kapısı açılır.</p>
                    <button
                      style={{
                        ...s.applyBtn,
                        background: 'linear-gradient(135deg, #10b981, #047857)',
                        opacity: rlName.trim() ? 1 : 0.4,
                      }}
                      disabled={!rlName.trim() || rlBusy}
                      onClick={handleCreateLinkRoom}
                    >
                      🔗 {rlBusy ? '...' : 'Bağlantı Kapısı Aç'}
                    </button>
                  </>
                )}

                {rlMode === 'existing' && (
                  <>
                    <input
                      style={s.input}
                      placeholder="Oda ara..."
                      value={rlSearch}
                      onChange={e => { setRlSearch(e.target.value); setRlTargetId(null) }}
                      autoFocus
                    />

                    {rlSearch.length > 0 && filteredRlRooms.length > 0 && (
                      <div style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: '8px', overflow: 'hidden' }}>
                        {filteredRlRooms.slice(0, 6).map(r => (
                          <div
                            key={r.id}
                            onClick={() => { setRlTargetId(r.id); setRlSearch(r.name) }}
                            style={{
                              padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                              color: rlTargetId === r.id ? '#fff' : '#aaa',
                              background: rlTargetId === r.id ? '#1a1a1a' : 'transparent',
                            }}
                          >
                            {r.name}
                          </div>
                        ))}
                      </div>
                    )}

                    {rlSearch.length > 0 && filteredRlRooms.length === 0 && (
                      <p style={s.hint}>Bu isimde oda bulunamadı.</p>
                    )}

                    <p style={s.hint}>Kapı yalnızca bu odada açılır; karşı odada kapı çıkmaz. Oradan da bağlantı kapısı açılırsa iki kapı birbirinin önüne düşer.</p>
                    <button
                      style={{
                        ...s.applyBtn,
                        background: 'linear-gradient(135deg, #10b981, #047857)',
                        opacity: rlTargetId ? 1 : 0.4,
                      }}
                      disabled={!rlTargetId || rlBusy}
                      onClick={handleLinkExistingRoom}
                    >
                      🔗 {rlBusy ? '...' : 'Bağla'}
                    </button>
                  </>
                )}
              </>
            )}

            {isWall && existingRoomLink && (
              <>
                <div style={s.infoBox}>
                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Bağlı oda</span>
                    <span style={{ ...s.infoValue, color: '#34d399' }}>{existingRoomLink.targetRoomName}</span>
                  </div>
                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Durum</span>
                    <span style={{ ...s.infoValue, color: '#4ade80' }}>Bağlantı kapısı açık</span>
                  </div>
                </div>
                <p style={s.hint}>Kaldırınca iki odadaki bağlantı kapıları da kapanır.</p>
                <button
                  style={{ ...s.applyBtn, background: '#7f1d1d' }}
                  onClick={() => handleRemoveRoomLink(existingRoomLink.id)}
                >
                  🗑 Bağlantıyı Kaldır
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
    width: '460px',
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
  typeRow: { display: 'flex', gap: '6px' },
  typeOption: {
    flex: 1, padding: '8px', textAlign: 'center', borderRadius: '7px',
    border: '1px solid #2a2a2a', background: '#0a0a0a', color: '#888',
    fontSize: '12px', cursor: 'pointer', userSelect: 'none',
  },
  typeActive: {
    border: '1px solid #3b82f6', background: '#0a1628', color: '#60a5fa', fontWeight: 600,
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
