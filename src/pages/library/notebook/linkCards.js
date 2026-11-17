// focus-room eklentisi: deftere yapıştırılan link, canvas tile'daki gibi bir karta dönüşür.
// Sınıflandırma (YouTube / Instagram / genel site) ve kart verisi canvas ile ortak
// (components/canvas/canvasUtils.js linkCardData) — iki yüzey aynı kartı üretir.
import { linkCardData, parseWebUrl } from '../../../components/canvas/canvasUtils.js'

// Ctrl+Shift+V (düz yapıştır) linki kart yapmaz, yazı olarak girer. paste olayı tuşları
// taşımadığından son yapıştırma kısayolunun zamanı tutulur; olay hemen ardından gelir. Bayrak
// tüketilmez (resim yapıştırılırsa bir sonraki yapıştırmaya sarkmasın).
const PLAIN_WINDOW_MS = 1000
let plainPasteAt = 0
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') plainPasteAt = e.shiftKey ? Date.now() : 0
    },
    true,
  )
}

// Panodaki şey tek başına bir web adresiyse o adres; değilse (ya da düz yapıştırmada) null
export function pastedLink(clipboardData) {
  if (Date.now() - plainPasteAt < PLAIN_WINDOW_MS) return null
  const text = clipboardData.getData('text/plain').trim()
  return parseWebUrl(text) ? text : null
}

// Linkin kartı: { type: 'link', kind, url, title, thumbUrl, siteName }
export async function linkAttachment(url) {
  const d = await linkCardData(url)
  return { type: 'link', kind: d.kind, url, title: d.title || '', thumbUrl: d.thumbUrl || '', siteName: d.siteName || '' }
}

export function openLink(url) {
  window.open(url, '_blank', 'noopener')
}
