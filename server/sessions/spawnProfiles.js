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
// Aşama 3: Haiku 4.5 → 5.5. Aynı doğrulama, --effort low (4.5 eforu desteklemiyor):
// liste maliyeti $0.0065-0.0089 → $0.0006 (~10-14×), çıktı ~650 → ~333, düşünme ~330 → 0,
// karar aynı (bench/ASAMA3.md). Sabit kimlik: bench tekrarlanabilir kalsın diye takma ad değil.
export const VERIFY_MODEL = 'claude-haiku-5-5'

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

// ─── Aşama 3: spawn diyeti ────────────────────────────────────────────────────
// Ölçüm (bench/ASAMA3.md): aynı 3 önemsiz tur, haiku, ai-session bayrakları.
//   varsayılan                       : ilk 3 tur cache yazma 26.1K, 3. tur bağlam 25.6K
//   --disable-slash-commands         : 19.6K yazma, 16.5K bağlam (skill listesi ~9K)
//   + --setting-sources project,local: 8.8K yazma, 16.3K bağlam
// --setting-sources project,local kullanıcı skill'lerini (graphify, reconstruct),
// eklentilerini ve ~/.claude/CLAUDE.md'yi de kapatır. Bu yüzden:
//   ISOLATE_FULL → skill/kişisel ayar istemeyen otomasyon rolleri
//   NO_SKILLS    → kod yazan oturumlar: global CLAUDE.md (ör. tipografi kuralları) korunur
// --bare KULLANILMAZ: abonelik girişini (OAuth) okumuyor, yalnız ANTHROPIC_API_KEY.
const ISOLATE_FULL = ['--setting-sources', 'project,local', '--disable-slash-commands']
const NO_SKILLS = ['--disable-slash-commands']

// Efor: belgelenmiş --effort bayrağı (eski CLAUDE_EFFORT env'i dokümanda yok; etkisi
// ölçümle kanıtlanamadı). Kullanıcının modelSettings'i (ör. Opus 5.5 = high) aksi halde
// her spawn'a sızıyor ve düşünme (= çıktı, kotanın en pahalı türü) token'ı yakıyor.
const effortArgs = (level) => (level ? ['--effort', level] : [])

// Kalıcı tile varsayılanları. Tile ayarı (settings.effort ≠ 'normal', settings.skills)
// bunların üstüne yazar. Listede olmayan tile = eski davranış (skill açık, efor miras).
export const PERSISTENT_DEFAULTS = {
  'ai-session': { skills: true,  effort: null },
  roomchat:     { skills: true,  effort: null },
  bluprint:     { skills: true,  effort: null },
  roomsession:  { skills: false, effort: 'medium' },
  multiagent:   { skills: false, effort: 'medium' },
}

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
      '--model', cliModel(VERIFY_MODEL), ...ctx.mcpArgs('verify'),
      ...ISOLATE_FULL, ...effortArgs('low'),
      SKIP_PERMS, prompt,
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
      '--model', cliModel(model || VERIFY_MODEL), ...ctx.mcpArgs('verify'),
      ...ISOLATE_FULL, ...effortArgs('low'),
      SKIP_PERMS, prompt,
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
      '--model', cliModel('sonnet'), ...ctx.mcpArgs('orchestrate'),
      ...ISOLATE_FULL, ...effortArgs('low'),
      SKIP_PERMS, prompt,
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
      // Mimar planlama yapar: izolasyonla kullanıcı efor ayarı düştüğü için açıkça high.
      ...ISOLATE_FULL, ...effortArgs('high'),
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
  const def = PERSISTENT_DEFAULTS[tile] || { skills: true, effort: null }
  const skills = typeof settings.skills === 'boolean' ? settings.skills : def.skills
  const effort = settings.effort && settings.effort !== 'normal' ? settings.effort : def.effort
  const a = [
    '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', cliModel(settings.model),
    STABLE_PREFIX,
    ...ctx.mcpArgs(tile),
    ...(skills ? [] : NO_SKILLS),
    ...effortArgs(effort),
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
  // Faz 2 İş 2.2: hot loop (roomsession/multiagent) 5m, interaktif sohbet 1h.
  // Aşama 3'te abonelik varsayılanına (1h) karşı A/B ile yeniden değerlendirilecek.
  if (tile === 'roomsession' || tile === 'multiagent') env.FORCE_PROMPT_CACHING_5M = '1'
  else env.ENABLE_PROMPT_CACHING_1H = '1'

  return { args: a, env }
}
