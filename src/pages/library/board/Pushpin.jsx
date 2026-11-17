// Seyir defteri: components/board/Pushpin.tsx — yukarıdan bakılan raptiye: yuvarlak plastik baş,
// ortasında çukur, üstünde ışık parlaması ve sağ alta düşen gölgesi.
import { pinColorOf } from '../theme.js'

export const PIN_SIZE = 30

// id: gradyanın kimliği; aynı ekrandaki raptiyeler birbirinin boyasını almasın
export function Pushpin({ id, color }) {
  const { head, rim } = pinColorOf(color)
  const gradient = `pin-${id}`
  return (
    <svg width={PIN_SIZE} height={PIN_SIZE} viewBox="0 0 30 30" aria-hidden="true" style={{ display: 'block', pointerEvents: 'none' }}>
      <defs>
        <radialGradient id={gradient} cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor={head} />
          <stop offset="0.55" stopColor={head} />
          <stop offset="1" stopColor={rim} />
        </radialGradient>
      </defs>
      <ellipse cx={17.5} cy={18.5} rx={9.5} ry={7.5} fill="#000" opacity={0.3} />
      <circle cx={13.5} cy={13} r={10} fill={rim} />
      <circle cx={13.5} cy={13} r={9} fill={`url(#${gradient})`} />
      <circle cx={13.5} cy={13} r={4.2} fill={rim} opacity={0.35} />
      <circle cx={13.5} cy={13} r={3.2} fill={head} />
      <ellipse cx={10.5} cy={9} rx={3.2} ry={2} fill="#fff" opacity={0.55} />
    </svg>
  )
}
