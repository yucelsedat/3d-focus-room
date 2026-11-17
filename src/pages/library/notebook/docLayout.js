// Belge modunun (PDF sayfası) ortak ölçüleri; bileşen dosyalarından ayrı ki hızlı yenileme çalışsın
import { Lexer } from 'marked'

import { docPage, fonts } from '../theme.js'

// Belge modunda sayfa kenardan kenara yazıdır; yalnızca soldaki boşlukta bloğun tutamacı durur
export const DOC_ROW_LEFT = docPage.gutter
export const DOC_ROW_RIGHT = docPage.edge

// Biçimli görünümün üstündeki ve altındaki boşluk
export const DOC_RENDERED_PAD = 2

const SIZE = docPage.fontSize

// Yazı ölçüleri: h1 1.75em/800, h2 1.4em/700, h3 1.15em/600, satır yüksekliği 1.28
export const HEADINGS = {
  1: { scale: 1.75, font: fonts.displayBold },
  2: { scale: 1.4, font: fonts.docHeadingBold },
  3: { scale: 1.15, font: fonts.docHeadingSemi },
  4: { scale: 1, font: fonts.bodyBold },
  5: { scale: 0.92, font: fonts.bodyBold },
  6: { scale: 0.85, font: fonts.bodyBold },
}

// Başlığın yazı boyu, satır yüksekliği ve üstündeki boşluk
export function headingMetrics(depth) {
  const level = Math.min(6, Math.max(1, depth))
  const fontSize = SIZE * HEADINGS[level].scale
  return { level, fontSize, lineHeight: Math.round(fontSize * 1.28), marginTop: level <= 2 ? 6 : 2 }
}

// Yazı bir başlıkla başlıyorsa, biçimli görünümde o ilk satırın dikey ortası (görünümün üstünden);
// başlıkla başlamıyorsa null
export function leadingHeadingCenter(value) {
  const head = value.replace(/^\s*\n/, '').split('\n', 2).join('\n')
  const first = Lexer.lex(head, { gfm: true }).find((t) => t.type !== 'space')
  if (first?.type !== 'heading') return null
  const m = headingMetrics(first.depth)
  return m.marginTop + m.lineHeight / 2
}
