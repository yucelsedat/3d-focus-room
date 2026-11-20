// Oyunda kısa süre görünen uyarı (ör. B'ye basıldı ama elde defter yok). İmleç kilitliyken de
// görünür; tıklanmaz (pointer-events: none), kendiliğinden kaybolur. Aynı uyarı tekrar
// gösterilirse süre baştan başlar (id değişir).
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

const SHOW_MS = 2600
const FADE_MS = 220
const FONT_UI = "'DM Sans', system-ui, sans-serif"
const FONT_DISPLAY = "'Fraunces', Georgia, serif"

export function HudNotice() {
  const notice = useStore(st => st.hudNotice)
  const clear = useStore(st => st.clearHudNotice)
  // Solma anı: kaybolmadan FADE_MS önce
  const [fadingId, setFadingId] = useState(null)

  useEffect(() => {
    if (!notice) return
    const id = notice.id
    const t1 = setTimeout(() => setFadingId(id), SHOW_MS - FADE_MS)
    const t2 = setTimeout(() => clear(id), SHOW_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [notice, clear])

  if (!notice) return null
  const fading = fadingId === notice.id
  return (
    <div role="status" aria-live="polite"
      style={{ position: 'fixed', left: '50%', top: '58%', transform: 'translateX(-50%)', zIndex: 2147483647,
        pointerEvents: 'none', userSelect: 'none', textAlign: 'center',
        padding: '14px 22px 15px', borderRadius: 10, background: 'rgba(20,18,15,0.86)', backdropFilter: 'blur(6px)',
        border: '1px solid rgba(244,239,230,0.14)', boxShadow: '0 18px 40px -20px rgba(0,0,0,0.9)', color: '#f4efe6',
        opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out`, animation: 'hudNoticeIn 180ms ease-out' }}>
      <style>{'@keyframes hudNoticeIn { from { opacity: 0; transform: translate(-50%, 6px) } to { opacity: 1; transform: translate(-50%, 0) } }'}</style>
      <div style={{ font: `italic 200 24px/1.15 ${FONT_DISPLAY}`, whiteSpace: 'nowrap' }}>{notice.text}</div>
      {notice.sub && (
        <div style={{ marginTop: 6, font: `800 10px ${FONT_UI}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(244,239,230,0.55)' }}>
          {notice.sub}
        </div>
      )}
    </div>
  )
}
