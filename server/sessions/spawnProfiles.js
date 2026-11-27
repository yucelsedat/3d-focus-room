// Aşama 2 — claude CLI spawn argv/env'lerinin TEK kaynağı (SESSION-YOL-HARITASI.md §3, §4 Aşama 2).
//
// Önceden argümanlar server.js'te 8 ayrı yerde elle diziliyordu; bir bayrağı
// (ör. Aşama 3'ün --setting-sources'u) her yere eklemek hata yapmaya açıktı.
// Artık her spawn bu dosyadaki bir profilden türer.
//
// Bu dosya Aşama 2'de DAVRANIŞ DEĞİŞTİRMEZ: argv'ler bayrak sırası dahil eski
// inline dizilerle birebir aynıdır. Kanıt: scripts/verify-spawn-argv.mjs
// (eski dizilerin kopyasına karşı snapshot testi).
//
// Saf modül: yan etkili iki bağımlılık (mcpArgs: ~/.claude.json'dan tmp MCP
// config yazar; permissionArgs: permission-hook yolunu kurar) `ctx` ile verilir.

// Standalone claude CLI bazı UI model adlarını (ör. claude-fable-5) tanımıyor.
// --model'e geçmeden önce desteklenen bir ada normalize et. Fable 5 ≈ Opus.
export function cliModel(model) {
  if (!model || /fable/i.test(model)) return 'opus'
  return model
}

// Doğrulama ve proje-türü tespiti: pahalı tile modeliyle koşturmak israf.
export const VERIFY_MODEL = 'claude-haiku-4-5-20251001'

// Faz D: token-token akış. Bu tile'ların spawn'ına --include-partial-messages
// eklenir. multiagent bilinçli hariç: hot-loop, UI'ı delta render etmiyor.
export const PARTIAL_STREAM_TILES = new Set(['ai-session', 'roomchat', 'bluprint', 'roomsession'])

// Tek-atış --print akışının ortak başı.
const PRINT_STREAM = ['--print', '--output-format=stream-json', '--verbose']
// Faz 2 İş 2.1: dinamik system-prompt bölümlerini ilk user mesajına taşı → prefix sabit.
const STABLE_PREFIX = '--exclude-dynamic-system-prompt-sections'
// Faz 3 İş 3.3: tek-atış spawn asla --resume edilmez; JSONL yazma.
const NO_PERSIST = '--no-session-persistence'
const SKIP_PERMS = '--dangerously-skip-permissions'
const TTL_5M = { FORCE_PROMPT_CACHING_5M: '1' }

