// drei PointerLockControls imleci canvas'ı değil, R3F'in olay kapsayıcısını
// (canvas'ın büyük ebeveyni olan div) kilitler ve isLocked'ı yalnızca O eleman
// kilitlenince true yapar. Bir overlay kapanınca başka bir eleman (ör. canvas)
// kilitlenirse imleç gizlenir ama fare kamerayı döndürmez — imleç "donar".
// Bu modül oyunun en son kilitlediği elemanı hatırlar; yeniden kilit onu kullanır.
let lastLockEl = null

if (typeof document !== 'undefined') {
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) lastLockEl = document.pointerLockElement
  })
}

// Yalnızca bir kullanıcı etkileşimi (tıklama) içinden çağrılınca işe yarar
export function relockGamePointer() {
  const canvas = document.querySelector('canvas')
  const el = lastLockEl?.isConnected ? lastLockEl : (canvas?.parentElement?.parentElement ?? canvas)
  try {
    el?.requestPointerLock()?.catch?.(() => {})
  } catch { /* Esc sonrası tarayıcı bekleme süresi */ }
}
