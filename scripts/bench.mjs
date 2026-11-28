#!/usr/bin/env node
// Faz 1 İş 1.3 — A/B koşum düzeneği.
// Aynı sabit senaryoyu optimizasyon öncesi/sonrası koşup farkı tabloya dökmek için.
//
// Kullanım:
//   node scripts/bench.mjs --scenario direct-cafe --label baseline
//   node scripts/bench.mjs --scenario roomsession-crud --label faz2 [--base http://localhost:5001] [--keep]
//
// Ne yapar:
//   1. '__bench__' adlı izole oda bulunur/oluşturulur ve aktive edilir
//      (önceki aktif oda koşu sonunda geri aktive edilir).
//   2. Bench odasının proje klasörü temizlenir (determinizm: her koşu aynı sıfır noktadan).
//   3. GET /api/usage/daily snapshot'ı alınır, senaryo koşulur, snapshot tekrar alınır.
//   4. Delta (tile-tipi kırılımı + processedTotal) + varsa recall (iterasyon, respawns,
//      rec.usage) data/bench/<label>-<ts>.json'a yazılır.
//      Aşama 1: quotaPoints (tahmini haftalık sayaç %'si — asıl karşılaştırma metriği),
//      coldTurns, turns (araç-tur), cw1h/cw5m (TTL kırılımı), thinking de delta'ya girer.
//
// DİKKAT: gerçek API tüketir — senaryolar küçük tutuldu; gün başına 1 baseline yeter.

