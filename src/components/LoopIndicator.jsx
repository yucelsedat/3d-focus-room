import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { loadRoom } from '../utils/loadRoom'

// Global "çalışan loop" göstergesi. Pointer-lock'ta gizlenen RoomNavHUD'dan bağımsız;
// her zaman görünür (görünmez otonom harcamayı önler). /api/loops/active'i poller ve
// başka odalarda çalışan LoopFlow loop'larını üst-sağ köşede bir pill olarak gösterir.
export function LoopIndicator() {
  const [data, setData] = useState({ count: 0, max: 0, loops: [] })
  const [open, setOpen] = useState(false)
  const rooms = useStore(s => s.rooms)
  const currentRoomId = useStore(s => s.currentRoomId)

  useEffect(() => {
    let alive = true
    const poll = () => {
      fetch('/api/loops/active')
        .then(r => r.json())
        .then(d => { if (alive && d && Array.isArray(d.loops)) setData(d) })
        .catch(() => {})
    }
    poll()
    const t = setInterval(poll, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!data.count) return null

  const roomName = (id) => rooms.find(r => r.id === id)?.name || id?.slice?.(-6) || '?'
  const goTo = (id) => {
    if (id === currentRoomId) return
    const canvas = document.querySelector('canvas')
    if (canvas) canvas.requestPointerLock()
    loadRoom(id, roomName(id)).catch(err => console.error('[LoopIndicator] loadRoom error:', err))
  }

  return (
    <div style={{ position: 'fixed', top: 14, right: 14, zIndex: 250, pointerEvents: 'auto' }}>
      <div
        onClick={() => setOpen(o => !o)}
        title="Çalışan otonom loop'lar"
        style={{
          display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          background: 'rgba(26,18,5,0.92)', border: '1px solid #6b4a12',
          borderRadius: 999, padding: '6px 12px', userSelect: 'none',
          boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        }}
      >
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', animation: 'loopPulse 1.4s ease-in-out infinite' }} />
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>
          {data.count} loop
        </span>
        <span style={{ color: '#8a6a30', fontSize: 12 }}>çalışıyor</span>
      </div>

      <style>{`@keyframes loopPulse{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>

      {open && (
        <div style={{
          marginTop: 6, background: 'rgba(20,14,4,0.96)', border: '1px solid #4a3410',
          borderRadius: 10, padding: 8, maxWidth: 280, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {data.loops.map(l => {
            const here = l.roomId === currentRoomId
            return (
              <div
                key={l.mediaId}
                onClick={() => goTo(l.roomId)}
                style={{
                  padding: '6px 8px', borderRadius: 6, cursor: here ? 'default' : 'pointer',
                  marginBottom: 4, background: here ? 'rgba(245,158,11,0.10)' : 'transparent',
                  border: `1px solid ${here ? '#6b4a12' : 'transparent'}`,
                }}
                onMouseEnter={e => { if (!here) e.currentTarget.style.background = 'rgba(245,158,11,0.08)' }}
                onMouseLeave={e => { if (!here) e.currentTarget.style.background = 'transparent' }}
                title={here ? 'Bu odadasın' : 'Odaya git'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#e7c98a', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {here ? '● ' : '↪ '}{roomName(l.roomId)}
                  </span>
                  <span style={{ color: '#a87a30', fontSize: 11, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    iter {l.iteration}/{l.maxIterations}
                  </span>
                </div>
                <div style={{ color: '#8a6a30', fontSize: 11, marginTop: 2, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {l.goal}
                </div>
              </div>
            )
          })}
          <div style={{ color: '#6b5220', fontSize: 10, textAlign: 'right', paddingTop: 2 }}>
            tavan {data.max}
          </div>
        </div>
      )}
    </div>
  )
}
