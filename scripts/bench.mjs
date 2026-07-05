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
//
// DİKKAT: gerçek API tüketir — senaryolar küçük tutuldu; gün başına 1 baseline yeter.

import fs from 'node:fs'
import path from 'node:path'
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

if (!scenarioName || !SCENARIOS[scenarioName] || !label) {
  console.error(`Kullanım: node scripts/bench.mjs --scenario <${Object.keys(SCENARIOS).join('|')}> --label <etiket> [--base URL] [--keep]`)
  process.exit(1)
}
const scenario = SCENARIOS[scenarioName]

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
const FIELDS = ['calls', 'input', 'cacheWrite', 'cacheRead', 'output', 'processedTotal']

async function usageSnapshot() {
  const days = await api('GET', '/api/usage/daily?days=1')
  const today = Object.keys(days).sort().pop()
  return (today && days[today]) || {}
}

function usageDelta(before, after) {
  const delta = {}
  for (const tile of Object.keys(after)) {
    const b = before[tile] || {}
    const a = after[tile]
    const d = {}
    let any = false
    for (const f of FIELDS) {
      d[f] = (a[f] || 0) - (b[f] || 0)
      if (d[f]) any = true
    }
    if (any) delta[tile] = d
  }
  return delta
}

function sumDelta(delta) {
  const total = Object.fromEntries(FIELDS.map(f => [f, 0]))
  for (const d of Object.values(delta)) for (const f of FIELDS) total[f] += d[f] || 0
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
    ...extra,
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

async function runRoomsessionCrud() {
  const media = await api('POST', '/api/roomsession', tileBody({
    loop: { goal: scenario.goal, maxIterations: scenario.maxIterations },
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

const RUNNERS = {
  'direct-cafe': runDirectCafe,
  'roomsession-crud': runRoomsessionCrud,
  'roomchat-3turn': runRoomchat3turn,
  'roomchat-idlegap': runRoomchat3turn,
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
    usageDelta: delta,
    totals: sumDelta(delta),
    recall: result.recall ? {
      iteration: result.recall.iteration,
      maxIterations: result.recall.maxIterations,
      status: result.recall.status,
      respawns: result.recall.respawns || 0,
      usage: result.recall.usage || null,
    } : null,
  }

  const benchDir = path.join(ROOT, 'data', 'bench')
  fs.mkdirSync(benchDir, { recursive: true })
  const ts = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(benchDir, `${label}-${scenarioName}-${ts}.json`)
  fs.writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`[bench] sonuç yazıldı: ${path.relative(ROOT, file)}`)
  console.log(`[bench] toplam: ${JSON.stringify(out.totals)}`)

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

main().catch((e) => { console.error('[bench] hata:', e.message); process.exit(1) })