import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Senaryolar (bench/scenarios.md ile birebir aynı — orada belgelenir) ───────
const SCENARIOS = {
  'direct-cafe': {
    tileType: 'multiagent',
    idea: 'tek sayfa HTML cafe sitesi, şık',
    note: 'multiagent tile — routing "direct"e düşmeli (mimar atlanır)',
  },
  'roomsession-crud': {
    tileType: 'roomsession',
    goal: 'Express + SQLite todo API: GET /todos, POST /todos, PUT /todos/:id, DELETE /todos/:id endpointleri çalışıyor; package.json ve server.js mevcut; sunucu hatasız başlıyor.',
    maxIterations: 6,
    note: 'roomsession LoopFlow — iş turu kalıcı oturum + haiku verify',
  },
  'roomchat-3turn': {
    tileType: 'roomchat',
    prompts: [
      'Bu odada hangi içerikler var? Kısaca listele.',
      'Bu içeriklerden en önemli 3 temayı çıkar ve her birini bir cümleyle açıkla.',
      'Bu üç temayı tek bir cümlede birleştirerek özetle.',
    ],
    note: 'roomchat — 3 turluk sabit sohbet, kalıcı oturumun cache davranışı',
  },
  // Faz 3 İş 3.1 ölçümü: turlar arası 6 dk bekleme — 5m TTL olsaydı cache düşerdi;
  // 1H TTL + uzun idle ile 2./3. turun cacheWrite'ı düşük kalmalı (cache-hit kanıtı).
  'roomchat-idlegap': {
    tileType: 'roomchat',
    gapSec: 360,
    prompts: [
      'Bu odada hangi içerikler var? Kısaca listele.',
      'Bu içeriklerden en önemli 3 temayı çıkar ve her birini bir cümleyle açıkla.',
      'Bu üç temayı tek bir cümlede birleştirerek özetle.',
    ],
    note: 'roomchat — 3 tur, turlar arası 6 dk boşluk; 1H cache + uzun idle doğrulaması',
  },
  // Aşama 6: daha zor görev — model seçiminin kaliteye etkisini ölçmek için.
  // Deterministik kontrol: checkTodoApi + doğrulama/filtre/sayfalama + npm test.
  'roomsession-api-plus': {
    tileType: 'roomsession',
    goal: 'Express + SQLite todo API. Endpointler: GET /todos, POST /todos, PUT /todos/:id, DELETE /todos/:id. '
      + 'Kurallar: (1) POST ve PUT\'ta title boş/eksikse 400 ve {error} döner; (2) olmayan id için PUT/DELETE 404 döner; '
      + '(3) GET /todos?completed=true|false tamamlanma durumuna göre filtreler; (4) GET /todos?limit=N&offset=M sayfalar '
      + '(id artan sırada). Sunucu PORT ortam değişkenini kullanır. package.json\'da "npm test" node:test ile bu '
      + 'kuralların hepsini test eder ve geçer.',
    maxIterations: 6,
    note: 'roomsession LoopFlow — zor görev (doğrulama, filtre, sayfalama, testler); kalite deterministik',
  },
  // Aşama 5 ölçümü: aynı zor görev, ama özellik özellik ilerleme yönergesiyle →
  // döngü doğal olarak birden çok iterasyona yayılır (Anthropic "bir seferde bir
  // özellik" deseni). Kollar sunucu env'iyle: FOCUS_ROOM_LOOP_EPOCH=accumulate|fresh.
  'roomsession-features': {
    tileType: 'roomsession',
    goalFrom: 'roomsession-api-plus',
    subagents: 'Bu hedefi özellik özellik ilerlet. Sıra: (1) CRUD endpointleri, (2) title doğrulaması 400, '
      + '(3) olmayan id 404, (4) completed filtresi, (5) limit/offset sayfalama, (6) tüm kuralları test eden npm test. '
      + 'Her iterasyonda YALNIZCA sıradaki en fazla 2 özelliği bitir ve dur; sonraki özelliklere geçme.',
    maxIterations: 6,
    note: 'roomsession LoopFlow — çok iterasyonlu (2 özellik/iterasyon); epoch kolu FOCUS_ROOM_LOOP_EPOCH ile',
  },
  // Aşama 3 TTL A/B: Oda Projesi tile'ında SOHBET (loop değil), turlar arası 6 dk.
  // 5m TTL'de 2./3. tur prefix'i yeniden yazar (soğuk); 1h'de okur (sıcak). Süreç
  // PERSIST_IDLE_MS (15 dk) sayesinde canlı kalır → fark yalnız TTL'den gelir.
  // Kol seçimi sunucu env'iyle: FOCUS_ROOM_LOOP_TTL=5m|1h (bench etiketi kolu yazar).
  'roomsession-chat-idlegap': {
    tileType: 'roomsession',
    gapSec: 360,
    chatPrompts: [
      "Bu klasöre package.json yaz: name 'idlegap-demo', scripts.start 'node index.js'. Sadece dosyayı yaz, açıklama yapma.",
      "index.js yaz: konsola 'merhaba' yazdırsın. Sadece dosyayı yaz, açıklama yapma.",
      "npm start çalıştır ve çıktıyı tek satırla söyle.",
    ],
    note: 'roomsession sohbet — 3 tur, 6 dk boşluk; TTL kolu FOCUS_ROOM_LOOP_TTL ile',
  },
}

// ── CLI argümanları ───────────────────────────────────────────────────────────
function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def
}
const scenarioName = arg('scenario')
const label = arg('label')
const BASE = arg('base', `http://localhost:${process.env.PORT || 5001}`)
const KEEP = process.argv.includes('--keep')
// Aşama 6: roomsession tile modeli (ör. --model sonnet). Yoksa sunucu varsayılanı.
const TILE_MODEL = arg('model')

// --check-only <klasör>: yalnız deterministik API kontrolü (model/sunucu gerekmez).
const CHECK_ONLY = arg('check-only')
if (!CHECK_ONLY && (!scenarioName || !SCENARIOS[scenarioName] || !label)) {
  console.error(`Kullanım: node scripts/bench.mjs --scenario <${Object.keys(SCENARIOS).join('|')}> --label <etiket> [--base URL] [--keep]`)
  process.exit(1)
}
const scenario = SCENARIOS[scenarioName] || {}

// ── HTTP yardımcıları ─────────────────────────────────────────────────────────
async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

// SSE akışını olay olay tüket (POST endpoint'leri SSE döndürür).
async function* sseEvents(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try { yield JSON.parse(line.slice(6)) } catch {}
      }
    }
  }
}

