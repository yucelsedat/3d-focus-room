import { useState, useRef, useCallback, useEffect } from 'react'

export function useSpeechToText(lang = 'tr-TR') {
  const [listening, setListening] = useState(false)
  const recRef        = useRef(null)
  const baseRef       = useRef('')
  const lastFinalRef  = useRef(0)  // son işlenen final result index'i

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const start = useCallback((currentText, onUpdate) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    baseRef.current      = currentText
    lastFinalRef.current = 0  // her yeni kayıtta sıfırla

    const rec = new SR()
    rec.continuous     = true
    rec.interimResults = true
    rec.lang           = lang

    rec.onresult = (e) => {
      let newFinal   = ''
      let interimStr = ''

      // Sadece daha önce işlenmemiş result'ları oku
      for (let i = lastFinalRef.current; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          newFinal += result[0].transcript
          lastFinalRef.current = i + 1
        } else {
          interimStr += result[0].transcript
        }
      }

      if (newFinal.trim()) {
        baseRef.current += (baseRef.current ? ' ' : '') + newFinal.trim()
      }
      onUpdate(baseRef.current + (interimStr ? ' ' + interimStr : ''))
    }

    rec.onend   = () => setListening(false)
    rec.onerror = () => setListening(false)

    rec.start()
    recRef.current = rec
    setListening(true)
  }, [lang])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  useEffect(() => () => recRef.current?.stop(), [])

  return { listening, supported, start, stop }
}
