// Seyir defteri: lib/richText/markdownEdit.ts (birebir).
// PDF defterinin bloklarında yazı Markdown'dır. Buradaki işlevler yazının kendisini değiştirir;
// imleç ve seçim, bloğun yazısındaki konumlarla verilir ve döner.
//
// Edit = { text, start, end }
// EnterResult = { kind: 'edit', edit } | { kind: 'split', head, tail }

const LIST_ITEM = /^(\s*(?:>\s?)*)([-*+]|(\d+)([.)]))( \[[ xX]\])?( +|$)/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

function lineStart(text, at) {
  return text.lastIndexOf('\n', at - 1) + 1
}

function lineEnd(text, at) {
  const end = text.indexOf('\n', at)
  return end === -1 ? text.length : end
}

// İmleçten önce açılmış ama kapanmamış bir kod çiti var mı
export function insideFence(text, at) {
  let open = null
  for (const line of text.slice(0, lineStart(text, at)).split('\n')) {
    const match = FENCE.exec(line)
    if (!match) continue
    const marker = match[1]
    if (open === null) open = marker
    else if (marker[0] === open[0] && marker.length >= open.length) open = null
  }
  return open !== null
}

// Enter'a basıldı: ya yazıya satır sonu girer (liste sürer ya da biter), ya da blok ikiye bölünür.
// Bölünürken imlecin durduğu boş satır silinir: önü bu blokta kalır, arkası yeni bloğa geçer.
export function markdownEnter(text, start, end = start) {
  const insert = (value, from = start, to = end) => ({
    kind: 'edit',
    edit: {
      text: text.slice(0, from) + value + text.slice(to),
      start: from + value.length,
      end: from + value.length,
    },
  })
  if (start !== end || insideFence(text, start)) return insert('\n')

  const from = lineStart(text, start)
  const to = lineEnd(text, start)
  const line = text.slice(from, to)

  const item = LIST_ITEM.exec(line)
  if (item && start >= from + item[0].length) {
    const [prefix, quote, , number, delimiter, task] = item
    // Boş madde: liste biter, işaret silinir (alıntının içindeyse alıntı sürer)
    if (line.slice(prefix.length).trim() === '' && start === to) {
      const keep = quote.includes('>') ? quote : ''
      return {
        kind: 'edit',
        edit: {
          text: text.slice(0, from) + keep + text.slice(to),
          start: from + keep.length,
          end: from + keep.length,
        },
      }
    }
    const marker = number ? `${Number(number) + 1}${delimiter}` : item[2]
    return insert(`\n${quote}${marker}${task ? ' [ ]' : ''} `)
  }

  // Boş satırda Enter (yazının sonunda ya da ortasında): blok burada biter
  if (line.trim() === '' && text.trim() !== '') {
    const head = text.slice(0, Math.max(0, from - 1))
    const tail = text.slice(to + (to < text.length ? 1 : 0))
    return { kind: 'split', head, tail }
  }
  return insert('\n')
}

// n. görev kutusu (yazıdaki sırasıyla; kod çitlerinin içindekiler sayılmaz) işaretlenir ya da
// işareti kalkar
const TASK = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?=\s|$)/

export function toggleTask(text, index) {
  const lines = text.split('\n')
  let count = 0
  let open = null
  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i])
    if (fence) {
      if (open === null) open = fence[1]
      else if (fence[1][0] === open[0] && fence[1].length >= open.length) open = null
      continue
    }
    if (open !== null) continue
    const match = TASK.exec(lines[i])
    if (!match) continue
    if (count++ === index) {
      const mark = match[2] === ' ' ? 'x' : ' '
      lines[i] = `${match[1]}[${mark}]${lines[i].slice(match[0].length)}`
      return lines.join('\n')
    }
  }
  return text
}

const MARKERS = {
  bold: '**',
  italic: '*',
  code: '`',
  strike: '~~',
}

