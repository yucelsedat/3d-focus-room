// Aşama 2 argv snapshot testi: node scripts/verify-spawn-argv.mjs
// Exit 0 = server/sessions/spawnProfiles.js, Aşama 2 öncesi server.js'teki inline
// spawn dizileriyle (bayrak sırası dahil) BİREBİR aynı argv/env üretiyor.
//
// "LEGACY" fonksiyonları refactor öncesi server.js'ten (commit 8b9fb96) kopyalandı:
// davranış değişikliği yapan bir sonraki aşama (Aşama 3) bu dosyadaki beklentiyi
// bilinçli olarak güncellemeli — testin amacı sessiz argv değişimini yakalamak.
import assert from 'node:assert/strict'
import * as S from '../server/sessions/spawnProfiles.js'

let passed = 0
const test = (name, fn) => {
  try { fn(); passed++ } catch (err) { console.error(`✗ ${name}\n`, err); process.exit(1) }
}

// Yan etkili bağımlılıkların tanınabilir sahteleri.
const mcpArgs = (t) => ['--strict-mcp-config', '--mcp-config', `<mcp:${t}>`]
const permissionArgs = (m) => [`<perm:${m ?? 'undefined'}>`, '--settings', '<hook>']
const ctx = { mcpArgs, permissionArgs }
const cliModel = (model) => (!model || /fable/i.test(model)) ? 'opus' : model
const VERIFY_MODEL = 'claude-haiku-4-5-20251001'
const PARTIAL_STREAM_TILES = new Set(['ai-session', 'roomchat', 'bluprint', 'roomsession'])

// ─── LEGACY: server.js @ 8b9fb96'dan kopya ────────────────────────────────────
const LEGACY = {
  'live-session': ({ sessionId, message }) => [
    '--print', '--output-format=stream-json', '--verbose',
    '--resume', sessionId, '--dangerously-skip-permissions',
    message,
  ],
  'projectview-detect': ({ prompt }) => [
    '--print', '--output-format=stream-json', '--verbose', '--max-turns', '6',
    '--tools', 'Read,Glob,Grep',
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    '--model', cliModel(VERIFY_MODEL), ...mcpArgs('verify'), '--dangerously-skip-permissions', prompt,
  ],
  'roomchat-graph': ({ model, prompt }) => [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(model),
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    ...mcpArgs('roomchat'),
    '--dangerously-skip-permissions',
    prompt,
  ],
  verify: ({ model, prompt }) => [
    '--print', '--output-format=stream-json', '--verbose', '--max-turns', '12',
    '--tools', 'Read,Glob,Grep,Bash',
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    '--model', cliModel(model || VERIFY_MODEL), ...mcpArgs('verify'), '--dangerously-skip-permissions', prompt,
  ],
  orchestrate: ({ prompt }) => [
    '--print', '--output-format=stream-json', '--verbose', '--max-turns', '4',
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    '--model', cliModel('sonnet'), ...mcpArgs('orchestrate'), '--dangerously-skip-permissions', prompt,
  ],
  architect: ({ model, systemPrompt, prompt }) => [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(model || 'opus'),
    '--tools', 'Read',
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    ...mcpArgs('architect'),
    '--append-system-prompt', systemPrompt,
    '--dangerously-skip-permissions',
    prompt,
  ],
  'bluprint-build': ({ model, prompt }) => [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(model),
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    ...mcpArgs('bluprint'),
    '--dangerously-skip-permissions',
    prompt,
  ],
}
// Eski çağrı yerlerindeki envOverrides (streamClaudeToSSE yolunda env yoktu).
const LEGACY_ENV = {
  'live-session': {}, 'projectview-detect': { FORCE_PROMPT_CACHING_5M: '1' }, 'roomchat-graph': {},
  verify: { FORCE_PROMPT_CACHING_5M: '1' }, orchestrate: { FORCE_PROMPT_CACHING_5M: '1' },
  architect: {}, 'bluprint-build': {},
}
const LEGACY_USAGE = {
  'live-session': 'live-session', 'projectview-detect': 'projectview-detect', 'roomchat-graph': 'roomchat-graph',
  verify: 'verify', orchestrate: 'orchestrate', architect: 'architect', 'bluprint-build': 'bluprint-build',
}

