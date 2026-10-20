// Timeline sayfası ortak görsel sabitleri (ızgara, gün canvas'ı, eksen)
export const API = import.meta.env.VITE_API_URL ?? ''
export const FONT_UI = "'DM Sans', system-ui, sans-serif"
export const FONT_DISPLAY = "'Fraunces', Georgia, serif"
export const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"

export const C = {
  bg: '#0b0b10', panel: '#0f0f15', line: 'rgba(255,255,255,0.08)', text: '#ece9f4', dim: 'rgba(236,233,244,0.55)',
  faint: 'rgba(236,233,244,0.32)', accent: '#818cf8', brand: 'linear-gradient(135deg, #ff9500, #ff6000)', today: '#ff8a1f',
}

// Kenarlık ayrık özelliklerle: toolOn / renk varyantları yalnız borderColor değiştirir (kısaltma ile karışmaz)
export const toolBtn = { height: 32, padding: '0 12px', borderRadius: 9, borderWidth: 1, borderStyle: 'solid', borderColor: C.line, background: 'rgba(255,255,255,0.03)', color: C.text,
  font: `800 12px ${FONT_UI}`, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }
export const toolOn = { background: 'rgba(129,140,248,0.18)', borderColor: 'rgba(129,140,248,0.6)', color: '#c7d2fe' }
export const divider = { width: 1, height: 22, background: C.line, flexShrink: 0 }
