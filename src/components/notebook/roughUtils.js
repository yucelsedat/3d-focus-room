// rough.js yardımcıları (bileşen değil). Tüm şekiller sabit seed'le üretilir:
// aynı satır her açılışta birebir aynı "el çizimi"ni alır.
import rough from 'roughjs'
import { PENCIL } from './paperStyles'

export const gen = rough.generator()

// Üstü çizme / başlık altı çizgisi: textarea'nın aynasındaki span'e arka plan
// olarak basılır. preserveAspectRatio=none + non-scaling-stroke → her sarılan
// satır parçasında aynı kalınlıkta, genişliğe uzayan bir kalem çizgisi.
const cache = new Map()
export function lineDataUri(seed, kind = 'strike') {
  const key = `${kind}:${seed}`
  let uri = cache.get(key)
  if (uri) return uri
  const y = kind === 'strike' ? 10 : 16
  const paths = gen.toPaths(gen.line(2, y, 198, y + (kind === 'strike' ? -1.5 : 0.5), {
    seed,
    roughness: kind === 'strike' ? 1.6 : 1.1,
    bowing: kind === 'strike' ? 0.8 : 1.4,
    stroke: PENCIL,
    strokeWidth: kind === 'strike' ? 1.7 : 1.5,
  }))
  const d = paths.map(p => `<path d='${p.d}' fill='none' stroke='${PENCIL}' stroke-width='${kind === 'strike' ? 1.7 : 1.5}' stroke-linecap='round' vector-effect='non-scaling-stroke'/>`).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 20' preserveAspectRatio='none'>${d}</svg>`
  uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
  cache.set(key, uri)
  return uri
}