// Seçili yazıyı biçimin işaretleriyle sarar; zaten sarılıysa işaretleri kaldırır. Seçim yoksa
// işaretler imlecin yerine konur, imleç aralarına girer.
export function toggleInline(text, start, end, format) {
  const mark = MARKERS[format]
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  const selected = text.slice(from, to)
  const before = text.slice(from - mark.length, from)
  const after = text.slice(to, to + mark.length)
  // Kalın "**" içindeki "*" italik sayılmasın
  const wrapped =
    before === mark &&
    after === mark &&
    !(format === 'italic' && text.slice(from - 2, from) === '**' && text.slice(to, to + 2) === '**')
  if (wrapped && selected !== '') {
    return {
      text: text.slice(0, from - mark.length) + selected + text.slice(to + mark.length),
      start: from - mark.length,
      end: to - mark.length,
    }
  }
  if (selected.startsWith(mark) && selected.endsWith(mark) && selected.length >= mark.length * 2) {
    const inner = selected.slice(mark.length, selected.length - mark.length)
    return { text: text.slice(0, from) + inner + text.slice(to), start: from, end: from + inner.length }
  }
  // Seçimin iki ucundaki boşluk işaretlerin dışında kalır ("** kalın**" geçerli değildir)
  const lead = selected.match(/^\s*/)[0].length
  const trail = selected.match(/\s*$/)[0].length
  const a = from + lead
  const b = Math.max(a, to - trail)
  const inner = text.slice(a, b)
  return {
    text: text.slice(0, a) + mark + inner + mark + text.slice(b),
    start: a + mark.length,
    end: b + mark.length,
  }
}

const LINE_PREFIX = /^(#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/

function linePrefixFor(format, current, index) {
  switch (format) {
    case 'heading': {
      // Başlık kademesi döner: yok → # → ## → ### → yok
      const level = /^(#{1,6}) /.exec(current)?.[1].length ?? 0
      return level === 0 ? '# ' : level < 3 ? `${'#'.repeat(level + 1)} ` : ''
    }
    case 'bullet':
      return /^[-*+] (?!\[)/.test(current) ? '' : '- '
    case 'task':
      return /^[-*+] \[[ xX]\] /.test(current) ? '' : '- [ ] '
    case 'numbered':
      return /^\d+[.)] /.test(current) ? '' : `${index + 1}. `
    case 'quote':
      return current.startsWith('> ') ? '' : '> '
  }
  return ''
}

// Seçimin değdiği satırların başına işaret koyar (başka işaret varsa onun yerine) ya da aynı
// işaret zaten varsa kaldırır. Seçim, satırlarla birlikte kayar.
export function toggleLines(text, start, end, format) {
  const from = lineStart(text, Math.min(start, end))
  const to = lineEnd(text, Math.max(start, end))
  const lines = text.slice(from, to).split('\n')
  let shiftStart = 0
  let shiftEnd = 0
  let offset = from
  const next = lines.map((line, i) => {
    const current = LINE_PREFIX.exec(line)?.[0] ?? ''
    const prefix = linePrefixFor(format, current, i)
    const replaced = prefix + line.slice(current.length)
    const delta = prefix.length - current.length
    if (offset <= Math.min(start, end)) shiftStart += delta
    if (offset <= Math.max(start, end)) shiftEnd += delta
    offset += line.length + 1
    return replaced
  })
  const body = next.join('\n')
  return {
    text: text.slice(0, from) + body + text.slice(to),
    start: Math.max(from, Math.min(start, end) + shiftStart),
    end: Math.max(from, Math.max(start, end) + shiftEnd),
  }
}

// Kod bloğu: seçili satırlar çitlerin arasına alınır; seçim yoksa boş bir kod bloğu açılır, imleç
// içine girer
export function insertCodeBlock(text, start, end) {
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  const before = text.slice(0, from)
  const after = text.slice(to)
  const lead = before === '' || before.endsWith('\n') ? '' : '\n'
  const trail = after === '' || after.startsWith('\n') ? '' : '\n'
  const code = text.slice(from, to)
  const fence = '`'.repeat(Math.max(3, ...(code.match(/`+/g) ?? []).map((r) => r.length + 1)))
  const block = `${lead}${fence}\n${code}\n${fence}${trail}`
  const caret = from + lead.length + fence.length + 1
  return {
    text: before + block + after,
    start: caret,
    end: caret + code.length,
  }
}

// Yazı alanının önceki ve yeni yazısı arasında tek bir yere giren parça; hiçbir şey silinmeden
// en az iki karakter girdiyse (tek tuş değil, yapıştırma) yeri ve kendisi
export function pastedChunk(prev, next) {
  if (next.length - prev.length < 2) return null
  let head = 0
  while (head < prev.length && prev[head] === next[head]) head++
  let tail = 0
  while (tail < prev.length - head && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) {
    tail++
  }
  // Önceki yazının tamamı korunmuş olmalı: yalnızca ekleme
  if (head + tail !== prev.length) return null
  return { at: head, text: next.slice(head, next.length - tail) }
}
