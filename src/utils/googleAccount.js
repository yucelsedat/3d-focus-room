// ── Bu tarayıcının Google hesabı (link kartları için) ─────────────────────────
// Tarayıcı oturumdaki Google hesabını sayfalara açmaz; mail bu tarayıcı/profil
// için bir kez elle girilir ve localStorage'da tutulur. Link kartı oluşturulurken
// karta yazılır; Google linkleri kopyalanırken ?authuser=<mail> eklenir ki link
// doğru hesapla açılsın.
const KEY = 'googleEmail'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isEmail = (v) => EMAIL_RE.test(String(v || '').trim())

export function getGoogleEmail() {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}

export function setGoogleEmail(v) {
  try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY) } catch {}
}

// Mail sorulur; iptal → null (değişiklik yok), boş → '' (mail kaldırılır).
export function askGoogleEmail(current = getGoogleEmail()) {
  for (;;) {
    const v = window.prompt('Bu tarayıcıda açık olan Google hesabının maili (link kartlarına eklenir):', current)
    if (v === null) return null
    const t = v.trim()
    if (!t || isEmail(t)) return t
    current = t
    window.alert('Geçerli bir mail adresi girin (ör. ad@gmail.com) ya da boş bırakın.')
  }
}

// Kayıtlı mail; yoksa bir kez sorup kaydeder. İptal edilirse '' döner, sonraki linkte yine sorulur.
export function ensureGoogleEmail() {
  const saved = getGoogleEmail()
  if (saved) return saved
  const v = askGoogleEmail('')
  if (v) setGoogleEmail(v)
  return v || ''
}

const isGoogleHost = (h) => h === 'google.com' || h.endsWith('.google.com')

// Google linkine hesabı uygular; Google dışı / mailsiz / zaten authuser'lı linke dokunmaz.
export function withAuthUser(url, email) {
  if (!email) return url
  try {
    const u = new URL(url)
    if (!isGoogleHost(u.hostname) || u.searchParams.has('authuser')) return url
    u.searchParams.set('authuser', email)
    return u.toString()
  } catch { return url }
}
