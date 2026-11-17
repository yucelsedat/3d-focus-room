// Seyir defteri: lib/richText/markdownUnits.ts (birebir).
// PDF'te yazı biçimli görünürken de yazılır: başlık, paragraf ve liste maddesi gibi yazı parçaları
// ("birim") yerinde düzenlenir. Birim, ham yazının bir aralığıdır; işaretleri (ör. "# ", "- ")
// aralığın dışında, satır içi işaretleri (ör. "**") içindedir. Görseller, tablolar ve kod blokları
// birim değildir; onlar ham Markdown düzenlemesiyle değişir.
//
// Unit = { index, start, end, kind: 'heading'|'paragraph'|'item', block, tokens, level?, quoted? }
import { Lexer } from 'marked'

import { locateTokens } from './markdownOffsets.js'

// Boş yazının tek birimi: yazmaya oradan başlanır
export const BLANK_BLOCK = { type: 'blank' }

// Yalnızca görsellerden oluşan paragrafın görselleri: aralarında boşluk ya da satır sonu olabilir,
// linke sarılı görsel de sayılır. Paragrafta başka bir şey varsa null.
export function imagesOf(tokens) {
  const images = []
  for (const t of tokens ?? []) {
    if (t.type === 'br' || (t.type === 'text' && !/\S/.test(t.text))) continue
    if (t.type === 'image') {
      images.push(t)
      continue
    }
    const inner = t.type === 'link' ? imagesOf(t.tokens) : null
    if (!inner) return null
    images.push(...inner)
  }
  return images.length > 0 ? images : null
}

// Blok yalnızca görsellerden oluşan bir paragrafsa görselleri
export function blockImages(token) {
  if (token.type === 'paragraph') return imagesOf(token.tokens)
  if (token.type === 'text') return imagesOf(token.tokens)
  return null
}

// Satırın sonuna kadarki boşluklar birime dahildir: "- [ ] " gibi yarım yazılmış işaretten sonra
// imleç birimin içinde kalsın
function stretch(source, end) {
  while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end++
  return end
}

export function parseMarkdown(source) {
  const tokens = Lexer.lex(source, { gfm: true })
  const offsets = locateTokens(tokens, source)
  const units = []
  const unitOf = new Map()

  function add(unit) {
    const full = { ...unit, index: units.length }
    units.push(full)
    unitOf.set(unit.block, full)
  }

  // Satır içi token'ları bulunmuş yazı bloğunun aralığı; bulunamayan varsa birim olmaz
  function span(inline) {
    if (inline.length === 0 || inline.some((t) => !offsets.has(t))) return null
    const first = inline[0]
    const last = inline[inline.length - 1]
    let end = offsets.get(last) + last.raw.length
    while (end > offsets.get(first) && source[end - 1] === '\n') end--
    return { start: offsets.get(first), end: stretch(source, end) }
  }

  function walk(list, quoted) {
    for (const token of list) {
      switch (token.type) {
        case 'heading': {
          const at = offsets.get(token)
          if (at === undefined) break
          const range = span(token.tokens) ?? {
            start: stretch(source, at + (/^ {0,3}#{1,6}/.exec(token.raw)?.[0].length ?? 0)),
            end: 0,
          }
          if (range.end < range.start) range.end = range.start
          add({ ...range, kind: 'heading', block: token, tokens: token.tokens, level: token.depth, quoted })
          break
        }
        case 'paragraph': {
          if (blockImages(token)) break
          const range = span(token.tokens)
          if (range) add({ ...range, kind: 'paragraph', block: token, tokens: token.tokens, quoted })
          break
        }
        case 'blockquote':
          walk(token.tokens, true)
          break
        case 'list':
          for (const item of token.items) {
            const body = item.tokens.filter((t) => t.type !== 'checkbox')
            const first = body[0]
            if (first && (first.type === 'text' || first.type === 'paragraph')) {
              const inline = first.tokens ?? [first]
              const range = span(inline)
              if (range) add({ ...range, kind: 'item', block: first, tokens: inline, quoted })
              walk(body.slice(1), quoted)
            } else if (body.length === 0) {
              // Boş madde: işaretinin ardından yazılır
              const at = offsets.get(item)
              if (at === undefined) continue
              const marker = /^\s*(?:[-*+]|\d+[.)])/.exec(source.slice(at))?.[0].length ?? 0
              const start = stretch(source, at + marker)
              add({ start, end: start, kind: 'item', block: item, tokens: [], quoted })
            } else {
              walk(body, quoted)
            }
          }
          break
      }
    }
  }

  walk(tokens, false)
  if (units.length === 0 && source.trim() === '') {
    add({ start: 0, end: source.length, kind: 'paragraph', block: BLANK_BLOCK, tokens: [] })
  }
  return { tokens, offsets, units, unitOf }
}

// Yazının bu yerindeki birim: içinde olduğu ya da (aynı satırda boşluklardan sonra) hemen
// ardında olduğu birim; tercih edilen birim (ör. o an yazılan) öne alınır
export function unitAt(units, at, prefer) {
  const inside = units.filter((u) => u.start <= at && at <= u.end)
  return inside.find((u) => u.index === prefer) ?? inside[0] ?? null
}

// Birimin satırının başındaki işaret (başlık, madde, alıntı); geri silmeyle kaldırılır
export function unitPrefix(source, unit) {
  const lineStart = source.lastIndexOf('\n', unit.start - 1) + 1
  const prefix = source.slice(lineStart, unit.start)
  return /^\s*(?:>\s?)*(?:#{1,6}\s*|[-*+]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s*)?$/.test(prefix) &&
    prefix.trim() !== ''
    ? { start: lineStart, end: unit.start }
    : null
}
