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

// ─── Aşama 3: bilinçli argv değişiklikleri ────────────────────────────────────
// Eski dizi + yalnız burada tarif edilen ekler. Başka her fark testi kırar.
const ISOLATE = ['--setting-sources', 'project,local', '--disable-slash-commands']
const AS3_ONESHOT_EXTRA = {
  'projectview-detect': [...ISOLATE, '--effort', 'low'],
  verify: [...ISOLATE, '--effort', 'low'],
  orchestrate: [...ISOLATE, '--effort', 'low'],
  architect: [...ISOLATE, '--effort', 'high'],
}
// Ekler, eski dizideki son --dangerously-skip-permissions'ın hemen önüne girer.
function withExtra(args, extra) {
  if (!extra) return args
  const i = args.lastIndexOf('--dangerously-skip-permissions')
  return [...args.slice(0, i), ...extra, ...args.slice(i)]
}
// Aşama 3: VERIFY_MODEL Haiku 4.5 → 5.5 (verify'da model verilmediğinde, projectview-detect'te her zaman).
const AS3_VERIFY_MODEL = 'claude-haiku-5-5'
function withVerifyModel(args) {
  return args.map((a, i) => (a === VERIFY_MODEL && args[i - 1] === '--model' ? AS3_VERIFY_MODEL : a))
}
const AS3_DEFAULTS = {
  'ai-session': { skills: true, effort: null }, roomchat: { skills: true, effort: null },
  bluprint: { skills: true, effort: null },
  roomsession: { skills: false, effort: 'medium' }, multiagent: { skills: false, effort: 'medium' },
}
function expectedPersistent(opts) {
  const { args, env } = legacyPersistent(opts)
  const def = AS3_DEFAULTS[opts.tile] || { skills: true, effort: null }
  const st = opts.settings
  const skills = typeof st.skills === 'boolean' ? st.skills : def.skills
  const effort = st.effort && st.effort !== 'normal' ? st.effort : def.effort
  // Ekler mcpArgs'ın hemen ardına (eski dizide mcp 3 eleman, '--exclude-...' sonrası).
  const i = args.indexOf('--exclude-dynamic-system-prompt-sections') + 1 + 3
  const extra = [...(skills ? [] : ['--disable-slash-commands']), ...(effort ? ['--effort', effort] : [])]
  const e2 = { ...env }
  delete e2.CLAUDE_EFFORT   // efor artık env değil bayrak
  return { args: [...args.slice(0, i), ...extra, ...args.slice(i)], env: e2 }
}

// ─── Tek-atış profiller ───────────────────────────────────────────────────────
const inputs = [
  { sessionId: 'sid-1', message: 'merhaba', prompt: 'P', model: undefined, systemPrompt: 'SYS' },
  { sessionId: 'sid-2', message: 'çok\nsatır', prompt: 'P2 "tırnak"', model: 'claude-fable-5', systemPrompt: 'S2' },
  { sessionId: 'x', message: 'm', prompt: 'p', model: 'sonnet', systemPrompt: '' },
  { sessionId: 'x', message: 'm', prompt: 'p', model: 'claude-haiku-5-5', systemPrompt: 'x' },
]
for (const name of Object.keys(LEGACY)) {
  test(`oneShot ${name}: argv = eski + Aşama 3 ekleri, env/usageType aynı`, () => {
    for (const inp of inputs) {
      const got = S.oneShot(name, inp, ctx)
      assert.deepEqual(got.args, withVerifyModel(withExtra(LEGACY[name](inp), AS3_ONESHOT_EXTRA[name])))
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
test('persistent: tüm tile × seçenek kombinasyonlarında eski + Aşama 3 ekleri', () => {
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
      for (const skills of [undefined, true, false]) {
        const opts = { tile, settings: { model, effort, permissionMode, ...(skills === undefined ? {} : { skills }) }, ...ex }
        assert.deepEqual(S.persistent(opts, ctx), expectedPersistent(opts), JSON.stringify(opts))
        n++
      }
    }
  assert.equal(n, 6 * 4 * 4 * 5 * 5 * 3)
})
test('Aşama 3: kod yazan tile\'lar varsayılan skill kapalı + medium; sohbet tile\'ları miras', () => {
  const rs = S.persistent({ tile: 'roomsession', settings: {} }, ctx).args
  assert.ok(rs.includes('--disable-slash-commands'))
  assert.deepEqual(rs.slice(rs.indexOf('--effort'), rs.indexOf('--effort') + 2), ['--effort', 'medium'])
  const ai = S.persistent({ tile: 'ai-session', settings: { effort: 'normal' } }, ctx).args
  assert.ok(!ai.includes('--disable-slash-commands') && !ai.includes('--effort'))
  // Tile ayarı varsayılanı ezer.
  const rs2 = S.persistent({ tile: 'roomsession', settings: { skills: true, effort: 'high' } }, ctx).args
  assert.ok(!rs2.includes('--disable-slash-commands'))
  assert.equal(rs2[rs2.indexOf('--effort') + 1], 'high')
  // Hiçbir yolda env ile efor verilmez.
  for (const tile of Object.keys(AS3_DEFAULTS)) {
    assert.equal(S.persistent({ tile, settings: { effort: 'low' } }, ctx).env.CLAUDE_EFFORT, undefined)
  }
})
test('Aşama 3 TTL deney anahtarı: varsayılan 5m aynen, 1h ve default ayrık', () => {
  for (const tile of ['roomsession', 'multiagent']) {
    assert.deepEqual(S.persistent({ tile, settings: {} }, ctx).env, { FORCE_PROMPT_CACHING_5M: '1' })
    assert.deepEqual(S.persistent({ tile, settings: {}, loopTtl: '5m' }, ctx).env, { FORCE_PROMPT_CACHING_5M: '1' })
    assert.deepEqual(S.persistent({ tile, settings: {}, loopTtl: '1h' }, ctx).env, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
    assert.deepEqual(S.persistent({ tile, settings: {}, loopTtl: 'default' }, ctx).env, {})
    // argv TTL'den etkilenmez
    assert.deepEqual(S.persistent({ tile, settings: {}, loopTtl: '1h' }, ctx).args, S.persistent({ tile, settings: {} }, ctx).args)
  }
  // Sohbet tile'ları anahtardan etkilenmez.
  assert.deepEqual(S.persistent({ tile: 'roomchat', settings: {}, loopTtl: '5m' }, ctx).env, { ENABLE_PROMPT_CACHING_1H: '1' })
})
test('Aşama 3: skill kullanan profiller (graf, blueprint, VS Code köprüsü) izole edilmez', () => {
  for (const name of ['roomchat-graph', 'bluprint-build', 'live-session']) {
    const a = S.oneShot(name, inputs[0], ctx).args
    assert.ok(!a.includes('--setting-sources') && !a.includes('--disable-slash-commands'), name)
  }
})

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
test('cliModel ve sabitler eskiyle aynı', () => {
  for (const m of [undefined, null, '', 'claude-fable-5', 'FABLE', 'opus', 'sonnet', 'claude-haiku-5-5']) {
    assert.equal(S.cliModel(m), cliModel(m))
  }
  assert.equal(S.VERIFY_MODEL, AS3_VERIFY_MODEL)   // Aşama 3 bilinçli değişiklik
  assert.deepEqual([...S.PARTIAL_STREAM_TILES].sort(), [...PARTIAL_STREAM_TILES].sort())
})

console.log(`✓ ${passed} kontrol geçti`)
