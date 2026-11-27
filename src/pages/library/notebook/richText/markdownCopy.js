// Biçimli görünen Markdown yazısından kopyalama: seçilen yer, ham yazıdaki (Markdown) karşılığıyla
// panoya gider. Böylece duvardaki metin tile'ından kopyalanıp başka bir metin tile'ına (ya da deftere)
// yapıştırılan yazı HTML'den yeniden üretilmez, aynı Markdown olarak girer ve aynı görünür.
//
// Seçimin ham yazıdaki yeri MarkdownView'in işaretlerinden okunur:
//   data-raw / data-len  → yazı parçası (ham yazıda nereden başladığı, kaç karakter olduğu)
//   data-src / data-src-len → bölünmeyen blok (kod, tablo, görsel, çizgi): seçim içine düşerse bloğun
//                              tamamı alınır
//
// Panoya: text/plain = Markdown, text/html = görünen biçimli yazı + içinde Markdown'ın kendisi
// (data-focus-md). Yapıştırırken clipboardToMarkdown önce bu işarete bakar.
import { Lexer } from 'marked'

import { locateTokens } from './markdownOffsets.js'

const MD_ATTR = 'data-focus-md'
const LAST_KEY = 'focus-room:last-copied-md'
const BLANK = /\u200B/g

// ─── Seçim → ham yazıdaki aralık ─────────────────────────────────────────────

// Kökün içindeki en dıştaki işaretli öğeler (bölünmeyen bloğun içindeki yazı parçaları sayılmaz)
function marks(root) {
  return [...root.querySelectorAll('[data-raw], [data-src]')].filter(
    (el) => el.hasAttribute('data-src') || !el.parentElement?.closest('[data-src]'),
  )
}

function bounds(el) {
  if (el.hasAttribute('data-src')) {
    const from = Number(el.dataset.src)
    return { from, to: from + Number(el.dataset.srcLen) }
  }
  const from = Number(el.dataset.raw)
  return { from, to: from + Number(el.dataset.len) }
}

// Seçimin bir ucu (node, offset) ham yazıda nereye düşer; side: 'start' | 'end'
function pointToSource(root, node, offset, side) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  const atomic = el?.closest('[data-src]')
  if (atomic && root.contains(atomic)) {
    const b = bounds(atomic)
    return { at: side === 'start' ? b.from : b.to, atomic }
  }
  const leaf = el?.closest('[data-raw]')
  if (leaf && root.contains(leaf)) {
    const b = bounds(leaf)
    // Görünen yazı ham yazıyla aynı değilse (ör. &amp;) parça bütün alınır
    if (leaf.dataset.exact === '0') return { at: side === 'start' ? b.from : b.to }
    const r = document.createRange()
    r.selectNodeContents(leaf)
    r.setEnd(node, offset)
    return { at: b.from + Math.min(b.to - b.from, r.toString().length) }
  }
  // Öğelerin arasında (ör. bütün tile seçildi): başlangıç sonraki ilk parçaya, bitiş önceki son parçaya
  const list = marks(root)
  if (side === 'start') {
    for (const m of list) {
      const r = document.createRange()
      r.selectNode(m)
      if (r.comparePoint(node, offset) <= 0) return { at: bounds(m).from }
    }
    return null
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const r = document.createRange()
    r.selectNode(list[i])
    if (r.comparePoint(node, offset) >= 0) return { at: bounds(list[i]).to }
  }
  return null
}

export function rangeToSource(root, range) {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const a = pointToSource(root, range.startContainer, range.startOffset, 'start')
  const b = pointToSource(root, range.endContainer, range.endOffset, 'end')
  if (!a || !b || a.at >= b.at) return null
  // Tek kod bloğunun içinden seçilen yazı kod olarak (çitsiz) kopyalanır: tarayıcı kendisi yapar
  if (a.atomic && a.atomic === b.atomic && a.atomic.dataset.srcKind === 'code') return null
  return { start: a.at, end: b.at }
}

// ─── Aralık → kendi başına geçerli Markdown ──────────────────────────────────

// Satır içi biçimler (kalın, italik, üstü çizili, link, satır içi kod): ham yazıdaki yeri ve
// işaretlerinin arasındaki yazının yeri
function inlineContainers(tokens, offsets, out = []) {
  for (const t of tokens ?? []) {
    const at = offsets.get(t)
    if (at !== undefined && ['strong', 'em', 'del', 'link', 'codespan'].includes(t.type)) {
      let inner = null
      if (t.type === 'codespan') {
        const i = t.raw.indexOf(t.text)
        if (i >= 0) inner = { start: at + i, end: at + i + t.text.length }
      } else if (t.tokens?.length) {
        const first = offsets.get(t.tokens[0])
        const last = t.tokens[t.tokens.length - 1]
        const lastAt = offsets.get(last)
        if (first !== undefined && lastAt !== undefined) inner = { start: first, end: lastAt + last.raw.length }
      }
      if (inner) out.push({ at, end: at + t.raw.length, inner })
    }
    if (t.type === 'list') for (const item of t.items) inlineContainers(item.tokens, offsets, out)
    else if (t.type === 'table') {
      for (const cell of [...t.header, ...t.rows.flat()]) inlineContainers(cell.tokens, offsets, out)
    } else if (t.type !== 'codespan') inlineContainers(t.tokens, offsets, out)
  }
  return out
}

