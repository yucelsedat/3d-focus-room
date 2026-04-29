import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { loadRoom as loadRoomUtil } from '../utils/loadRoom'

export function MainMenu() {
  const {
    menuModal, closeMenuModal,
    currentRoomId, currentRoomName,
    rooms, setRooms, setCurrentRoom,
  } = useStore()

  const [view, setView] = useState('main')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Rooms list state ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')

  // ── New room form state ─────────────────────────────────────────────────────
  const [newName, setNewName] = useState('')
  const [newRoomType, setNewRoomType] = useState('room')
  const [newCatInput, setNewCatInput] = useState('')
  const [newCategories, setNewCategories] = useState([])
  const [newHasParent, setNewHasParent] = useState(false)
  const [newParentSearch, setNewParentSearch] = useState('')
  const [newParentId, setNewParentId] = useState(null)

  // ── Settings state (for active room) ───────────────────────────────────────
  const [setName, setSetName] = useState('')
  const [setCatInput, setSetCatInput] = useState('')
  const [setCategories, setSetCategories] = useState([])
  const [setParentSearch, setSetParentSearch] = useState('')
  const [setParentId, setSetParentId] = useState(null)
  const [setChildren, setSetChildren] = useState([])

  // ── Global lists for autocomplete ───────────────────────────────────────────
  const [allCategories, setAllCategories] = useState([])

  useEffect(() => {
    if (!menuModal) return
    setView('main')
    setError('')
    setSearch('')
    setCatFilter('')
    fetch('/api/categories').then(r => r.json()).then(setAllCategories).catch(() => {})
  }, [menuModal])

  // Populate settings form when switching to settings view
  useEffect(() => {
    if (view !== 'settings') return
    const room = rooms.find(r => r.id === currentRoomId)
    if (!room) return
    setSetName(room.name || '')
    setSetCategories((room.categories || []).map(c => c.name))
    setSetParentId(room.parent?.id || null)
    setSetChildren(room.children || [])
    setSetCatInput('')
    setSetParentSearch('')
  }, [view, currentRoomId, rooms])

  if (!menuModal) return null

  // ── Load a room ─────────────────────────────────────────────────────────────
  async function loadRoom(id, name) {
    setLoading(true); setError('')
    try {
      await loadRoomUtil(id, name)
      closeMenuModal()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Create new room ─────────────────────────────────────────────────────────
  async function createRoom() {
    if (!newName.trim()) { setError('Oda adı girin'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          categoryNames: newCategories,
          parentId: newParentId,
          roomType: newRoomType,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Oluşturulamadı') }
      const room = await res.json()
      setRooms([...rooms, room])
      setAllCategories(prev => {
        const names = new Set(prev.map(c => c.name))
        const added = room.categories.filter(c => !names.has(c.name))
        return [...prev, ...added]
      })
      await loadRoom(room.id, room.name)
    } catch (e) { setError(e.message); setLoading(false) }
  }

  // ── Save room settings ──────────────────────────────────────────────────────
  async function saveSettings() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/rooms/${currentRoomId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setName.trim() || undefined,
          categoryNames: setCategories,
          parentId: setParentId,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Kaydedilemedi') }
      const updated = await res.json()
      setCurrentRoom(updated.id, updated.name)
      setRooms(rooms.map(r => r.id === updated.id ? updated : r))
      setAllCategories(prev => {
        const names = new Set(prev.map(c => c.name))
        const added = updated.categories.filter(c => !names.has(c.name))
        return [...prev, ...added]
      })
      closeMenuModal()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Delete room ─────────────────────────────────────────────────────────────
  async function deleteRoom(id) {
    if (id === 'default') return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/rooms/${id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Silinemedi') }
      const updated = rooms.filter(r => r.id !== id)
      setRooms(updated)
      if (id === currentRoomId) {
        const def = updated.find(r => r.id === 'default') || updated[0]
        if (def) await loadRoom(def.id, def.name)
      }
    } catch (e) { setError(e.message); setLoading(false) }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function removeItem(list, setL, item) {
    setL(list.filter(x => x !== item))
  }

  function toggleParent(currentId, setId, id) {
    setId(currentId === id ? null : id)
  }

  // Rooms filtered + grouped by category
  const filteredRooms = rooms.filter(r => {
    const matchName = r.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = !catFilter || r.categories?.some(c => c.name === catFilter)
    return matchName && matchCat
  })

  const groupedRooms = filteredRooms.reduce((acc, r) => {
    const cats = r.categories?.length ? r.categories.map(c => c.name) : ['Genel']
    cats.forEach(cat => {
      if (!acc[cat]) acc[cat] = []
      if (!acc[cat].find(x => x.id === r.id)) acc[cat].push(r)
    })
    return acc
  }, {})

  const allCatNames = [...new Set(rooms.flatMap(r => r.categories?.map(c => c.name) || []))]

  // Parent search filtering (for new-room and settings)
  function filteredParents(search, currentId, selectedIds) {
    return rooms.filter(r =>
      r.id !== currentId &&
      r.name.toLowerCase().includes(search.toLowerCase())
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
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

        {error && <div style={s.errorBox}>{error}</div>}

        {/* ── Main ──────────────────────────────────────────── */}
        {view === 'main' && (
          <>
            <div style={s.btnStack}>
              <button style={s.continueBtn} onClick={closeMenuModal} disabled={loading}>
                Devam Et
              </button>
              <button style={s.otherBtn} onClick={() => { setNewName(''); setNewRoomType('room'); setNewCategories([]); setNewParentId(null); setNewHasParent(false); setView('new-room'); setError('') }} disabled={loading}>
                Yeni Oda
              </button>
              <button style={s.otherBtn} onClick={() => { setView('settings'); setError('') }} disabled={loading}>
                Oda Ayarları
              </button>
              <button style={s.otherBtn} onClick={() => { setView('rooms'); setError('') }} disabled={loading}>
                Odalar
              </button>
            </div>
            <div style={s.keysBox}>
              <div style={s.keysTitle}>Klavye Kısayolları</div>
              <div style={s.keysGrid}>
                {[
                  ['W A S D', 'Hareket et'],
                  ['Mouse', 'Etrafına bak'],
                  ['E', "Tile'a medya ekle / düzenle"],
                  ['R', 'Kapı aç/kapat · Zemin değiştir'],
                  ['Q', 'Bu menüyü aç / kapat'],
                ].map(([key, desc]) => (
                  <div key={key} style={s.keyRow}>
                    <span style={s.keyBadge}>{key}</span>
                    <span style={s.keyDesc}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Rooms list ─────────────────────────────────────── */}
        {view === 'rooms' && (
          <div style={s.subView}>
            <div style={s.filterRow}>
              <input style={{ ...s.input, flex: 1 }} placeholder="🔍 Ara..." value={search} onChange={e => setSearch(e.target.value)} />
              <select style={{ ...s.input, width: '160px', flexShrink: 0 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <option value="">Tüm kategoriler</option>
                {allCatNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div style={s.roomList}>
              {filteredRooms.length === 0 && <div style={s.emptyMsg}>Oda bulunamadı.</div>}
              {Object.entries(groupedRooms).sort(([a],[b]) => a === 'Genel' ? 1 : b === 'Genel' ? -1 : a.localeCompare(b)).map(([cat, catRooms]) => (
                <div key={cat}>
                  <div style={s.catHeader}>{cat}</div>
                  {catRooms.map(room => (
                    <div key={room.id} style={s.roomRow}>
                      <div style={s.roomInfo}>
                        <span style={{ ...s.roomName, ...(room.id === currentRoomId ? s.activeRoom : {}) }}>
                          {room.id === currentRoomId && <span style={s.activeDot}>● </span>}
                          {room.name}
                          {room.children?.length > 0 && <span style={s.childArrow}> ↳{room.children.length}</span>}
                        </span>
                      </div>
                      <div style={s.roomActions}>
                        <button style={s.loadBtn} onClick={() => loadRoom(room.id, room.name)} disabled={loading || room.id === currentRoomId}>
                          Yükle
                        </button>
                        <button
                          style={{ ...s.deleteBtn, ...(room.id === 'default' ? s.disabledBtn : {}) }}
                          onClick={() => deleteRoom(room.id)}
                          disabled={loading || room.id === 'default'}
                          title={room.id === 'default' ? 'Varsayılan oda silinemez' : ''}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <button style={{ ...s.backBtn, marginTop: '8px' }} onClick={() => { setView('main'); setError('') }} disabled={loading}>← Geri</button>
          </div>
        )}

        {/* ── New room form ───────────────────────────────────── */}
        {view === 'new-room' && (
          <div style={s.subView}>
            <div style={s.subTitle}>Yeni Oda</div>

            {/* Oda tipi seçici */}
            <div>
              <div style={s.fieldLabel}>Oda Tipi</div>
              <div style={s.typeRow}>
                <label style={{ ...s.typeOption, ...(newRoomType === 'room' ? s.typeActive : {}) }}>
                  <input type="radio" name="newRoomType" value="room" checked={newRoomType === 'room'} onChange={() => setNewRoomType('room')} style={{ display: 'none' }} />
                  🏠 Oda
                </label>
                <label style={{ ...s.typeOption, ...(newRoomType === 'cadde' ? s.typeActive : {}) }}>
                  <input type="radio" name="newRoomType" value="cadde" checked={newRoomType === 'cadde'} onChange={() => setNewRoomType('cadde')} style={{ display: 'none' }} />
                  🛣️ Cadde
                </label>
              </div>
            </div>

            <input style={s.input} placeholder="Oda adı *" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />

            {/* Categories */}
            <div>
              <div style={s.fieldLabel}>Kategori</div>
              <PillInput
                input={newCatInput} setInput={setNewCatInput}
                items={newCategories} onAdd={() => { if (newCatInput.trim() && !newCategories.includes(newCatInput.trim())) setNewCategories([...newCategories, newCatInput.trim()]); setNewCatInput('') }}
                onRemove={v => removeItem(newCategories, setNewCategories, v)}
                placeholder="Kategori adı, Enter"
                suggestions={allCategories.map(c => c.name).filter(n => n.toLowerCase().includes(newCatInput.toLowerCase()) && !newCategories.includes(n))}
                onSuggest={v => { if (!newCategories.includes(v)) setNewCategories([...newCategories, v]); setNewCatInput('') }}
              />
            </div>

            {/* Parent */}
            <div>
              <label style={s.checkRow}>
                <input type="checkbox" checked={newHasParent} onChange={e => { setNewHasParent(e.target.checked); if (!e.target.checked) setNewParentId(null) }} />
                <span style={s.fieldLabel}>Parent oda var</span>
              </label>
              {newHasParent && (
                <ParentPicker
                  search={newParentSearch} setSearch={setNewParentSearch}
                  selectedId={newParentId}
                  rooms={filteredParents(newParentSearch, null, [])}
                  onToggle={id => toggleParent(newParentId, setNewParentId, id)}
                  allRooms={rooms}
                />
              )}
            </div>

            <div style={s.row}>
              <button style={s.backBtn} onClick={() => { setView('main'); setError('') }} disabled={loading}>← Geri</button>
              <button style={s.actionBtn} onClick={createRoom} disabled={loading || !newName.trim()}>
                {loading ? '...' : 'Oluştur'}
              </button>
            </div>
          </div>
        )}

        {/* ── Room settings ───────────────────────────────────── */}
        {view === 'settings' && (
          <div style={s.subView}>
            <div style={s.subTitle}>Oda Ayarları — {currentRoomName}</div>

            {/* Name */}
            <div>
              <div style={s.fieldLabel}>İsim</div>
              <input style={s.input} value={setName} onChange={e => setSetName(e.target.value)} placeholder="Oda adı" />
            </div>

            {/* Categories */}
            <div>
              <div style={s.fieldLabel}>Kategoriler</div>
              <PillInput
                input={setCatInput} setInput={setSetCatInput}
                items={setCategories} onAdd={() => { if (setCatInput.trim() && !setCategories.includes(setCatInput.trim())) setSetCategories([...setCategories, setCatInput.trim()]); setSetCatInput('') }}
                onRemove={v => removeItem(setCategories, setSetCategories, v)}
                placeholder="Kategori, Enter"
                suggestions={allCategories.map(c => c.name).filter(n => n.toLowerCase().includes(setCatInput.toLowerCase()) && !setCategories.includes(n))}
                onSuggest={v => { if (!setCategories.includes(v)) setSetCategories([...setCategories, v]); setSetCatInput('') }}
              />
            </div>

            {/* Parents */}
            <div>
              <div style={s.fieldLabel}>Parent Odalar</div>
              <ParentPicker
                search={setParentSearch} setSearch={setSetParentSearch}
                selectedId={setParentId}
                rooms={filteredParents(setParentSearch, currentRoomId, [])}
                onToggle={id => toggleParent(setParentId, setSetParentId, id)}
                allRooms={rooms}
                currentRoomId={currentRoomId}
              />
            </div>

            {/* Children (read-only) */}
            {setChildren.length > 0 && (
              <div>
                <div style={s.fieldLabel}>Child Odalar (salt okunur)</div>
                <div style={s.pillContainer}>
                  {setChildren.map(c => <span key={c.id} style={s.pill}>{c.name}</span>)}
                </div>
              </div>
            )}

            <div style={s.row}>
              <button style={s.backBtn} onClick={() => { setView('main'); setError('') }} disabled={loading}>← Geri</button>
              <button style={s.actionBtn} onClick={saveSettings} disabled={loading}>
                {loading ? '...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── PillInput component ───────────────────────────────────────────────────────
function PillInput({ input, setInput, items, onAdd, onRemove, placeholder, suggestions = [], onSuggest }) {
  return (
    <div>
      <div style={s.pillContainer}>
        {items.map(v => (
          <span key={v} style={s.pill}>
            {v} <button style={s.pillX} onClick={() => onRemove(v)}>×</button>
          </span>
        ))}
        <input
          style={s.pillInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
          placeholder={items.length === 0 ? placeholder : ''}
        />
      </div>
      {suggestions.length > 0 && input.length > 0 && (
        <div style={s.suggestions}>
          {suggestions.slice(0, 5).map(s2 => (
            <div key={s2} style={s.suggestion} onClick={() => onSuggest(s2)}>{s2}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ParentPicker component (single select) ────────────────────────────────────
function ParentPicker({ search, setSearch, selectedId, rooms, onToggle, allRooms, currentRoomId }) {
  const selectedRoom = allRooms.find(r => r.id === selectedId)
  return (
    <div>
      {selectedRoom && (
        <div style={s.pillContainer}>
          <span style={s.pill}>
            {selectedRoom.name} <button style={s.pillX} onClick={() => onToggle(selectedRoom.id)}>×</button>
          </span>
        </div>
      )}
      <input
        style={{ ...s.input, marginTop: selectedRoom ? '6px' : '0' }}
        placeholder="Oda ara..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {search.length > 0 && rooms.length > 0 && (
        <div style={s.suggestions}>
          {rooms.filter(r => r.id !== selectedId).slice(0, 6).map(r => (
            <div key={r.id} style={s.suggestion} onClick={() => { onToggle(r.id); setSearch('') }}>
              {r.name}
              {r.categories?.length > 0 && <span style={{ color: '#555', fontSize: '11px' }}> · {r.categories.map(c => c.name).join(', ')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 2147483647, backdropFilter: 'blur(8px)',
  },
  modal: {
    backgroundColor: '#181818', color: '#fff',
    padding: '36px', borderRadius: '20px',
    width: '720px', maxHeight: '90vh', overflowY: 'auto',
    border: '1px solid #2a2a2a',
    boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: { textAlign: 'center', marginBottom: '28px' },
  title: { fontSize: '26px', fontWeight: 700, letterSpacing: '6px', color: '#fff' },
  subtitle: { marginTop: '6px', fontSize: '13px', color: '#888', letterSpacing: '1px' },
  errorBox: {
    backgroundColor: '#2a0a0a', border: '1px solid #6b2020',
    color: '#ff7070', borderRadius: '8px', padding: '10px 14px',
    fontSize: '13px', marginBottom: '16px',
  },
  btnStack: { display: 'flex', flexDirection: 'column', gap: '10px' },
  continueBtn: {
    background: 'linear-gradient(135deg, #ff9500, #ff6000)',
    color: '#fff', border: 'none', borderRadius: '10px',
    padding: '14px', width: '100%', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
  },
  otherBtn: {
    background: 'transparent', color: '#ccc', border: '1px solid #333',
    borderRadius: '10px', padding: '12px', width: '100%',
    fontSize: '14px', cursor: 'pointer',
  },
  subView: { display: 'flex', flexDirection: 'column', gap: '14px' },
  subTitle: { fontSize: '14px', color: '#888', fontWeight: 500, marginBottom: '2px' },
  fieldLabel: { fontSize: '12px', color: '#666', marginBottom: '5px', letterSpacing: '0.04em' },
  checkRow: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' },
  input: {
    background: '#0a0a0a', border: '1px solid #2a2a2a',
    borderRadius: '8px', color: '#fff', padding: '10px 12px',
    fontSize: '14px', width: '100%', outline: 'none', boxSizing: 'border-box',
  },
  filterRow: { display: 'flex', gap: '8px' },
  row: { display: 'flex', gap: '8px' },
  backBtn: {
    flex: 1, background: 'transparent', color: '#888', border: '1px solid #333',
    borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer',
  },
  actionBtn: {
    flex: 2, background: 'linear-gradient(135deg, #ff9500, #ff6000)',
    color: '#fff', border: 'none', borderRadius: '8px',
    padding: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  },
  // Rooms list
  roomList: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto' },
  catHeader: {
    fontSize: '11px', color: '#555', letterSpacing: '0.08em',
    textTransform: 'uppercase', padding: '10px 0 4px',
    borderBottom: '1px solid #1e1e1e', marginBottom: '4px',
  },
  roomRow: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    background: '#111', border: '1px solid #222', borderRadius: '8px',
    padding: '10px 12px', gap: '8px',
  },
  roomInfo: { flex: 1, overflow: 'hidden' },
  roomName: { fontSize: '14px', color: '#ccc', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  activeRoom: { color: '#fff', fontWeight: 600 },
  activeDot: { color: '#4caf50', fontSize: '10px' },
  childArrow: { color: '#555', fontSize: '11px' },
  roomActions: { display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' },
  loadBtn: {
    background: 'transparent', color: '#aaa', border: '1px solid #333',
    borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer',
  },
  deleteBtn: {
    background: 'transparent', color: '#c44', border: '1px solid #4a1a1a',
    borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer',
  },
  disabledBtn: { opacity: 0.3, cursor: 'not-allowed' },
  emptyMsg: { color: '#555', fontSize: '13px', textAlign: 'center', padding: '20px 0' },
  // Pills
  pillContainer: {
    display: 'flex', flexWrap: 'wrap', gap: '6px',
    background: '#0a0a0a', border: '1px solid #2a2a2a',
    borderRadius: '8px', padding: '8px', minHeight: '40px',
  },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    background: '#1e1e1e', border: '1px solid #333',
    borderRadius: '6px', padding: '3px 8px',
    fontSize: '12px', color: '#ccc',
  },
  pillX: {
    background: 'none', border: 'none', color: '#666',
    cursor: 'pointer', padding: '0', fontSize: '14px', lineHeight: 1,
  },
  pillInput: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#fff', fontSize: '13px', minWidth: '80px', flex: 1,
  },
  suggestions: {
    background: '#111', border: '1px solid #2a2a2a',
    borderRadius: '8px', overflow: 'hidden', marginTop: '2px',
  },
  suggestion: {
    padding: '8px 12px', fontSize: '13px', color: '#bbb',
    cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
  },
  // Room type selector
  typeRow: { display: 'flex', gap: '8px' },
  typeOption: {
    flex: 1, padding: '10px', textAlign: 'center', borderRadius: '8px',
    border: '1px solid #2a2a2a', background: '#0a0a0a', color: '#888',
    fontSize: '13px', cursor: 'pointer', userSelect: 'none',
  },
  typeActive: {
    border: '1px solid #ff9500', background: '#1a1000', color: '#ff9500', fontWeight: 600,
  },
  // Keys
  keysBox: { marginTop: '24px', padding: '16px', background: '#0d0d0d', border: '1px solid #222', borderRadius: '12px' },
  keysTitle: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' },
  keysGrid: { display: 'flex', flexDirection: 'column', gap: '8px' },
  keyRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  keyBadge: {
    display: 'inline-block', minWidth: '80px', padding: '3px 8px',
    background: '#1a1a1a', border: '1px solid #333', borderRadius: '5px',
    fontSize: '11px', color: '#ccc', fontFamily: 'monospace', textAlign: 'center', flexShrink: 0,
  },
  keyDesc: { fontSize: '12px', color: '#666' },
}