// SSE akışını "done" olayına (veya akış kapanana) kadar sür; olayları özetle logla.
// DİKKAT: node built-in fetch'in body-timeout'u (~5dk) uzun loop turlarında SSE'yi
// koparır. Bu FATAL DEĞİL: server tarafı loop client kopsa da devam eder (res.on
// 'close' yalnız sink'i düşürür). fetch koparsa uyar ve dön; çağıran bitişi status
// endpoint'iyle (pollLoopUntilDone) doğrular.
async function driveSSE(method, url, body, { onEvent } = {}) {
  try {
    for await (const ev of sseEvents(method, url, body)) {
      onEvent?.(ev)
      if (ev.type === 'error') console.error(`  [sse-error] ${ev.message || ''}`)
      if (ev.type === 'done') return true
    }
  } catch (e) {
    console.warn(`  [sse-koptu] ${e.message} — status polling'e düşülüyor`)
    return false
  }
  return true
}

// Loop bitişini status endpoint'iyle bekle (SSE koparsa güvenli düşüş). running=false
// ve terminal status (met/maxed/error/stopped) olunca döner. Uzun loop'lara dayanıklı.
async function pollLoopUntilDone(statusUrl, { timeoutMs = 30 * 60 * 1000, intervalMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    let st
    try { st = await api('GET', statusUrl) } catch { await sleep(intervalMs); continue }
    const rec = st.recall || {}
    const terminal = ['met', 'maxed', 'error', 'stopped'].includes(rec.status)
    if (last !== rec.iteration && rec.iteration != null) {
      console.log(`  [poll] iterasyon=${rec.iteration}/${rec.maxIterations ?? '?'} status=${rec.status ?? '?'} running=${st.running}`)
      last = rec.iteration
    }
    if (!st.running && (terminal || rec.status)) return st
    await sleep(intervalMs)
  }
  throw new Error(`pollLoopUntilDone: ${Math.round(timeoutMs / 60000)}dk içinde loop bitmedi`)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── usage-daily snapshot + delta ──────────────────────────────────────────────
const FIELDS = ['calls', 'input', 'cacheWrite', 'cacheRead', 'output', 'processedTotal',
  // Aşama 1 (server/quotaLedger.js): Aşama 1 öncesi sunucuda bu alanlar 0 gelir.
  'quotaPoints', 'turns', 'coldTurns', 'cw1h', 'cw5m', 'thinking', 'toolResultChars']
const round6 = (x) => Math.round(x * 1e6) / 1e6

// Son 2 günün tile bazında toplamı. Tek gün okumak, koşu UTC gece yarısını geçince
// sonraki günün turlarını kaçırıyordu (ttl5m-r2: 3. tur sayılmadı, bench/ASAMA3.md).
async function usageSnapshot() {
  const days = await api('GET', '/api/usage/daily?days=2')
  const sum = {}
  for (const byTile of Object.values(days)) {
    for (const [tile, t] of Object.entries(byTile)) {
      const s = sum[tile] || (sum[tile] = {})
      for (const f of FIELDS) s[f] = round6((s[f] || 0) + (t[f] || 0))
    }
  }
  return sum
}

function usageDelta(before, after) {
  const delta = {}
  for (const tile of Object.keys(after)) {
    const b = before[tile] || {}
    const a = after[tile]
    const d = {}
    let any = false
    for (const f of FIELDS) {
      d[f] = round6((a[f] || 0) - (b[f] || 0))
      if (d[f]) any = true
    }
    if (any) delta[tile] = d
  }
  return delta
}

function sumDelta(delta) {
  const total = Object.fromEntries(FIELDS.map(f => [f, 0]))
  for (const d of Object.values(delta)) for (const f of FIELDS) total[f] = round6(total[f] + (d[f] || 0))
  return total
}

// ── Bench odası: bul/oluştur + aktive et, koşu sonrası eski odaya dön ─────────
const BENCH_ROOM_NAME = '__bench__'

async function ensureBenchRoom() {
  const rooms = await api('GET', '/api/rooms')
  const prevActive = rooms.find(r => r.name !== BENCH_ROOM_NAME) || null   // liste lastActiveAt desc
  let bench = rooms.find(r => r.name === BENCH_ROOM_NAME)
  if (!bench) bench = await api('POST', '/api/rooms', { name: BENCH_ROOM_NAME })
  await api('POST', `/api/rooms/${bench.id}/activate`)
  return { bench, prevActive }
}

// Bench odasının proje klasörünü sıfırla — YALNIZ '__bench__' odası için (güvenlik).
function cleanBenchProjectDir(roomId) {
  const dir = path.join(ROOT, 'room-projects', String(roomId))
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  fs.mkdirSync(dir, { recursive: true })
}

// ── Tile oluşturma ortak gövdesi ──────────────────────────────────────────────
function tileBody(extra = {}) {
  return {
    tileId: `bench-${Date.now()}`,
    width: 6, height: 4,
    position: '[0,0,0]',
    rotation: '[0,0,0,"XYZ"]',
    ...(TILE_MODEL ? { model: TILE_MODEL } : {}),
    ...extra,
  }
}

// ── Deterministik kalite kontrolü: üretilen todo API'yi gerçekten dene ─────────
// Model çağırmaz. verify'ın "met" demesinden bağımsız ikinci bir kalite ölçütü
// (Loop v2'deki deterministik oracle'ın prototipi). Sunucu boş bir portta
// (PORT env) başlatılır, süreç grubu öldürülerek kapatılır (pkill YOK).
function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
  })
}
async function checkTodoApi(dir) {
  const checks = {}
  let cmd = ['node', 'server.js']
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (pkg.scripts?.start) cmd = ['npm', 'start']
  } catch { return { ok: false, reason: 'package.json yok/okunamadı', checks } }
  const port = await freePort()
  const B = `http://127.0.0.1:${port}`
  const child = spawn(cmd[0], cmd.slice(1), { cwd: dir, env: { ...process.env, PORT: String(port) }, detached: true, stdio: 'ignore' })
  const req = async (method, url, body) => {
    const r = await fetch(B + url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    let j = null
    try { j = await r.json() } catch {}
    return { status: r.status, body: j }
  }
  try {
    let up = false
    for (let i = 0; i < 60 && !up; i++) {
      try { await fetch(B + '/todos'); up = true } catch { await sleep(250) }
    }
    if (!up) return { ok: false, reason: `sunucu ${port} portunda açılmadı (PORT env'ine uymuyor olabilir)`, checks }
    const created = await req('POST', '/todos', { title: 'bench kontrol' })
    const id = created.body?.id
    checks.post = [200, 201].includes(created.status) && id != null && created.body?.title === 'bench kontrol'
    const list = await req('GET', '/todos')
    checks.get = list.status === 200 && Array.isArray(list.body) && list.body.some((t) => t.id === id)
    const upd = await req('PUT', `/todos/${id}`, { title: 'bench kontrol 2', completed: true })
    checks.put = upd.status === 200 && (upd.body?.title === 'bench kontrol 2' || upd.body?.completed === true || upd.body?.completed === 1)
    const del = await req('DELETE', `/todos/${id}`)
    checks.delete = [200, 204].includes(del.status)
    const after = await req('GET', '/todos')
    checks.deletedGone = after.status === 200 && Array.isArray(after.body) && !after.body.some((t) => t.id === id)
    const missing = await req('PUT', '/todos/99999999', { title: 'x' })
    checks.notFound404 = missing.status === 404
    return { ok: Object.values(checks).every(Boolean), checks }
  } catch (e) {
    return { ok: false, reason: e.message, checks }
  } finally {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
  }
}

