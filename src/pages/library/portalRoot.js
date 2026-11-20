// Kitaplık katmanlarının (menü, resim görüntüleyici, kenar çubuğu) portal hedefi. Kitaplık
// sayfalarında body; defter oyunda / canvas'ta overlay olarak açıkken (LibraryNotebookOverlay)
// overlay'in içindeki kök — yoksa z-index'leri (1000–1100) body'de overlay'in altında kalırdı.
export const LIB_PORTAL_ID = 'lib-portal-root'

export function portalRoot() {
  return document.getElementById(LIB_PORTAL_ID) ?? document.body
}
