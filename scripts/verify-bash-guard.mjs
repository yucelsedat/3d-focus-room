// Bash koruma hook'unun doğrulaması: node scripts/verify-bash-guard.mjs
// Exit 0 = tüm kontroller geçti. Hem saf fonksiyon hem gerçek hook süreci test edilir.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBashCommand } from '../bash-guard-hook.js'

let passed = 0
const test = (name, fn) => {
  try { fn(); passed++ } catch (err) { console.error(`✗ ${name}\n`, err); process.exit(1) }
}
const ctx = { port: '5099', pid: '41708' }
const denied = (c) => !checkBashCommand(c, ctx).allow

// 2026-11-28 olayındaki gerçek komutun sonu (roomsession ajanı, bench sunucusunu öldürdü).
const INCIDENT = `echo "--- log ---"; cat /tmp/todo-srv.log
pkill -f "node server.js"; sleep 0.3; ls todos.db* 2>/dev/null`

test('olaydaki gerçek komut reddedilir', () => assert.ok(denied(INCIDENT)))
test('desene göre öldürme reddedilir', () => {
  for (const c of [
    'pkill node', 'pkill -f "node server.js"', 'killall node', 'sudo pkill -9 -f server',
    'ls; pkill -f server', 'npm test && pkill node', '(pkill -f vite)', 'x=$(pkill -f a)',
    'pgrep -f server.js | xargs kill', 'pgrep node | xargs -r kill -9', 'kill $(pgrep -f node)',
    'kill -9 `pgrep node`', 'kill -9 -1', 'kill -- -1',
  ]) assert.ok(denied(c), c)
})
test('Focus Room portu / PID hedeflenirse reddedilir', () => {
  for (const c of [
    'fuser -k 5099/tcp', 'lsof -ti:5099 | xargs kill -9', 'npx kill-port 5099', 'kill 41708', 'kill -9 41708',
  ]) assert.ok(denied(c), c)
})
test('ajanın kendi süreç yönetimi serbest', () => {
  for (const c of [
    'kill $SRV', 'kill %1', 'kill -9 $PID', 'fuser -k 3917/tcp', 'npm start > /tmp/s.log 2>&1 & SRV=$!',
    'curl -s localhost:5099/api/rooms', 'node server.js', 'npm test', 'grep -rn pkill src/',
    'echo "pkill kullanma"', 'kill 417081', 'sleep 15099', 'lsof -i :3917',
  ]) assert.ok(!denied(c), c)
})
test('port/pid bilinmiyorsa yalnız desen kuralları uygulanır', () => {
  assert.equal(checkBashCommand('fuser -k 5099/tcp', {}).allow, true)
  assert.equal(checkBashCommand('pkill node', {}).allow, false)
})
test('red gerekçesi ajana PID ile kapatmayı söyler', () => {
  assert.match(checkBashCommand('pkill node', ctx).reason, /kill \$SRV/)
})

// ─── Gerçek hook süreci (CLI'ın çağırdığı gibi stdin → stdout) ────────────────
const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bash-guard-hook.js')
const runHook = (payload) => spawnSync('node', [hook], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload),
  env: { ...process.env, FOCUS_ROOM_PORT: '5099', FOCUS_ROOM_PID: '41708' },
  encoding: 'utf8',
})
test('hook süreci: tehlikeli komutta deny JSON basar', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: INCIDENT } })
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
})
test('hook süreci: güvenli komutta hiçbir şey basmaz (izin modu karar verir)', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'kill $SRV' } })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})
test('hook süreci: Bash dışı araç ve bozuk girdi geçer', () => {
  assert.equal(runHook({ tool_name: 'Read', tool_input: { file_path: 'x' } }).stdout, '')
  assert.equal(runHook('bozuk{').stdout, '')
})

console.log(`✓ ${passed} kontrol geçti`)