const LINE_PREFIX = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#{1,6}[ \t]+|(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?$/

// Ham yazının [start, end) aralığı, açık kalan biçim işaretleri tamamlanarak: kalın bir sözcüğün
// yarısı seçildiyse "**" iki ucuna da konur; satırın başından seçildiyse başlık/madde işareti de alınır
export function sliceMarkdown(source, start, end) {
  const tokens = Lexer.lex(source, { gfm: true })
  const offsets = locateTokens(tokens, source)
  const containers = inlineContainers(tokens, offsets).sort((x, y) => x.at - y.at || y.end - x.end)

  let s = start
  let e = end
  const open = []
  const close = []
  for (const c of containers) {
    if (c.at < s && s < c.end) {
      if (s <= c.inner.start) s = c.at
      else if (s >= c.inner.end) s = c.end
      else open.push(c)
    }
  }
  for (const c of containers) {
    if (c.at < e && e < c.end) {
      if (e >= c.inner.end) e = c.end
      else if (e <= c.inner.start) e = c.at
      else close.push(c)
    }
  }
  if (s >= e) return ''

  // Seçim satırdaki yazının başından başlıyorsa satır önü işareti (# , - , 1. , > , - [ ] ) da alınır
  const lineStart = source.lastIndexOf('\n', s - 1) + 1
  let lead = ''
  if (open.length === 0 && LINE_PREFIX.test(source.slice(lineStart, s))) {
    s = lineStart
    // İç içe maddeden başlayan seçim girintisiz kalsın (4 boşluk kod bloğu olurdu)
    lead = /^[ \t]*/.exec(source.slice(lineStart))[0]
  }

  let body = source.slice(s, e)
  if (lead) {
    const n = lead.length
    body = body
      .split('\n')
      .map((line) => line.replace(new RegExp(`^[ \\t]{0,${n}}`), ''))
      .join('\n')
  }
  const text =
    open.map((c) => source.slice(c.at, c.inner.start)).join('') +
    body +
    close
      .reverse()
      .map((c) => source.slice(c.inner.end, c.end))
      .join('')
  return text.replace(BLANK, '').replace(/^\n+/, '').replace(/\s+$/, '')
}

// ─── Pano ────────────────────────────────────────────────────────────────────

function escapeAttr(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// copy / cut olayında: seçim kökün içindeyse Markdown panoya yazılır, true döner. Yazılamazsa
// (seçim yok, kökün dışında, tek kod bloğunun içinde) false: tarayıcı kendisi kopyalar.
export function copyMarkdownSelection(e, root, source) {
  const sel = window.getSelection?.()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !e.clipboardData) return false
  const range = sel.getRangeAt(0)
  const at = rangeToSource(root, range)
  if (!at) return false
  const md = sliceMarkdown(source, at.start, at.end)
  if (!md.trim()) return false
  const holder = document.createElement('div')
  holder.appendChild(range.cloneContents())
  e.clipboardData.setData('text/plain', md)
  e.clipboardData.setData('text/html', `<div ${MD_ATTR}="${escapeAttr(encodeURIComponent(md))}">${holder.innerHTML}</div>`)
  e.preventDefault()
  try {
    localStorage.setItem(LAST_KEY, md)
  } catch {
    // depolama kapalı: yalnızca HTML işareti kullanılır
  }
  return true
}

// Panodaki yazı bizim kopyaladığımız Markdown mı? Öyleyse Markdown'ın kendisi, değilse null.
// Önce HTML'deki işarete bakılır; tarayıcı HTML'i temizlediyse (ör. navigator.clipboard.read)
// düz metin son kopyalanan Markdown'la aynıysa o kullanılır.
export function copiedMarkdown({ html, plain }) {
  if (html && html.includes(MD_ATTR)) {
    const m = new RegExp(`${MD_ATTR}="([^"]*)"`).exec(html)
    if (m) {
      try {
        const md = decodeURIComponent(
          m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
        )
        if (md.trim()) return md
      } catch {
        // bozuk işaret: normal dönüştürmeye düşülür
      }
    }
  }
  const text = (plain ?? '').replace(/\r\n?/g, '\n')
  if (!text.trim()) return null
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (last && last === text) return last
  } catch {
    // depolama kapalı
  }
  return null
}
