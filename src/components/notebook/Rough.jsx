// El çizimi (rough.js) SVG primitifleri. rough.generator ile yol üretilip React
// <path> olarak çizilir (DOM'a imperatif ekleme yok); yollar seed + boyuta göre memo.
import { useMemo } from 'react'
import { gen } from './roughUtils'
import { PENCIL, PENCIL_SOFT } from './paperStyles'

function Paths({ paths, w, h, className, style, animate }) {
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={[className, animate ? 'nb-draw' : null].filter(Boolean).join(' ') || undefined}
      style={{ overflow: 'visible', display: 'block', ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fill={p.fill && p.fill !== 'none' ? p.fill : 'none'}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={animate ? 1 : undefined}
        />
      ))}
    </svg>
  )
}

// Kutucuk
export function RoughBox({ size = 20, seed, stroke = PENCIL }) {
  const paths = useMemo(
    () => gen.toPaths(gen.rectangle(1.5, 1.5, size - 3, size - 3, {
      seed, stroke, strokeWidth: 1.25, roughness: 1.35, bowing: 1.6,
    })),
    [size, seed, stroke],
  )
  return <Paths paths={paths} w={size} h={size} />
}

// Tik işareti — kutunun dışına taşan, aceleyle atılmış bir kalem hareketi
export function RoughCheck({ size = 20, seed, animate }) {
  const paths = useMemo(
    () => gen.toPaths(gen.linearPath(
      [[size * 0.14, size * 0.52], [size * 0.42, size * 0.84], [size * 1.08, -size * 0.12]],
      { seed: seed + 1, stroke: PENCIL, strokeWidth: 2, roughness: 1.1, bowing: 0.6 },
    )),
    [size, seed],
  )
  return (
    <Paths
      paths={paths}
      w={size}
      h={size}
      animate={animate}
      style={{ position: 'absolute', left: 0, top: 0 }}
    />
  )
}

// Not satırı madde işareti: kısa yatay kalem darbesi
export function RoughDash({ width = 12, seed }) {
  const paths = useMemo(
    () => gen.toPaths(gen.line(1, 5, width - 1, 4, { seed, stroke: PENCIL, strokeWidth: 1.6, roughness: 1.2 })),
    [width, seed],
  )
  return <Paths paths={paths} w={width} h={9} />
}

// Yatay çizgi (başlık altı vb.)
export function RoughLine({ width, height = 10, seed, stroke = PENCIL, strokeWidth = 1.4 }) {
  const paths = useMemo(
    () => gen.toPaths(gen.line(2, height / 2, width - 2, height / 2 + 1, {
      seed, stroke, strokeWidth, roughness: 1.3, bowing: 2,
    })),
    [width, height, seed, stroke, strokeWidth],
  )
  return <Paths paths={paths} w={width} h={height} />
}

// Daire (kapatma düğmesi çerçevesi)
export function RoughCircle({ size, seed, stroke = PENCIL, strokeWidth = 1.5 }) {
  const paths = useMemo(
    () => gen.toPaths(gen.ellipse(size / 2, size / 2, size - 6, size - 8, {
      seed, stroke, strokeWidth, roughness: 1.6, bowing: 1.2,
    })),
    [size, seed, stroke, strokeWidth],
  )
  return <Paths paths={paths} w={size} h={size} />
}

// Alt görev ilerleme halkası: soluk tam daire + oran kadar koyu yay
export function RoughRing({ size = 22, seed, ratio }) {
  const r = Math.round(Math.max(0, Math.min(1, ratio)) * 24) / 24
  const paths = useMemo(() => {
    const c = size / 2
    const d = size - 5
    const out = gen.toPaths(gen.ellipse(c, c, d, d, { seed, stroke: PENCIL_SOFT, strokeWidth: 1, roughness: 0.9 }))
    if (r >= 1) {
      out.push(...gen.toPaths(gen.ellipse(c, c, d, d, {
        seed: seed + 7, stroke: PENCIL, strokeWidth: 2, roughness: 1, fill: 'rgba(44,44,52,.55)', fillStyle: 'hachure', hachureGap: 3.2,
      })))
    } else if (r > 0) {
      out.push(...gen.toPaths(gen.arc(c, c, d, d, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * r, false, {
        seed: seed + 7, stroke: PENCIL, strokeWidth: 2.2, roughness: 0.8,
      })))
    }
    return out
  }, [size, seed, r])
  return <Paths paths={paths} w={size} h={size} />
}

// Sayfa ilerleme çubuğu: kalemle çizilmiş çerçeve + oran kadar tarama
export function RoughBar({ width = 120, height = 12, seed, ratio }) {
  const r = Math.round(Math.max(0, Math.min(1, ratio)) * 40) / 40
  const paths = useMemo(() => {
    const out = gen.toPaths(gen.rectangle(1, 1, width - 2, height - 2, {
      seed, stroke: PENCIL, strokeWidth: 1.1, roughness: 1.2, bowing: 1.5,
    }))
    if (r > 0) {
      out.push(...gen.toPaths(gen.rectangle(2, 2, Math.max(3, (width - 4) * r), height - 4, {
        seed: seed + 3, stroke: 'none', fill: 'rgba(44,44,52,.7)', fillStyle: 'hachure', hachureGap: 3, hachureAngle: -50, fillWeight: 1.1, roughness: 1.1,
      })))
    }
    return out
  }, [width, height, seed, r])
  return <Paths paths={paths} w={width} h={height} />
}

// Sürükleme tutamağı: 2x3 kalem noktası
export function Grip() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      {[2.5, 7.5].map(x => [3, 8, 13].map(y => (
        <circle key={`${x}-${y}`} cx={x + (y % 2 ? 0.3 : -0.2)} cy={y} r="1.35" fill={PENCIL} />
      )))}
    </svg>
  )
}
