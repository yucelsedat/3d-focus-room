// Sayfayı sola (önceki) / sağa (sonraki) çeviren yuvarlak kâğıt düğme. Kitaplıkta açılan defterde
// kâğıdın iki yanında (NotebookScreen), duvardaki defter tile'ında tile'ın iki kenarında durur.
import { colors } from '../theme.js'
import { HandIcon } from './HandIcon.jsx'

export function PageTurnButton({ side, disabled, onPress, size = 36, style }) {
  const left = side === 'left'
  return (
    <div
      style={{
        padding: 4,
        borderRadius: 999,
        background: 'rgba(244, 239, 230, 0.94)',
        boxShadow: '0 8px 22px -8px rgba(0, 0, 0, 0.6)',
        opacity: disabled ? 0.55 : 1,
        pointerEvents: 'auto',
        ...style,
      }}
    >
      <HandIcon
        shape={left ? 'back' : 'forward'}
        label={left ? 'Önceki sayfa' : 'Sonraki sayfa'}
        size={size}
        color={colors.ink}
        disabled={disabled}
        onPress={onPress}
      />
    </div>
  )
}
