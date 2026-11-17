// Seyir defteri: lib/attachments.ts — ek dosyaları. Mobilde cihazın belge klasörü; burada sunucu
// (server/library.js /attachments, dosyalar /uploads/shelf/ altında). Blokta yalnızca dosya adı tutulur.
const API = import.meta.env.VITE_API_URL ?? ''
const R = `${API}/api/library/attachments`

export function attachmentUrl(name) {
  return `${API}/uploads/shelf/${encodeURIComponent(name)}`
}

// Dosya sunucuya yüklenir: { name, label, mime, size }
export async function uploadAttachment(file) {
  const body = new FormData()
  body.append('file', file, file.name || 'dosya')
  const res = await fetch(R, { method: 'POST', body })
  if (!res.ok) throw new Error('Dosya yüklenemedi')
  return res.json()
}

// Ekin dosyası yeni adla çoğaltılır; bulunamazsa null
export async function duplicateAttachmentFile(name) {
  const res = await fetch(`${R}/${encodeURIComponent(name)}/copy`, { method: 'POST' })
  if (!res.ok) return null
  return (await res.json()).name
}

export function deleteAttachmentFile(name) {
  fetch(`${R}/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {})
}

// Dosya yeni sekmede açılır ("birlikte aç" penceresinin web karşılığı)
export function openAttachment(name) {
  window.open(attachmentUrl(name), '_blank', 'noopener')
}

const DEFAULT_IMAGE_LINES = 3
// Not defterine yapıştırılan fotoğraf hafif yamuk durur (PDF'te düz basılır)
export const DEFAULT_IMAGE_ROTATION = -1.2

// Tarayıcının dosya penceresi; seçilmezse null
function chooseFile({ accept, capture } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    if (capture) input.capture = capture
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function imageSize(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || 4, height: img.naturalHeight || 3 })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 4, height: 3 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

// Resim dosyası sunucuya yüklenir, fotoğraf eki olarak döner. PDF'te resim kâğıda düz basılır.
export async function imageAttachment(file) {
  const [size, uploaded] = await Promise.all([imageSize(file), uploadAttachment(file)])
  return { type: 'image', name: uploaded.name, width: size.width, height: size.height, lines: DEFAULT_IMAGE_LINES, rotation: DEFAULT_IMAGE_ROTATION, x: 0 }
}

// Resim seçilirse fotoğraf olarak, diğer dosyalar ataçlı etiket olarak eklenir
export async function fileAttachment(file) {
  if (file.type.startsWith('image/')) return imageAttachment(file)
  const uploaded = await uploadAttachment(file)
  return { type: 'file', name: uploaded.name, label: file.name || uploaded.label }
}

export async function pickImageFromLibrary() {
  const file = await chooseFile({ accept: 'image/*' })
  return file ? imageAttachment(file) : null
}

// Telefonda kamerayı açar; masaüstünde resim seçme penceresi olur
export async function takePhoto() {
  const file = await chooseFile({ accept: 'image/*', capture: 'environment' })
  return file ? imageAttachment(file) : null
}

export async function pickFile() {
  const file = await chooseFile()
  return file ? fileAttachment(file) : null
}

// Panoda resim var mı (tarayıcı izin isteyebilir; izin yoksa false)
export async function clipboardHasImage() {
  try {
    const items = await navigator.clipboard.read()
    return items.some((item) => item.types.some((t) => t.startsWith('image/')))
  } catch {
    return false
  }
}

export async function pasteImageFromClipboard() {
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    return imageAttachment(new File([blob], `pano.${ext}`, { type }))
  }
  return null
}

// Resmin seçilen yeri (oranlarla: x, y, width, height 0..1) yeni bir dosyaya kırpılır; eski dosya
// yerinde kalır (notu güncelleyen siler). Yeni dosyanın adı ve boyutları döner.
export async function cropAttachmentImage(name, rect) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = attachmentUrl(name)
  })
  const W = img.naturalWidth
  const H = img.naturalHeight
  const x = Math.min(W - 1, Math.max(0, Math.round(rect.x * W)))
  const y = Math.min(H - 1, Math.max(0, Math.round(rect.y * H)))
  const width = Math.max(1, Math.min(W - x, Math.round(rect.width * W)))
  const height = Math.max(1, Math.min(H - y, Math.round(rect.height * H)))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(img, x, y, width, height, 0, 0, width, height)
  const png = /\.png$/i.test(name)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', 0.9))
  const uploaded = await uploadAttachment(new File([blob], png ? 'kirpik.png' : 'kirpik.jpg', { type: blob.type }))
  return { name: uploaded.name, width, height }
}
