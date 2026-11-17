// Seyir defterinin lib/notebookState.ts karşılığı: en son açılan defter ve her defterin kaldığı
// sayfa. Mobilde expo-sqlite/kv-store, burada localStorage (erişilemezse sessizce geçilir).
import { getNotebook, getNotebooks } from './api.js'

const LAST_NOTEBOOK_KEY = 'library.notebook.last'

export function lastPageKey(notebookId) {
  return `library.notebook.${notebookId}.lastPage`
}

export function storageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // özel pencere / engelli depolama: hatırlanmaz
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // yok say
  }
}

export function rememberNotebook(notebookId) {
  storageSet(LAST_NOTEBOOK_KEY, String(notebookId))
}

// "Defter" sekmesinin açacağı defter: en son açılan; silinmişse ya da hiç defter açılmadıysa
// raftaki ilk defter. Tür verilirse yalnızca o türdekiler. Rafta defter yoksa null.
export async function getLastNotebook(kind) {
  const saved = storageGet(LAST_NOTEBOOK_KEY)
  if (saved) {
    const notebook = await getNotebook(Number(saved)).catch(() => null)
    if (notebook && (!kind || notebook.kind === kind)) return notebook
  }
  const notebooks = await getNotebooks()
  return notebooks.find((notebook) => !kind || notebook.kind === kind) ?? null
}

// Silinen defterin kaldığı sayfa ve son açılan defter kaydı temizlenir
export function forgetNotebook(notebookId) {
  storageRemove(lastPageKey(notebookId))
  if (storageGet(LAST_NOTEBOOK_KEY) === String(notebookId)) storageRemove(LAST_NOTEBOOK_KEY)
}