// ── Senaryo sürücüleri ────────────────────────────────────────────────────────
async function runDirectCafe() {
  const media = await api('POST', '/api/multiagent', tileBody({ idea: scenario.idea }))
  console.log(`  tile oluşturuldu: ${media.id}`)

  let manifest = null
  await driveSSE('POST', `/api/multiagent/${media.id}/architect`, { idea: scenario.idea }, {
    onEvent: (ev) => {
      if (ev.type === 'architect_done') {
        manifest = ev.manifest
        console.log(`  manifest hazır (direct=${!!ev.direct}, roller=${manifest.team.map(t => t.role).join(',')})`)
      }
      if (ev.type === 'architect_error') throw new Error(`architect: ${ev.message}`)
    },
  })
  if (!manifest) throw new Error('architect manifest üretmedi')

  await driveSSE('POST', `/api/multiagent/${media.id}/loop/start`, {}, {
    onEvent: (ev) => {
      if (ev.type === 'ma_task') console.log(`  [iter ${ev.iteration}] ${ev.role}: ${String(ev.task).slice(0, 80)}`)
      if (ev.type === 'loop_iteration') console.log(`  iterasyon ${ev.recall?.iteration} bitti (status=${ev.recall?.status})`)
    },
  })
  // SSE koptuysa bile loop bitişini status ile doğrula (uzun worker turları).
  const status = await pollLoopUntilDone(`/api/multiagent/${media.id}/loop/status`)
  return { mediaId: media.id, recall: status.recall }
}