// ─── Tek-atış profiller ───────────────────────────────────────────────────────
// Her profil: build(opts, ctx) → { args, env, usageType }
// env: buildSpawnEnv'e verilecek envOverrides (yoksa {}).
export const ONESHOT = {
  // VS Code oturumuna köprü: kullanıcının kendi oturumunu --resume eder.
  'live-session': {
    usageType: 'live-session',
    build: ({ sessionId, message }) => [
      ...PRINT_STREAM,
      '--resume', sessionId, SKIP_PERMS,
      message,
    ],
  },

  // Proje türü belirsizse Haiku klasörü inceler (projectview).
  'projectview-detect': {
    usageType: 'projectview-detect',
    env: TTL_5M,
    build: ({ prompt }, ctx) => [
      ...PRINT_STREAM, '--max-turns', '6',
      '--tools', 'Read,Glob,Grep',
      STABLE_PREFIX,
      NO_PERSIST,
      '--model', cliModel(VERIFY_MODEL), ...ctx.mcpArgs('verify'), SKIP_PERMS, prompt,
    ],
  },

  // Oda sohbeti bilgi grafı (graphify) kurulumu/güncellemesi.
  'roomchat-graph': {
    usageType: 'roomchat-graph',
    build: ({ model, prompt }, ctx) => [
      ...PRINT_STREAM,
      '--model', cliModel(model),
      STABLE_PREFIX,
      NO_PERSIST,
      ...ctx.mcpArgs('roomchat'),
      SKIP_PERMS,
      prompt,
    ],
  },

  // LoopFlow doğrulayıcısı: salt-okur (+ test koşturabilsin diye Bash).
  verify: {
    usageType: 'verify',
    env: TTL_5M,
    build: ({ model, prompt }, ctx) => [
      ...PRINT_STREAM, '--max-turns', '12',
      '--tools', 'Read,Glob,Grep,Bash',
      STABLE_PREFIX,
      NO_PERSIST,
      '--model', cliModel(model || VERIFY_MODEL), ...ctx.mcpArgs('verify'), SKIP_PERMS, prompt,
    ],
  },

  // MultiAgent kurtarma orkestratörü (tüm görevler bitti ama hedef karşılanmadı).
  orchestrate: {
    usageType: 'orchestrate',
    env: TTL_5M,
    build: ({ prompt }, ctx) => [
      ...PRINT_STREAM, '--max-turns', '4',
      STABLE_PREFIX,
      NO_PERSIST,
      '--model', cliModel('sonnet'), ...ctx.mcpArgs('orchestrate'), SKIP_PERMS, prompt,
    ],
  },

  // MultiAgent mimarı: yalnız okur + JSON manifest üretir.
  architect: {
    usageType: 'architect',
    build: ({ model, systemPrompt, prompt }, ctx) => [
      ...PRINT_STREAM,
      '--model', cliModel(model || 'opus'),
      '--tools', 'Read',
      STABLE_PREFIX,
      NO_PERSIST,
      ...ctx.mcpArgs('architect'),
      '--append-system-prompt', systemPrompt,
      SKIP_PERMS,
      prompt,
    ],
  },

  // Blueprint spec üretimi (reconstruct vb. skill).
  'bluprint-build': {
    usageType: 'bluprint-build',
    build: ({ model, prompt }, ctx) => [
      ...PRINT_STREAM,
      '--model', cliModel(model),
      STABLE_PREFIX,
      NO_PERSIST,
      ...ctx.mcpArgs('bluprint'),
      SKIP_PERMS,
      prompt,
    ],
  },
}

// Tek-atış profilinden argv + env + usageType üret.
export function oneShot(name, opts, ctx) {
  const p = ONESHOT[name]
  if (!p) throw new Error(`Bilinmeyen spawn profili: ${name}`)
  return { args: p.build(opts, ctx), env: { ...(p.env || {}) }, usageType: p.usageType }
}

// ─── Kalıcı (stream-json girdili) oturum ──────────────────────────────────────
// tile: key'in ilk parçası (ai-session | roomchat | roomsession | bluprint | multiagent)
// settings: { model, effort, permissionMode }
// sys/maxTurns/tools/maxBudgetUsd: PersistentSession kurucusundan
// sessionId: varsa --resume
export function persistent({ tile, settings = {}, sys, maxTurns, tools, maxBudgetUsd, sessionId }, ctx) {
  const a = [
    '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', cliModel(settings.model),
    STABLE_PREFIX,
    ...ctx.mcpArgs(tile),
  ]
  if (PARTIAL_STREAM_TILES.has(tile)) a.push('--include-partial-messages')
  if (sys) a.push('--append-system-prompt', sys)
  if (maxTurns) a.push('--max-turns', String(maxTurns))
  // Tool kısıtı: tool tanım yükünü (→ her spawn'ın cacheWrite'ı) düşürür (plan.md P2-B).
  if (tools) a.push('--tools', tools)
  if (maxBudgetUsd) a.push('--max-budget-usd', String(maxBudgetUsd))
  a.push(...ctx.permissionArgs(settings.permissionMode))
  if (sessionId) a.push('--resume', sessionId)

  const env = {}
  if (settings.effort && settings.effort !== 'normal') env.CLAUDE_EFFORT = settings.effort
  // Faz 2 İş 2.2: hot loop (roomsession/multiagent) 5m, interaktif sohbet 1h.
  // Aşama 3'te abonelik varsayılanına (1h) karşı A/B ile yeniden değerlendirilecek.
  if (tile === 'roomsession' || tile === 'multiagent') env.FORCE_PROMPT_CACHING_5M = '1'
  else env.ENABLE_PROMPT_CACHING_1H = '1'

  return { args: a, env }
}
