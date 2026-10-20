// Timeline ortak arayüz parçaları
import { FONT_UI, FONT_MONO, C, toolBtn } from './theme'

export function SaveBadge({ state }) {
  const map = {
    saved: ['Kaydedildi', '#4ade80'], dirty: ['Değişiklik var', C.faint], saving: ['Kaydediliyor…', '#93c5fd'],
    error: ['Kaydedilemedi · tekrar denenecek', '#f87171'], conflict: ['Çakışma', '#fbbf24'],
  }
  const [label, color] = map[state] || map.saved
  return <span title={label} style={{ font: `200 11px ${FONT_MONO}`, color, whiteSpace: 'nowrap', flexShrink: 0 }}>● <span className="tl-hide-md">{label}</span></span>
}

// Başka sekmede yazılmış sürümle çakışma: hangisinin kalacağını kullanıcı seçer
export function ConflictBanner({ conflict, onResolve }) {
  if (!conflict) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'rgba(251,191,36,0.1)', borderBottom: '1px solid rgba(251,191,36,0.3)', font: `300 13px ${FONT_UI}`, flexWrap: 'wrap' }}>
      <span style={{ color: '#fbbf24', fontWeight: 800 }}>Bu timeline başka bir sekmede değişti.</span>
      <span style={{ color: C.dim }}>Değişikliklerin henüz kaydedilmedi.</span>
      <span style={{ flex: 1 }} />
      <button className="tl-btn" onClick={() => onResolve(true)} style={toolBtn}>Onlarınkini yükle</button>
      <button className="tl-btn" onClick={() => onResolve(false)} style={{ ...toolBtn, color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)' }}>Benimkiyle üzerine yaz</button>
    </div>
  )
}
