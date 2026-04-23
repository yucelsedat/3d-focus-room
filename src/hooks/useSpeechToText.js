import { useState, useRef, useCallback, useEffect } from 'react'

export function useSpeechToText(lang = 'tr-TR') {
  const [listening, setListening] = useState(false)
  const recRef  = useRef(null)
  const baseRef = useRef('')

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const start = useCallback((currentText, onUpdate) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    baseRef.current = currentText

    const rec = new SR()
    rec.continuous      = true
    rec.interimResults  = true
    rec.lang            = lang

    rec.onresult = (e) => {
      let interimStr = ''
      let finalStr   = ''
      for (const result of e.results) {
        if (result.isFinal) finalStr   += result[0].transcript
        else                interimStr += result[0].transcript
      }
      if (finalStr) {
        baseRef.current += (baseRef.current ? ' ' : '') + finalStr.trim()
        onUpdate(baseRef.current)
      } else {
        onUpdate(baseRef.current + (interimStr ? ' ' + interimStr : ''))
      }
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
