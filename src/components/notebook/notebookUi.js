// Oyundaki defter (kitaplık defteri) açma / kapatma. Defter overlay'i ve form aynı kapıdan açılır:
// useStore.notebookOpen — oyunun tuş / tekerlek / yapıştırma dinleyicileri buna bakar.
import { useStore } from '../../store/useStore'
import { relockGamePointer } from '../../utils/pointerLock'

// relock yalnızca bir tıklama (kullanıcı etkileşimi) içinden çağrılırsa işe yarar; ve yalnızca
// defter oyundan kilitliyken (B ile) açıldıysa — karttan açılınca kilit canvas düzenlemeyi kapatırdı
export function closeNotebookOverlay({ relock = false } = {}) {
  const st = useStore.getState()
  const again = relock && st.notebookRelock
  st.closeNotebook()
  if (again) relockGamePointer()
}

// Karttan: defter elde kalır (B artık bunu açar) ve hemen açılır. key: 'lib:<id>'
export function takeNotebook(key) {
  const st = useStore.getState()
  st.setHeldNotebook(key)
  st.openNotebook()
}
