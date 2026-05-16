import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { loadRoom } from '../utils/loadRoom'

function getAncestors(rooms, currentId) {
  const ancestors = []
  let id = currentId
  const visited = new Set()
  while (true) {
    if (visited.has(id)) break
    visited.add(id)
    const room = rooms.find(r => r.id === id)
    if (!room?.parent) break
    ancestors.unshift({ id: room.parent.id, name: room.parent.name })
    id = room.parent.id
  }
  return ancestors
}

function NavLink({ id, name, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <span
      onClick={() => onClick(id, name)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'block',
        color: hov ? '#fff' : 'rgba(255,255,255,0.55)',
        fontSize: 12,
        cursor: 'pointer',
        textDecoration: hov ? 'underline' : 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 160,
        transition: 'color 0.15s',
        lineHeight: '1.7',
        letterSpacing: 0.2,
      }}
      title={name}
    >
      {name}
    </span>
  )
}

function HistoryLink({ id, name, isCurrent, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <span
      onClick={() => !isCurrent && onClick(id, name)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        color: isCurrent ? 'rgba(255,255,255,0.9)' : hov ? '#fff' : 'rgba(255,255,255,0.45)',
        fontSize: 11,
        cursor: isCurrent ? 'default' : 'pointer',
        textDecoration: (!isCurrent && hov) ? 'underline' : 'none',
        whiteSpace: 'nowrap',
        fontWeight: isCurrent ? 600 : 400,
        transition: 'color 0.15s',
        letterSpacing: 0.2,
      }}
    >
      {name}
    </span>
  )
}

export function RoomNavHUD() {
  const [locked, setLocked] = useState(true)
  const rooms = useStore(s => s.rooms)
  const currentRoomId = useStore(s => s.currentRoomId)
  const roomHistory = useStore(s => s.roomHistory)
  const currentRoomName = useStore(s => s.currentRoomName)
  const activeModal = useStore(s => s.activeModal)
  const menuModal = useStore(s => s.menuModal)
  const roomModal = useStore(s => s.roomModal)

  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  const ancestors = getAncestors(rooms, currentRoomId)
  const currentRoom = rooms.find(r => r.id === currentRoomId)
  const children = currentRoom?.children ?? []

  const displayHistory = roomHistory.length > 0
    ? roomHistory
    : currentRoomId ? [{ id: currentRoomId, name: currentRoomName }] : []

  function goTo(id, name) {
    const canvas = document.querySelector('canvas')
    if (canvas) canvas.requestPointerLock()
    loadRoom(id, name).catch(err => console.error('[RoomNavHUD] loadRoom error:', err))
  }

  const visible = !locked && !activeModal && !menuModal && !roomModal

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 200,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.2s ease',
    }}>

      {/* ── Üst: ziyaret geçmişi ─────────────────────────────── */}
      {displayHistory.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          pointerEvents: visible ? 'all' : 'none',
          maxWidth: 'calc(100vw - 400px)',
          flexWrap: 'nowrap',
          overflow: 'hidden',
        }}>
          {displayHistory.map((r, i) => (
            <span key={r.id} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, margin: '0 6px' }}>›</span>
              )}
              <HistoryLink
                id={r.id}
                name={r.name}
                isCurrent={r.id === currentRoomId}
                onClick={goTo}
              />
            </span>
          ))}
        </div>
      )}

      {/* ── Sol: parent silsilesi ─────────────────────────────── */}
      {ancestors.length > 0 && (
        <div style={{
          position: 'absolute',
          left: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          pointerEvents: visible ? 'all' : 'none',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
            Üst Odalar
          </div>
          {ancestors.map(a => (
            <NavLink key={a.id} id={a.id} name={a.name} onClick={goTo} />
          ))}
        </div>
      )}

      {/* ── Sağ: child odalar ────────────────────────────────── */}
      {children.length > 0 && (
        <div style={{
          position: 'absolute',
          right: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          alignItems: 'flex-end',
          pointerEvents: visible ? 'all' : 'none',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>
            Alt Odalar
          </div>
          {children.map(c => (
            <NavLink key={c.id} id={c.id} name={c.name} onClick={goTo} />
          ))}
        </div>
      )}
    </div>
  )
}
