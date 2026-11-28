#!/usr/bin/env node
// PreToolUse Bash koruma hook'u — ajanların Focus Room backend'ini öldürmesini engeller.
//
// Olay (2026-11-28, bench/ASAMA1.md): roomsession ajanı kendi todo sunucusunu kapatmak
// için `pkill -f "node server.js"` çalıştırdı. Desen, aynı komut satırıyla çalışan Focus
// Room backend'ini de yakaladı; backend ve ona bağlı claude süreci öldü. Ajanlar
// --dangerously-skip-permissions ile kullanıcının makinesinde çalışır, yani bu her
// kullanıcının sunucusunu öldürebilir.
//
// Kural: desene göre süreç öldürme (pkill, killall, pgrep|xargs kill, kill $(pgrep)),
// tüm süreçleri öldürme (kill -1), Focus Room portunu ya da PID'ini hedefleyen kill/fuser
// reddedilir. Ajana PID ile kapatması söylenir. Diğer her komut olduğu gibi geçer.
//
// Sözleşme (permission-hook.js ile aynı):
//   stdin  : { tool_name, tool_input: { command }, ... }
//   stdout : { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }
//   env    : FOCUS_ROOM_PORT, FOCUS_ROOM_PID (buildSpawnEnv koyar)
// Karar verilemezse (bozuk girdi) güvenli taraf: geçir — bu bir izin kapısı değil,
// yalnızca bilinen yıkıcı desenleri durduran bir emniyet kilidi.

import { pathToFileURL } from 'node:url'

const GUIDE = 'Başlattığın süreci PID ile kapat: örn. `npm start > /tmp/srv.log 2>&1 & SRV=$!` … `kill $SRV`. ' +
  'Ya da kendi portunu hedefle: `fuser -k <senin-portun>/tcp`.'

// Komut sınırı: satır başı veya ; & | ( ` $( sonrası, araya boşluk.
const B = String.raw`(?:^|[\n;&|(\x60]|\$\()\s*(?:sudo\s+)?`

const RULES = [
  {
    re: new RegExp(`${B}(?:pkill|killall)(?=\\s|$)`),
    reason: 'pkill/killall süreçleri isim desenine göre öldürür ve Focus Room sunucusunu (node server.js) da vurabilir.',
  },
  {
    re: /pgrep\b[^\n]*\|\s*xargs\s+(?:-\S+\s+)*kill\b|\bkill\b[^\n]*(?:\$\(|\x60)\s*pgrep\b/,
    reason: 'pgrep ile bulunan süreçleri toplu öldürmek Focus Room sunucusunu da vurabilir.',
  },
  {
    re: new RegExp(`${B}kill\\s+(?:-\\S+\\s+)*(?:--\\s+)?-1(?=\\s|$)`),
    reason: '`kill -1` kullanıcının tüm süreçlerini öldürür.',
  },
]

export function checkBashCommand(command, { port, pid } = {}) {
  const cmd = String(command || '')
  for (const r of RULES) if (r.re.test(cmd)) return { allow: false, reason: `${r.reason} ${GUIDE}` }
  const killish = /\b(?:kill|fuser|kill-port|lsof)\b/.test(cmd)
  if (port && killish && new RegExp(`(?<![\\d.])${port}(?!\\d)`).test(cmd)) {
    return { allow: false, reason: `Port ${port} Focus Room sunucusuna ait; onu kapatma. ${GUIDE}` }
  }
  if (pid && /\bkill\b/.test(cmd) && new RegExp(`(?<!\\d)${pid}(?!\\d)`).test(cmd)) {
    return { allow: false, reason: `PID ${pid} Focus Room sunucusuna ait; onu kapatma. ${GUIDE}` }
  }
  return { allow: true }
}

function emit(decision, reason) {
  if (decision === 'allow') { process.exit(0) }   // karar yok → normal akış (izin modu belirler)
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason || '' },
  }))
  process.exit(0)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  let buf = ''
  process.stdin.on('data', (d) => { buf += d })
  process.stdin.on('end', () => {
    let payload
    try { payload = JSON.parse(buf) } catch { return emit('allow') }
    if (payload.tool_name && payload.tool_name !== 'Bash') return emit('allow')
    const r = checkBashCommand(payload.tool_input?.command, {
      port: process.env.FOCUS_ROOM_PORT, pid: process.env.FOCUS_ROOM_PID,
    })
    return r.allow ? emit('allow') : emit('deny', r.reason)
  })
}
