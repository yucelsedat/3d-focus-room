// Kitaplık katmanlarının (menü, resim görüntüleyici, kenar çubuğu) portal hedefi. Kitaplık
// sayfalarında body; defter oyunda / canvas'ta overlay olarak açıkken (LibraryNotebookOverlay)
// overlay'in içindeki kök — yoksa z-index'leri (1000–1100) body'de overlay'in altında kalırdı.
//
// Duvardaki defter tile'ı (LibraryNotebookTile) PortalBoxContext ile kendi kutusunu verir: katmanlar
// ekrana değil tile'ın içine, tile'ın boyutunda açılır (3D'de duvarla birlikte durur).
import { createContext, useContext } from 'react'

export const LIB_PORTAL_ID = 'lib-portal-root'

export function portalRoot() {
  return document.getElementById(LIB_PORTAL_ID) ?? document.body
}

// { el, width, height } — katmanların açılacağı kutu ve boyutu; yoksa (null) pencere
export const PortalBoxContext = createContext(null)

export function usePortalBox() {
  return useContext(PortalBoxContext)
}

// Portal hedefi: tile içindeyse tile'ın kutusu, değilse overlay kökü ya da body
export function usePortalRoot() {
  const box = useContext(PortalBoxContext)
  return box?.el ?? portalRoot()
}