// api-plus: temel kontrol + ek kurallar + npm test. Her kural ayrı işaretlenir.
// SIRA ÖNEMLİ: npm test, API denemesinden ÖNCE ve temiz durumda koşar. API denemesi
// projenin varsayılan SQLite dosyasına kayıt bırakır; boş veritabanı varsayan ajan
// testleri sonra koşarsa yanlışlıkla kalır (feat-acc-r2: ajanın kendi çalıştırmasında
// 23/23 geçen testler düzenekte kaldı — bench/ASAMA5.md).
async function checkTodoApiPlus(dir) {
  const checks = {}
  // npm test (agent'ın kendi testleri) — kendi portunu seçmeli; 120 sn tavan.
  const t = spawn('npm', ['test'], { cwd: dir, env: { ...process.env, PORT: String(await freePort()) }, detached: true, stdio: 'ignore' })
  const npmTest = await new Promise((resolve) => {
    const timer = setTimeout(() => { try { process.kill(-t.pid, 'SIGKILL') } catch {} resolve(false) }, 120000)
    t.on('exit', (code) => { clearTimeout(timer); resolve(code === 0) })
  })
  const base = await checkTodoApi(dir)
  Object.assign(checks, base.checks)
  let cmd = ['node', 'server.js']
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (pkg.scripts?.start) cmd = ['npm', 'start']
  } catch { return { ok: false, reason: 'package.json yok', checks } }
  const port = await freePort()
  const B = `http://127.0.0.1:${port}`
  const child = spawn(cmd[0], cmd.slice(1), { cwd: dir, env: { ...process.env, PORT: String(port) }, detached: true, stdio: 'ignore' })
  const req = async (method, url, body) => {
    const r = await fetch(B + url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    let j = null
    try { j = await r.json() } catch {}
    return { status: r.status, body: j }
  }
  try {
    let up = false
    for (let i = 0; i < 60 && !up; i++) { try { await fetch(B + '/todos'); up = true } catch { await sleep(250) } }
    if (!up) return { ok: false, reason: 'sunucu açılmadı', checks }
    const empty = await req('POST', '/todos', { title: '' })
    const missing = await req('POST', '/todos', {})
    checks.validation400 = empty.status === 400 && missing.status === 400 && (empty.body?.error != null)
    const ids = []
    for (const [title, done] of [['a', false], ['b', true], ['c', false], ['d', true]]) {
      const r = await req('POST', '/todos', { title })
      ids.push(r.body?.id)
      if (done) await req('PUT', `/todos/${r.body?.id}`, { title, completed: true })
    }
    const emptyPut = await req('PUT', `/todos/${ids[0]}`, { title: '' })
    checks.putValidation400 = emptyPut.status === 400
    checks.delete404 = (await req('DELETE', '/todos/99999999')).status === 404
    const isDone = (t) => t.completed === true || t.completed === 1
    const doneList = await req('GET', '/todos?completed=true')
    const openList = await req('GET', '/todos?completed=false')
    checks.filter = Array.isArray(doneList.body) && Array.isArray(openList.body)
      && ids.filter((_, i) => i % 2 === 1).every((id) => doneList.body.some((t) => t.id === id && isDone(t)))
      && doneList.body.every(isDone) && openList.body.every((t) => !isDone(t))
    const all = (await req('GET', '/todos')).body || []
    const page = await req('GET', '/todos?limit=2&offset=1')
    const sorted = [...all].sort((x, y) => x.id - y.id)
    checks.pagination = Array.isArray(page.body) && page.body.length === 2
      && page.body[0].id === sorted[1]?.id && page.body[1].id === sorted[2]?.id
  } catch (e) {
    checks.plusError = false
    base.reason = e.message
  } finally {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
  }
  checks.npmTest = npmTest
  return { ok: Object.values(checks).every(Boolean), checks, reason: base.reason }
}

