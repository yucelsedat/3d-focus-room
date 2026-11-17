// Seyir defteri: lib/blockClipboard.ts — uygulamanın blok panosu: defterler ve sayfalar arasında
// ortaktır. Panodaki blokların ekleri kendi dosyalarıdır; bloklar sayfadan silinse de
// yapıştırılabilir. Yapıştırılınca bloklar dosyalarıyla birlikte sayfaya geçer, pano boşalır.
import { useSyncExternalStore } from 'react'

import { deleteAttachmentFile, duplicateAttachmentFile } from './attachments.js'
import { parseMarks, serializeMarks, shiftBoxTimes, shiftMarks } from './marks.js'
import { hasFile, parseContent, serializeContent } from './noteContent.js'

// Bir bloğun sayfadan bağımsız kısmı: yazı, ekler, boyalar, yazı renkleri ve saatler
export function blockOf(note) {
  const { content, highlights, inks, times, time } = note
  return { content, highlights, inks, times, time }
}

export function attachmentNames(content) {
  return parseContent(content).flatMap((s) => (hasFile(s) ? [s.name] : []))
}

// Bloğun eklerinin dosyaları yeni adlarla çoğaltılır: her dosyayı tek bir blok kullanır
export async function withCopiedFiles(block) {
  let current = block
  const segments = parseContent(block.content)
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!hasFile(segment)) continue
    const name = await duplicateAttachmentFile(segment.name).catch(() => null)
    if (!name) continue
    const next = parseContent(current.content)
    next[i] = { ...segment, name }
    const content = serializeContent(next)
    current = {
      ...current,
      content,
      highlights: serializeMarks(shiftMarks(parseMarks(current.highlights), current.content, content)),
      inks: serializeMarks(shiftMarks(parseMarks(current.inks), current.content, content)),
      times: serializeMarks(shiftBoxTimes(parseMarks(current.times), current.content, content)),
    }
  }
  return current
}

export function deleteBlockFiles(blocks) {
  deleteContentFiles(blocks.map((b) => b.content))
}

// Yazıların eklerinin dosyaları silinir (ör. defterden çıkarılan sayfanın)
export function deleteContentFiles(contents) {
  for (const name of contents.flatMap(attachmentNames)) deleteAttachmentFile(name)
}

// Blokların düz yazısı (başka uygulamalara yapıştırmak için): ekler atlanır, linkler adresiyle girer
export function blocksText(blocks) {
  return blocks
    .map((b) =>
      parseContent(b.content)
        .flatMap((s) => (s.type === 'text' && s.text !== '' ? [s.text] : s.type === 'link' ? [s.url] : []))
        .join('\n'),
    )
    .join('\n')
}

let clipboard = []
const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function replaceClipboard(next) {
  const old = clipboard
  clipboard = next
  listeners.forEach((listener) => listener())
  return old
}

export async function putOnClipboard(blocks) {
  const copies = await Promise.all(blocks.map(withCopiedFiles))
  deleteBlockFiles(replaceClipboard(copies))
}

// Panodaki bloklar yapıştırılmak üzere alınır; pano boşalır
export function takeFromClipboard() {
  return replaceClipboard([])
}

export function clearClipboard() {
  deleteBlockFiles(replaceClipboard([]))
}

// Panoda kaç blok var; değişince bileşen yeniden çizilir
export function useClipboardBlocks() {
  return useSyncExternalStore(subscribe, () => clipboard.length)
}
