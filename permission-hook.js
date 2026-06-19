#!/usr/bin/env node
// PreToolUse izin hook'u (Faz 2 — "ask" modu).
//
// Claude CLI bir tool kullanmadan önce bu script'i çalıştırır ve tool bilgisini
// stdin'den JSON olarak verir. Biz bunu çalışan Express sunucusuna iletip
// kullanıcı tarayıcıdan karar verene kadar BLOKLARIZ; gelen kararı CLI'ın
// beklediği formatta stdout'a basarız. Hata/zaman aşımında güvenli taraf: deny.
//
// Sözleşme:
//   stdin  : { session_id, tool_name, tool_input, tool_use_id, ... }
//   POST   : http://localhost:<PORT>/api/permission/ask  (bloklu yanıt)
//   yanıt  : { decision: 'allow'|'deny', reason? }
//   stdout : { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }

const PORT = process.env.FOCUS_ROOM_PORT || 5001

function emit(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,            // 'allow' | 'deny' | 'ask'
      permissionDecisionReason: reason || '',
    },
  }))
  process.exit(0)
}

let buf = ''
process.stdin.on('data', d => { buf += d })
process.stdin.on('end', async () => {
  let payload
  try { payload = JSON.parse(buf) } catch { return emit('deny', 'Hook girdisi okunamadı') }

  try {
    const resp = await fetch(`http://localhost:${PORT}/api/permission/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) return emit('deny', `İzin sunucusu ${resp.status}`)
    const data = await resp.json().catch(() => ({}))
    return emit(data.decision === 'allow' ? 'allow' : 'deny', data.reason)
  } catch (err) {
    return emit('deny', `İzin köprüsüne ulaşılamadı: ${err.message}`)
  }
})