async function runRoomsessionCrud() {
  const goal = scenario.goal || SCENARIOS[scenario.goalFrom]?.goal
  const media = await api('POST', '/api/roomsession', tileBody({
    loop: { goal, maxIterations: scenario.maxIterations, ...(scenario.subagents ? { subagents: scenario.subagents } : {}) },
  }))
  console.log(`  tile oluşturuldu: ${media.id}`)

  await driveSSE('POST', `/api/roomsession/${media.id}/loop/start`, {}, {
    onEvent: (ev) => {
      if (ev.type === 'loop_working') console.log(`  iterasyon ${ev.iteration}/${ev.maxIterations} çalışıyor…`)
      if (ev.type === 'loop_iteration') console.log(`  iterasyon ${ev.recall?.iteration} bitti (met=${ev.recall?.lastCheck?.met})`)
    },
  })
  // SSE koptuysa bile loop bitişini status ile doğrula (roomsession iş turu 5dk'yı aşabilir).
  const status = await pollLoopUntilDone(`/api/roomsession/${media.id}/loop/status`)
  return { mediaId: media.id, recall: status.recall }
}

async function runRoomchat3turn() {
  const media = await api('POST', '/api/roomchat', tileBody())
  console.log(`  tile oluşturuldu: ${media.id}`)
  for (let i = 0; i < scenario.prompts.length; i++) {
    if (i > 0 && scenario.gapSec) {
      console.log(`  ${scenario.gapSec}s bekleniyor (idle-gap: cache/idle davranışı ölçümü)…`)
      await sleep(scenario.gapSec * 1000)
    }
    console.log(`  tur ${i + 1}/${scenario.prompts.length}: "${scenario.prompts[i].slice(0, 50)}…"`)
    await driveSSE('POST', '/api/roomchat/message', { mediaId: media.id, message: scenario.prompts[i] })
  }
  return { mediaId: media.id, recall: null }
}

async function runRoomsessionChatIdlegap() {
  const media = await api('POST', '/api/roomsession', tileBody())
  console.log(`  tile oluşturuldu: ${media.id}`)
  for (let i = 0; i < scenario.chatPrompts.length; i++) {
    if (i > 0) {
      console.log(`  ${scenario.gapSec}s bekleniyor (TTL ölçümü)…`)
      await sleep(scenario.gapSec * 1000)
    }
    console.log(`  tur ${i + 1}/${scenario.chatPrompts.length}`)
    await driveSSE('POST', '/api/roomsession/message', { mediaId: media.id, message: scenario.chatPrompts[i] })
  }
  return { mediaId: media.id, recall: null }
}

const RUNNERS = {
  'direct-cafe': runDirectCafe,
  'roomsession-crud': runRoomsessionCrud,
  'roomsession-api-plus': runRoomsessionCrud,
  'roomsession-features': runRoomsessionCrud,
  'roomchat-3turn': runRoomchat3turn,
  'roomchat-idlegap': runRoomchat3turn,
  'roomsession-chat-idlegap': runRoomsessionChatIdlegap,
}

