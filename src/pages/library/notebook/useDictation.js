// Seyir defteri: lib/useDictation.ts — mikrofonla dinleyip söylenenleri yazıya çevirir. Mobilde
// expo-speech-recognition; web'de tarayıcının konuşma tanıması (Web Speech API, tr-TR).
import { useEffect, useRef, useState } from 'react'

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined

// Kullanıcıya gösterilmeyen, dinlemenin kendiliğinden bitmesi sayılan durumlar
const SILENT_ERRORS = ['aborted', 'no-speech']

const ERROR_MESSAGES = {
  'not-allowed': 'Mikrofon izni verilmedi. Tarayıcının site ayarlarından izin verebilirsin.',
  'service-not-allowed': 'Bu tarayıcıda konuşma tanımaya izin verilmiyor.',
  'language-not-supported': 'Bu tarayıcıda Türkçe konuşma tanıma desteklenmiyor.',
  network: 'Konuşma tanıma için internet bağlantısı gerekiyor.',
  'audio-capture': 'Mikrofon şu an kullanılamıyor.',
}

function join(a, b) {
  return a && b ? `${a} ${b}` : a || b
}

// onTranscript: bu dinlemede şimdiye kadar söylenenlerin tamamı; son cümle henüz kesinleşmemiş olabilir
export function useDictation({ onTranscript, onEnd, onError }) {
  const [listening, setListening] = useState(false)
  const recognition = useRef(null)

  // Konuşma tanımanın olayları en son verilen işleyicileri çağırır
  const handlers = useRef({ onTranscript, onEnd, onError })
  useEffect(() => {
    handlers.current = { onTranscript, onEnd, onError }
  })

  function handleResult(event) {
    let committed = ''
    let pending = ''
    for (let i = 0; i < event.results.length; i++) {
      const text = event.results[i][0]?.transcript.trim() ?? ''
      if (event.results[i].isFinal) committed = join(committed, text)
      else pending = join(pending, text)
    }
    handlers.current.onTranscript(join(committed, pending))
  }

  function handleError(error) {
    if (SILENT_ERRORS.includes(error)) return
    handlers.current.onError(ERROR_MESSAGES[error] ?? 'Konuşma tanıma şu an kullanılamıyor.')
  }

  function handleEnd() {
    recognition.current = null
    setListening(false)
    handlers.current.onEnd()
  }

  // Sayfadan çıkınca mikrofon açık kalmasın
  useEffect(() => () => recognition.current?.abort(), [])

  // Dinleme başladıysa true döner
  function start() {
    if (!Recognition) {
      handlers.current.onError('Bu tarayıcı sesle yazmayı desteklemiyor (Chrome ya da Edge dene).')
      return false
    }
    const r = new Recognition()
    r.lang = 'tr-TR'
    r.interimResults = true
    r.continuous = true
    r.onresult = (e) => handleResult(e)
    r.onerror = (e) => handleError(e.error)
    r.onend = () => handleEnd()
    try {
      r.start()
    } catch {
      handlers.current.onError('Konuşma tanıma şu an kullanılamıyor.')
      return false
    }
    recognition.current = r
    setListening(true)
    return true
  }

  // Son cümle de yazıya geçirilip dinleme biter
  function stop() {
    recognition.current?.stop()
  }

  // Dinleme hemen kesilir, bekleyen sonuç atılır
  function cancel() {
    recognition.current?.abort()
  }

  return { listening, start, stop, cancel }
}