// PersistentSession._spawn @ 8b9fb96
function legacyPersistent({ tile, settings, sys, maxTurns, tools, maxBudgetUsd, sessionId }) {
  const a = [
    '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', cliModel(settings.model),
    '--exclude-dynamic-system-prompt-sections',
    ...mcpArgs(tile),
  ]
  if (PARTIAL_STREAM_TILES.has(tile)) a.push('--include-partial-messages')
  if (sys) a.push('--append-system-prompt', sys)
  if (maxTurns) a.push('--max-turns', String(maxTurns))
  if (tools) a.push('--tools', tools)
  if (maxBudgetUsd) a.push('--max-budget-usd', String(maxBudgetUsd))
  a.push(...permissionArgs(settings.permissionMode))
  if (sessionId) a.push('--resume', sessionId)
  const env = {}
  if (settings.effort && settings.effort !== 'normal') env.CLAUDE_EFFORT = settings.effort
  if (tile === 'roomsession' || tile === 'multiagent') env.FORCE_PROMPT_CACHING_5M = '1'
  else env.ENABLE_PROMPT_CACHING_1H = '1'
  return { args: a, env }
}

// ─── Tek-atış profiller ───────────────────────────────────────────────────────
const inputs = [
  { sessionId: 'sid-1', message: 'merhaba', prompt: 'P', model: undefined, systemPrompt: 'SYS' },
  { sessionId: 'sid-2', message: 'çok\nsatır', prompt: 'P2 "tırnak"', model: 'claude-fable-5', systemPrompt: 'S2' },
  { sessionId: 'x', message: 'm', prompt: 'p', model: 'sonnet', systemPrompt: '' },
  { sessionId: 'x', message: 'm', prompt: 'p', model: 'claude-haiku-5-5', systemPrompt: 'x' },
]
for (const name of Object.keys(LEGACY)) {
  test(`oneShot ${name}: argv/env/usageType eskiyle aynı`, () => {
    for (const inp of inputs) {
      const got = S.oneShot(name, inp, ctx)
      assert.deepEqual(got.args, LEGACY[name](inp))
      assert.deepEqual(got.env, LEGACY_ENV[name])
      assert.equal(got.usageType, LEGACY_USAGE[name])
    }
  })
}
test('oneShot: tüm eski profiller kapsanıyor, fazlası yok', () => {
  assert.deepEqual(Object.keys(S.ONESHOT).sort(), Object.keys(LEGACY).sort())
})
test('oneShot: bilinmeyen profil hata verir', () => {
  assert.throws(() => S.oneShot('yok', {}, ctx), /Bilinmeyen spawn profili/)
})
test('oneShot: env kopyası paylaşılmaz (çağıran değiştirse profil bozulmaz)', () => {
  const a = S.oneShot('verify', inputs[0], ctx)
  a.env.X = '1'
  assert.equal(S.oneShot('verify', inputs[0], ctx).env.X, undefined)
})

// ─── Kalıcı oturum: kombinasyon taraması ──────────────────────────────────────
test('persistent: tüm tile × seçenek kombinasyonlarında eskiyle aynı', () => {
  const tiles = ['ai-session', 'roomchat', 'roomsession', 'bluprint', 'multiagent', 'bilinmeyen']
  const models = [undefined, 'claude-fable-5', 'sonnet', 'opus']
  const efforts = [undefined, 'normal', 'high', 'low']
  const perms = [undefined, 'bypassPermissions', 'plan', 'acceptEdits', 'ask']
  const extras = [
    {},
    { sys: 'SYS' },
    { sys: 'SYS', maxTurns: 30, tools: 'Read,Edit,Write,Bash,Glob,Grep', maxBudgetUsd: 2 },
    { maxTurns: 20, sessionId: 'sid' },
    { tools: 'Read', sessionId: 'sid', maxBudgetUsd: 0.5 },
  ]
  let n = 0
  for (const tile of tiles) for (const model of models) for (const effort of efforts)
    for (const permissionMode of perms) for (const ex of extras) {
      const opts = { tile, settings: { model, effort, permissionMode }, ...ex }
      assert.deepEqual(S.persistent(opts, ctx), legacyPersistent(opts), JSON.stringify(opts))
      n++
    }
  assert.equal(n, 6 * 4 * 4 * 5 * 5)
})

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
test('cliModel ve sabitler eskiyle aynı', () => {
  for (const m of [undefined, null, '', 'claude-fable-5', 'FABLE', 'opus', 'sonnet', 'claude-haiku-5-5']) {
    assert.equal(S.cliModel(m), cliModel(m))
  }
  assert.equal(S.VERIFY_MODEL, VERIFY_MODEL)
  assert.deepEqual([...S.PARTIAL_STREAM_TILES].sort(), [...PARTIAL_STREAM_TILES].sort())
})

console.log(`✓ ${passed} kontrol geçti`)
