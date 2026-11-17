// Seyir defteri: lib/documentSettings.ts — PDF defterinin ayarı: yazıya tıklayınca ham Markdown'ı
// mı açılsın (açık), yoksa yazı biçimli görünürken mi yazılsın (kapalı, varsayılan). Bütün PDF
// defterlerinde ortaktır; açık duran bütün sayfalar değişikliği hemen görür.
import { useSyncExternalStore } from 'react'

import { storageGet, storageSet } from '../state.js'

const RAW_MARKDOWN_KEY = 'library.document.rawMarkdown'

let rawMarkdown = null
const listeners = new Set()

function read() {
  if (rawMarkdown === null) rawMarkdown = storageGet(RAW_MARKDOWN_KEY) === '1'
  return rawMarkdown
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setRawMarkdown(on) {
  rawMarkdown = on
  storageSet(RAW_MARKDOWN_KEY, on ? '1' : '0')
  for (const listener of listeners) listener()
}

export function useRawMarkdown() {
  return useSyncExternalStore(subscribe, read)
}
