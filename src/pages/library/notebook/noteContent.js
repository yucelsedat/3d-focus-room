// Seyir defteri: lib/noteContent.ts (birebir).
// Not içeriği düz metin olarak saklanır; ekler metnin içine işaretle gömülür:
//   resim: "önceki yazı￼img-123.jpg|800|600|3|0|0.5|2￼sonraki yazı"
//          (ad|genişlik|yükseklik|satır|açı|yatay yer|notun kaçıncı satırında; yeri değişmemişse yazılmaz)
//   dosya: "önceki yazı￼file|file-123.pdf|Rapor.pdf￼sonraki yazı"
// Böylece içerik her zaman metin, ek, metin, ek, metin ... şeklinde sıralanır.
const MARK = '￼'

export const DEFAULT_IMAGE_LINES = 3
// Kâğıda elle yapıştırılmış gibi hafif yamuk
export const DEFAULT_IMAGE_ROTATION = -1.2

export function parseContent(content) {
  return content.split(MARK).map((part, i) => {
    if (i % 2 === 0) return { type: 'text', text: part }
    const fields = part.split('|')
    if (fields[0] === 'file') {
      return { type: 'file', name: fields[1], label: decodeURIComponent(fields[2] ?? '') }
    }
    const [name, width, height, lines, rotation, x, row] = fields
    return {
      type: 'image',
      name,
      width: Number(width) || 1,
      height: Number(height) || 1,
      lines: Number(lines) || DEFAULT_IMAGE_LINES,
      rotation: rotation === undefined ? DEFAULT_IMAGE_ROTATION : Number(rotation) || 0,
      x: Math.min(1, Math.max(0, Number(x) || 0)),
      ...(row ? { row: Math.round(Number(row)) || 0 } : {}),
    }
  })
}

// Sola yaslı ve eklendiği yerde duran resmin yeri yazılmaz: eski notların içeriği aynı kalır
function placement(s) {
  if (s.row !== undefined) return [s.x, s.row]
  return s.x ? [s.x] : []
}

function serializeSegment(s) {
  switch (s.type) {
    case 'text':
      return s.text
    case 'image':
      return `${MARK}${[s.name, s.width, s.height, s.lines, s.rotation, ...placement(s)].join('|')}${MARK}`
    case 'file':
      return `${MARK}file|${s.name}|${encodeURIComponent(s.label)}${MARK}`
  }
  return ''
}

export function serializeContent(segments) {
  return segments.map(serializeSegment).join('')
}

// Metin bölümünü imleç konumundan ikiye ayırıp araya eki koyar
export function insertAttachment(segments, textIndex, cursor, attachment) {
  const target = segments[textIndex]
  if (target?.type !== 'text') return segments
  return [
    ...segments.slice(0, textIndex),
    { type: 'text', text: target.text.slice(0, cursor) },
    attachment,
    { type: 'text', text: target.text.slice(cursor) },
    ...segments.slice(textIndex + 1),
  ]
}

// Eki kaldırır, iki yanındaki metinleri birleştirir
export function removeAttachment(segments, index) {
  const before = segments[index - 1]
  const after = segments[index + 1]
  if (before?.type !== 'text' || after?.type !== 'text') return segments
  const joiner = before.text && after.text ? '\n' : ''
  return [
    ...segments.slice(0, index - 1),
    { type: 'text', text: before.text + joiner + after.text },
    ...segments.slice(index + 2),
  ]
}
