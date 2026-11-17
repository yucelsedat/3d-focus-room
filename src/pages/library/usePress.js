import { useRef } from 'react'

// RN Pressable'ın onPress + onLongPress davranışı: basılı tutma 500 ms'yi geçerse uzun basma
// sayılır ve ardından gelen tıklama yutulur. Masaüstünde sağ tık da uzun basmadır.
const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10

export function usePress({ onPress, onLongPress, disabled = false }) {
  const state = useRef({ timer: 0, x: 0, y: 0, fired: false })

  function clear() {
    clearTimeout(state.current.timer)
    state.current.timer = 0
  }

  if (disabled) return {}

  return {
    onPointerDown(e) {
      if (e.button !== 0) return
      const s = state.current
      s.fired = false
      s.x = e.clientX
      s.y = e.clientY
      clear()
      if (onLongPress) {
        s.timer = setTimeout(() => {
          s.timer = 0
          s.fired = true
          onLongPress()
        }, LONG_PRESS_MS)
      }
    },
    onPointerMove(e) {
      const s = state.current
      if (s.timer && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClick(e) {
      if (state.current.fired) {
        state.current.fired = false
        e.preventDefault()
        return
      }
      onPress?.()
    },
    onContextMenu(e) {
      if (!onLongPress) return
      e.preventDefault()
      clear()
      onLongPress()
    },
  }
}