// ── Ana akış ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[bench] senaryo=${scenarioName} label=${label} base=${BASE}`)

  // Sunucu ayakta mı?
  try { await api('GET', '/api/usage/daily?days=1') }
  catch { throw new Error(`Sunucuya ulaşılamadı (${BASE}). Önce sunucuyu başlat: node server.js`) }

  const { bench, prevActive } = await ensureBenchRoom()
  console.log(`[bench] oda: ${bench.id} (önceki aktif: ${prevActive ? prevActive.id : 'yok'})`)
  cleanBenchProjectDir(bench.id)

  const before = await usageSnapshot()
  const startedAt = new Date()
  let result, error = null
  try {
    result = await RUNNERS[scenarioName]()
  } catch (e) {
    error = e.message
    result = { mediaId: null, recall: null }
  }
  const finishedAt = new Date()
  // Kalite: roomsession-crud için deterministik API kontrolü (model çağırmaz).
  let functional = null
  if (['roomsession-crud', 'roomsession-api-plus', 'roomsession-features'].includes(scenarioName) && !error) {
    const dir = path.join(ROOT, 'room-projects', String(bench.id))
    functional = scenarioName === 'roomsession-crud' ? await checkTodoApi(dir) : await checkTodoApiPlus(dir)
    console.log(`[bench] kalite (API kontrolü): ${functional.ok ? 'GEÇTİ' : 'KALDI'} ${JSON.stringify(functional.checks)}${functional.reason ? ' — ' + functional.reason : ''}`)
  }
  // usage-daily debounce'lu (5 sn) yazılır; flush'ı bekle.
  await new Promise(r => setTimeout(r, 7000))
  const after = await usageSnapshot()

  const delta = usageDelta(before, after)
  const out = {
    scenario: scenarioName,
    label,
    note: scenario.note,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSec: Math.round((finishedAt - startedAt) / 1000),
    mediaId: result.mediaId,
    error,
    tileModel: TILE_MODEL || null,
    functional,
    // verify "met" dedi ama deterministik kontrol kaldı → yanlış pozitif
    verifyFalsePositive: functional && result.recall ? (result.recall.status === 'met' && !functional.ok) : null,
    usageDelta: delta,
    totals: sumDelta(delta),
    recall: result.recall ? {
      iteration: result.recall.iteration,
      maxIterations: result.recall.maxIterations,
      status: result.recall.status,
      respawns: result.recall.respawns || 0,
      usage: result.recall.usage || null,
      epochMode: result.recall.epochMode || null,
      // Aşama 5: iterasyon başına verify kararı ve kalan iş sayısı (kalite/ilerleme izi)
      history: (result.recall.history || []).map((h) => ({ iter: h.iter, met: !!h.check?.met, remaining: (h.check?.remaining || []).length })),
    } : null,
  }

  const benchDir = path.join(ROOT, 'data', 'bench')
  fs.mkdirSync(benchDir, { recursive: true })
  const ts = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(benchDir, `${label}-${scenarioName}-${ts}.json`)
  fs.writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`[bench] sonuç yazıldı: ${path.relative(ROOT, file)}`)
  console.log(`[bench] toplam: ${JSON.stringify(out.totals)}`)
  const t = out.totals
  console.log(`[bench] kota: ${t.quotaPoints.toFixed(4)}% haftalık (tahmin) · soğuk tur ${t.coldTurns}/${t.calls} · araç-tur ${t.turns}`)

  // Temizlik: tile'ı sil (recall zaten dosyaya kondu), önceki odayı geri aktive et.
  if (!KEEP && result.mediaId) {
    try { await api('DELETE', `/api/media/${result.mediaId}`) ; console.log('[bench] tile silindi') }
    catch (e) { console.error('[bench] tile silinemedi:', e.message) }
  }
  if (prevActive) {
    try { await api('POST', `/api/rooms/${prevActive.id}/activate`) ; console.log(`[bench] aktif oda geri alındı: ${prevActive.id}`) }
    catch (e) { console.error('[bench] oda geri aktive edilemedi:', e.message) }
  }
  if (error) { console.error(`[bench] senaryo HATA ile bitti: ${error}`); process.exit(2) }
}

if (CHECK_ONLY) {
  const fn = process.argv.includes('--plus') ? checkTodoApiPlus : checkTodoApi
  fn(path.resolve(CHECK_ONLY)).then((r) => { console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 3) })
} else {
  main().catch((e) => { console.error('[bench] hata:', e.message); process.exit(1) })
}
