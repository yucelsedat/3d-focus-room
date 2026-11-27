// ── Metin tile'ının blokları ──────────────────────────────────────────────────
// Tile'ın içeriği düz Markdown olarak saklanır (EditModal, ölçüm, kopyalama hep onu okur). Duvarda
// defterdeki gibi bloklara ayrılır: her blok en üst düzeydeki bir Markdown bloğudur (başlık, paragraf,
// liste, alıntı, kod, tablo, görsel şeridi, çizgi). Bloklar araya boş satır konarak yeniden birleşir.
//
// Birleşince komşusuyla tek bloğa dönüşecek bloklar (ör. art arda iki liste) arasına görünmeyen bir
// ayırıcı (<!-- -->) girer; ayrıştırırken ayırıcılar atlanır. Açık kalmış kod çiti kaydedilirken
// kapatılır, yoksa ardındaki bütün bloklar koda dönüşürdü.
import { Lexer } from 'marked'

import { attachmentUrl } from '../../pages/library/notebook/attachments.js'
import { parseContent } from '../../pages/library/notebook/noteContent.js'

export const SEPARATOR = '<!-- -->'
const ZERO_WIDTH = /\u200B/g

let seq = 0
export const newBlockId = () => `b${++seq}`

const lex = (text) => Lexer.lex(text, { gfm: true })
const isSeparator = (token) => token.type === 'html' && token.raw.trim() === SEPARATOR
const counted = (tokens) => tokens.filter((t) => t.type !== 'space' && !isSeparator(t)).length

// Yazının en üst düzey parçaları: [{ start, end }] (sondaki satır sonları hariç). Bağlantı tanımları
// ([x]: url) kendi başına blok olmaz, önündeki parçaya katılır.
export function blockRanges(text) {
  const tokens = lex(text)
  const ranges = []
  let at = 0
  for (const token of tokens) {
    const start = at
    at += token.raw.length
    if (token.type === 'space' || isSeparator(token)) continue
    let end = at
    while (end > start && text[end - 1] === '\n') end--
    if (token.type === 'def' && ranges.length > 0) {
      ranges[ranges.length - 1].end = end
      continue
    }
    ranges.push({ start, end })
  }
  // Token'lar yazıyı baştan sona kaplamıyorsa (beklenmez) yazı tek blok kalır
  if (at !== text.length) return text.trim() === '' ? [] : [{ start: 0, end: text.length }]
  return ranges
}

// Saklanan Markdown → blokların yazıları
export function splitMarkdown(markdown) {
  const text = (markdown ?? '').replace(ZERO_WIDTH, '').replace(/\r\n?/g, '\n')
  return blockRanges(text).map((r) => text.slice(r.start, r.end))
}

export function blocksFromMarkdown(markdown) {
  return splitMarkdown(markdown).map((text) => ({ id: newBlockId(), text }))
}

// Blok kaydedilecek hâline gelir: baştaki boş satırlar ve sondaki boşluklar gider, açık kod çiti
// kapanır
function finish(text) {
  let out = text.replace(ZERO_WIDTH, '').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '')
  if (out === '') return ''
  const tokens = lex(out).filter((t) => t.type !== 'space')
  const last = tokens[tokens.length - 1]
  if (last?.type === 'code') {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(last.raw)
    if (open) {
      const fence = open[1]
      const lines = last.raw.replace(/\n+$/, '').split('\n')
      const closing = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`)
      if (lines.length < 2 || !closing.test(lines[lines.length - 1])) out += '\n' + fence
    }
  }
  return out
}

// Blokların yazıları → saklanan Markdown. Boş bloklar yazılmaz.
export function joinBlocks(texts) {
  const parts = texts.map(finish).filter((t) => t !== '')
  let out = ''
  let prev = null
  let prevCount = 0
  for (const part of parts) {
    const count = counted(lex(part))
    if (prev !== null) {
      // Boş satırla birleşince komşusuyla kaynaşıyorsa araya ayırıcı girer
      const merged = counted(lex(prev + '\n\n' + part))
      out += merged < prevCount + count ? `\n\n${SEPARATOR}\n\n` : '\n\n'
    }
    out += part
    prev = part
    prevCount = count
  }
  return out
}

// Bir bloğun yazısı birden çok Markdown bloğu taşıyorsa (ham düzenleme, yapıştırma) parçalara
// ayrılır. caret: bloğun yazısındaki imleç; hangi parçada, nerede kaldığı da döner.
export function splitBlockText(text, caret = null) {
  const ranges = blockRanges(text)
  if (ranges.length <= 1) return null
  const pieces = ranges.map((r) => text.slice(r.start, r.end))
  if (caret === null) return { pieces, caret: null }
  let index = ranges.findIndex((r) => caret >= r.start && caret <= r.end)
  let offset
  if (index === -1) {
    // İmleç iki parçanın arasındaki boşluktaysa bir önceki parçanın sonuna
    index = Math.max(0, ranges.filter((r) => r.end < caret).length - 1)
    offset = pieces[index].length
  } else {
    offset = caret - ranges[index].start
  }
  return { pieces, caret: { index, offset } }
}

// Bloğun bu yerinde bölünmesi (Enter): önü yerinde kalır, arkası yeni bloğa geçer
export function splitAt(text, at) {
  const head = text.slice(0, at).replace(/\n+$/, '')
  let tail = text.slice(at)
  // Satırın ortasından bölününce arkanın başındaki boşluk gider; satır sonundan bölününce yalnızca
  // boş satırlar (ardındaki satırın girintisi yerinde kalır)
  tail = /^[ \t]*\n/.test(tail) ? tail.replace(/^(?:[ \t]*\n)+/, '') : tail.replace(/^[ \t]+/, '')
  return { head, tail }
}

// Defterin blok panosundaki bir blok (yazı ve ekler) → Markdown blokları. Resimler ve dosyalar
// kitaplıktaki dosyalarının adresiyle girer, link kartları link olur.
export function noteBlockToTexts(block) {
  const parts = []
  for (const s of parseContent(block?.content ?? '')) {
    if (s.type === 'text') {
      if (s.text.trim() !== '') parts.push(s.text)
    } else if (s.type === 'image') {
      parts.push(`![](${attachmentUrl(s.name)})`)
    } else if (s.type === 'file') {
      parts.push(`[${(s.label || s.name).replace(/[[\]]/g, '')}](${attachmentUrl(s.name)})`)
    } else if (s.type === 'link') {
      parts.push(s.title ? `[${s.title.replace(/[[\]]/g, '')}](${s.url})` : s.url)
    }
  }
  return splitMarkdown(parts.join('\n\n'))
}

// Tile'ın bloğu → defterin blok panosundaki blok (boyası, rengi, saati yok)
export function textToNoteBlock(text) {
  return { content: text, highlights: '', inks: '', times: '', time: null }
}

// Başlıkla başlayan blok: kolon sonunda altındaki bloktan ayrılmasın
export const isHeadingBlock = (text) => /^ {0,3}#{1,6}(\s|$)/.test(text)
