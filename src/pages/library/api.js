// Kitaplık API istemcisi: seyir defterinin db/database.ts fonksiyonlarının web karşılıkları.
// Sunucu: server/library.js. Alan adları mobil tiplerle aynı (snake_case).

const API = import.meta.env.VITE_API_URL ?? ''
const R = `${API}/api/library`

async function call(method, path, body) {
  const res = await fetch(`${R}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(data?.error || `İstek başarısız (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

// ─── Kategoriler ───────────────────────────────────────────────────────────────
export const getCategories = () => call('GET', '/categories')

// Her kategoride kaç defter var: Map<id, sayı>
export async function getCategoryCounts() {
  const obj = await call('GET', '/categories/counts')
  return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]))
}

export const createCategory = (name) => call('POST', '/categories', { name }).then((r) => r.id)
export const renameCategory = (id, name) => call('PATCH', `/categories/${id}`, { name })
export const setCategoryOrder = (ids) => call('PUT', '/categories/order', { ids })
export const deleteCategory = (id) => call('DELETE', `/categories/${id}`)

// ─── Defterler ─────────────────────────────────────────────────────────────────
export const getNotebooks = () => call('GET', '/books')
export const getNotebook = (id) => call('GET', `/books/${id}`)
export const createNotebook = (settings) => call('POST', '/books', settings).then((r) => r.id)
export const updateNotebook = (id, settings) => call('PATCH', `/books/${id}`, settings)
export const setNotebookCategory = (id, categoryId) =>
  call('PUT', `/books/${id}/category`, { category_id: categoryId })
export const setNotebookShelves = (shelves) => call('PUT', '/books/shelves', { shelves })
export const setNotebookPageCount = (id, count) => call('PUT', `/books/${id}/page-count`, { count })
export const deleteNotebook = (id) => call('DELETE', `/books/${id}`)

// ─── Sayfalar ve bloklar (page = { notebookId, kind: 'page', ref }) ───────────────
const pagePath = (page) => `/books/${page.notebookId}/pages/${page.ref}`
const kindQuery = (page) => (page.kind && page.kind !== 'page' ? `?kind=${page.kind}` : '')

export const getPageNotes = (page) => call('GET', `${pagePath(page)}/notes${kindQuery(page)}`)
export const createNote = (page) => call('POST', `${pagePath(page)}/notes${kindQuery(page)}`)
export const setNoteOrder = (page, ids) => call('PUT', `${pagePath(page)}/order${kindQuery(page)}`, { ids })
export const deleteEmptyNotes = (page) => call('DELETE', `${pagePath(page)}/empty-notes${kindQuery(page)}`)
export const updateNote = (id, { content, highlights = '', inks = '', times = '', time = null }) =>
  call('PUT', `/notes/${id}`, { content, highlights, inks, times, time })
export const deleteNote = (id) => call('DELETE', `/notes/${id}`)

export const getWrittenPages = (notebookId) => call('GET', `/books/${notebookId}/written`)
export const getPageTexts = (notebookId) => call('GET', `/books/${notebookId}/page-texts`)

export async function getPageTitles(notebookId) {
  const obj = await call('GET', `/books/${notebookId}/titles`)
  return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]))
}
export const getPageTitle = (notebookId, ref) =>
  call('GET', `/books/${notebookId}/pages/${ref}/title`).then((r) => r.title)
export const setPageTitle = (notebookId, ref, title) =>
  call('PUT', `/books/${notebookId}/pages/${ref}/title`, { title })

export const insertNotebookPage = (notebookId, number) =>
  call('POST', `/books/${notebookId}/pages/${number}/insert`)
export const deleteNotebookPage = (notebookId, number) =>
  call('DELETE', `/books/${notebookId}/pages/${number}`).then((r) => r.contents)

// ─── Ayraçlar ve çizimler ───────────────────────────────────────────────────────
export const isFavorite = (page) =>
  call('GET', `${pagePath(page)}/favorite${kindQuery(page)}`).then((r) => r.favorite)
export const setFavorite = (page, favorite) => call('PUT', `${pagePath(page)}/favorite${kindQuery(page)}`, { favorite })
export const getFavorites = () => call('GET', '/favorites')
export const getPageDrawing = (page) => call('GET', `${pagePath(page)}/drawing${kindQuery(page)}`).then((r) => r.strokes)
export const setPageDrawing = (page, strokes) => call('PUT', `${pagePath(page)}/drawing${kindQuery(page)}`, { strokes })
export const removeFavorite = (id) => call('DELETE', `/favorites/${id}`)

// ─── Alışkanlık takibi (ajanda): period aylık sayfada "YYYY-AA", haftalıkta pazartesi ─────────
export const getHabits = (notebookId, period) => call('GET', `/books/${notebookId}/habits?period=${period}`)
export const createHabit = (notebookId, period) => call('POST', `/books/${notebookId}/habits`, { period })
export const updateHabit = (habit) => call('PUT', `/habits/${habit.id}`, { name: habit.name, done: habit.done })
export const deleteHabit = (id) => call('DELETE', `/habits/${id}`)
export const clearHabits = (notebookId, period) => call('DELETE', `/books/${notebookId}/habits?period=${period}`)
