import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

// Render'ı sabit bir FPS'e kilitleyen sürücü.
//
// Canvas `frameloop="demand"` modunda; bu komponent kareyi düzenli aralıklarla
// invalidate ederek sahneyi ~`fps` hızında render ettirir. Monitör 120/144Hz
// olsa bile GPU yalnızca ~30fps'lik iş yapar → ısınma belirgin düşer.
//
// Neden `demand` + invalidate, `never` + advance değil:
// r3f `never` modunda delta'yı `timestamp - clock.elapsedTime` (saniye) ile
// hesaplar; advance'a yanlış birim verilirse ilk karede oyuncu ışınlanır.
// `demand` modunda delta gerçek THREE.Clock'tan gelir → hareket/FOV/video
// (useVideoTexture) birim tuzağı olmadan doğru çalışır.
export function FrameLimiter({ fps = 30 }) {
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const minInterval = 1000 / fps
    let raf = 0
    let last = performance.now()

    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      if (now - last < minInterval) return
      // Sürüklenmeyi telafi et: kalan artığı koruyarak kararlı kadans tut
      last = now - ((now - last) % minInterval)
      invalidate()
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [invalidate, fps])

  return null
}
