// Aşama 1 kota muhasebesinin doğrulaması: node scripts/verify-quota-ledger.mjs [--replay]
// Exit 0 = tüm kontroller geçti. --replay: data/usage-daily.json'u yeni metrikle
// tablo halinde yeniden hesaplar (yerel veri; yoksa atlanır, assert yok).
//
// Fixture'lar claude 2.1.332'nin gerçek result olaylarından alındı (2026-11-28):
// tek-atış `-p --output-format json` ve iki turluk `--input-format stream-json`.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Q from '../server/quotaLedger.js'

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed++
  } catch (err) {
    console.error(`✗ ${name}\n`, err)
    process.exit(1)
  }
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

// ─── Fixture'lar (gerçek CLI çıktısından, ilgisiz alanlar atıldı) ──────────────
const oneShot = {
  type: 'result', num_turns: 1,
  usage: {
    input_tokens: 2, cache_creation_input_tokens: 4642, cache_read_input_tokens: 649, output_tokens: 4,
    output_tokens_details: { thinking_tokens: 0 },
    cache_creation: { ephemeral_1h_input_tokens: 4642, ephemeral_5m_input_tokens: 0 },
    iterations: [{ input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 649, cache_creation_input_tokens: 4642 }],
  },
  modelUsage: { 'claude-haiku-5-5': { inputTokens: 2, outputTokens: 4, cacheReadInputTokens: 649, cacheCreationInputTokens: 4642 } },
}
// Kalıcı stream-json süreç: usage TUR başına, modelUsage BİRİKİMLİ.
const persistTurn1 = {
  type: 'result', num_turns: 1,
  usage: { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 4392, cache_creation_input_tokens: 902 },
  modelUsage: { 'claude-haiku-5-5': { inputTokens: 2, outputTokens: 4, cacheReadInputTokens: 4392, cacheCreationInputTokens: 902 } },
}
const persistTurn2 = {
  type: 'result', num_turns: 1,
  usage: { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 4392, cache_creation_input_tokens: 936 },
  modelUsage: { 'claude-haiku-5-5': { inputTokens: 4, outputTokens: 8, cacheReadInputTokens: 8784, cacheCreationInputTokens: 1838 } },
}

// ─── model ailesi ─────────────────────────────────────────────────────────────
test('modelFamily: kimlik ve takma adlar', () => {
  assert.equal(Q.modelFamily('claude-opus-5-5'), 'opus')
  assert.equal(Q.modelFamily('opus'), 'opus')
  assert.equal(Q.modelFamily('claude-sonnet-5-5'), 'sonnet')
  assert.equal(Q.modelFamily('claude-haiku-4-5-20251001'), 'haiku')
  assert.equal(Q.modelFamily('claude-haiku-5-5'), 'haiku5')
  assert.equal(Q.modelFamily('haiku'), 'haiku')   // takma ad: sürüm bilinmiyor → muhafazakâr (4.x)
  assert.equal(Q.modelFamily('claude-fable-5-2'), 'fable')
  assert.equal(Q.modelFamily(null), null)
  assert.equal(Q.modelFamily('bilinmeyen'), null)
})

// ─── ağırlıklar ───────────────────────────────────────────────────────────────
test('pointsFor: "%1 başına token" kadar token = 1 puan', () => {
  const w = Q.DEFAULT_WEIGHTS.families.opus
  near(Q.pointsFor({ output: w.output }, 'opus'), 1)
  near(Q.pointsFor({ cacheRead: w.cacheRead }, 'opus'), 1)
  near(Q.pointsFor({ output: w.output, input: w.input }, 'opus'), 2)
})
test('pointsFor: çıktı token\'ı cache okumadan ~260 kat ağır (Opus)', () => {
  const ratio = Q.pointsFor({ output: 1 }, 'opus') / Q.pointsFor({ cacheRead: 1 }, 'opus')
  assert.ok(ratio > 250 && ratio < 270, `oran ${ratio}`)
})
test('pointsFor: bilinmeyen aile varsayılana (opus) düşer', () => {
  near(Q.pointsFor({ output: 1000 }, 'yok'), Q.pointsFor({ output: 1000 }, 'opus'))
})

// ─── usage normalizasyonu ─────────────────────────────────────────────────────
test('normalizeUsage: TTL kırılımı ve düşünme token\'ı', () => {
  const u = Q.normalizeUsage(oneShot.usage)
  assert.deepEqual(u, { input: 2, output: 4, cacheWrite: 4642, cacheRead: 649, cw1h: 4642, cw5m: 0, thinking: 0 })
  assert.equal(Q.normalizeUsage(null), null)
  assert.equal(Q.normalizeUsage({}).cw1h, 0)
})

// ─── tur kaydı ────────────────────────────────────────────────────────────────
test('turnRecord tek-atış: modelUsage ailesi kullanılır (fallback değil)', () => {
  const r = Q.turnRecord(oneShot, { fallbackModel: 'opus' })
  assert.deepEqual(Object.keys(r.byFamily), ['haiku5'])
  assert.equal(r.family, 'haiku5')
  near(r.points, Q.pointsFor({ input: 2, output: 4, cacheWrite: 4642, cacheRead: 649 }, 'haiku5'))
  assert.equal(r.turns, 1)
})
test('turnRecord kalıcı süreç: modelUsage birikimli → ikinci tur sadece kendi deltası', () => {
  const r1 = Q.turnRecord(persistTurn1, { prevModelUsage: null })
  const r2 = Q.turnRecord(persistTurn2, { prevModelUsage: persistTurn1.modelUsage })
  const d2 = { input: 2, output: 4, cacheWrite: 936, cacheRead: 4392 }
  near(r2.points, Q.pointsFor(d2, 'haiku5'))
  // Delta alınmasaydı ikinci tur birikimli toplamı sayardı (≈ 2 kat):
  const wrong = Q.turnRecord(persistTurn2, { prevModelUsage: null })
  assert.ok(wrong.points > r2.points * 1.9)
  near(r1.points, Q.pointsFor({ input: 2, output: 4, cacheWrite: 902, cacheRead: 4392 }, 'haiku5'))
})
test('turnRecord: modelUsage yoksa spawn modelinin ailesi', () => {
  const ev = { type: 'result', usage: persistTurn1.usage }
  assert.equal(Q.turnRecord(ev, { fallbackModel: 'sonnet' }).family, 'sonnet')
  assert.equal(Q.turnRecord(ev, { fallbackModel: null }).family, 'opus')
})
test('turnRecord: çok modelli tur (ör. danışman) aile bazında ayrı tartılır', () => {
  const ev = {
    type: 'result', usage: { input_tokens: 10, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    modelUsage: {
      'claude-sonnet-5-5': { inputTokens: 10, outputTokens: 1500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      'claude-opus-5-5': { inputTokens: 0, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    },
  }
  const r = Q.turnRecord(ev)
  near(r.byFamily.sonnet, Q.pointsFor({ input: 10, output: 1500 }, 'sonnet'))
  near(r.byFamily.opus, Q.pointsFor({ output: 500 }, 'opus'))
  near(r.points, r.byFamily.sonnet + r.byFamily.opus)
})
test('turnRecord: firstUsage soğuk tespitine iletilir', () => {
  const ev = { type: 'result', usage: { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 9000 } }
  assert.equal(Q.turnRecord(ev).cold, false)
  assert.equal(Q.turnRecord(ev, { firstUsage: { cache_creation_input_tokens: 9000, cache_read_input_tokens: 0 } }).cold, true)
})
test('turnRecord + accumulate: araç sonucu karakteri taşınır ve birikir', () => {
  const r = Q.turnRecord(persistTurn1, { toolResultChars: 1234 })
  assert.equal(r.toolResultChars, 1234)
  const t = {}
  Q.accumulate(t, r); Q.accumulate(t, Q.turnRecord(persistTurn1))
  assert.equal(t.toolResultChars, 1234)
})
test('turnRecord: usage yoksa null', () => {
  assert.equal(Q.turnRecord({ type: 'result' }), null)
  assert.equal(Q.turnRecord(null), null)
})

// ─── soğuk tur ────────────────────────────────────────────────────────────────
test('isColdTurn: ilk istek prefix\'i yazıyorsa soğuk', () => {
  assert.equal(Q.isColdTurn(oneShot.usage), true)          // 4642 yazma > 649 okuma
  assert.equal(Q.isColdTurn(persistTurn1.usage), false)    // 902 < eşik ve < okuma
})
test('isColdTurn: CLI gerçeği — iterations SON isteği taşır; ilk istek firstUsage ile gelir', () => {
  // Canlı gözlem (2026-11-28): 2 istekli tur. İlk istek 7214 yazdı (cr=0, soğuk),
  // iterations[0] ise son isteği gösteriyordu (cw=106 cr=7214). Eski kod buna bakıp kaçırıyordu.
  const resultUsage = {
    cache_creation_input_tokens: 7320, cache_read_input_tokens: 7214,
    iterations: [{ cache_creation_input_tokens: 106, cache_read_input_tokens: 7214 }],
  }
  const firstAssistant = { cache_creation_input_tokens: 7214, cache_read_input_tokens: 0, input_tokens: 3 }
  assert.equal(Q.isColdTurn(resultUsage, firstAssistant), true)
  assert.equal(Q.isColdTurn(resultUsage), true)   // yedek kural (tur toplamı) da yakalar
})
test('isColdTurn: sıcak başlayıp sonra çok yazan ajan turu — firstUsage varken soğuk değil', () => {
  const u = { cache_creation_input_tokens: 60_000, cache_read_input_tokens: 40_000 }
  assert.equal(Q.isColdTurn(u, { cache_creation_input_tokens: 800, cache_read_input_tokens: 30_000 }), false)
})
test('isColdTurn: TTL A/B gerçek sayıları (tur toplamı, yedek kural)', () => {
  // 5m kolu, 6 dk sonra: sistem prompt'u paylaşılan önbellekte, konuşma kısmı yeniden yazıldı.
  assert.equal(Q.isColdTurn({ cache_creation_input_tokens: 16685, cache_read_input_tokens: 16497 }), true)
  // 1h kolu, 6 dk sonra: sıcak.
  assert.equal(Q.isColdTurn({ cache_creation_input_tokens: 165, cache_read_input_tokens: 32634 }), false)
  // roomsession-crud iş turu (7 araç-tur, sıcak başlangıç): soğuk sayılmamalı.
  assert.equal(Q.isColdTurn({ cache_creation_input_tokens: 20477, cache_read_input_tokens: 109999 }), false)
})
test('isColdTurn: küçük yazma eşiğin altında soğuk değil', () => {
  assert.equal(Q.isColdTurn({ cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 }), false)
})

// ─── birikim ──────────────────────────────────────────────────────────────────
test('accumulate: eski alanlar aynen, Aşama 1 alanları eklenir', () => {
  const t = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, processedTotal: 0 }
  Q.accumulate(t, Q.turnRecord(oneShot))
  Q.accumulate(t, Q.turnRecord(persistTurn1))
  assert.equal(t.calls, 2)
  assert.equal(t.input, 4)
  assert.equal(t.cacheWrite, 4642 + 902)
  assert.equal(t.cacheRead, 649 + 4392)
  assert.equal(t.output, 8)
  assert.equal(t.processedTotal, 4 + 4642 + 902 + 649 + 4392 + 8)
  assert.equal(t.coldTurns, 1)
  assert.equal(t.turns, 2)
  assert.equal(t.cw1h, 4642)
  assert.ok(t.quotaPoints > 0)
  assert.ok(Math.abs(t.quotaByFamily.haiku5 - t.quotaPoints) < 1e-5)
})
test('accumulate: null kayıt dokunmaz', () => {
  const t = { calls: 3 }
  Q.accumulate(t, null)
  assert.deepEqual(t, { calls: 3 })
})
test('Haiku türetmesi liste fiyatıyla tutarlı: 5.5 ≈ 4.5 / 10 (okuma /2)', () => {
  const t = { output: 1000, input: 1000, cacheWrite: 1000 }
  near(Q.pointsFor(t, 'haiku') / Q.pointsFor(t, 'haiku5'), 10, 1e-9)
  near(Q.pointsFor({ cacheRead: 1000 }, 'haiku') / Q.pointsFor({ cacheRead: 1000 }, 'haiku5'), 10, 1e-9)
  // Opus'a göre: 4.5 çıktısı 4× ucuz
  near(Q.pointsFor({ output: 1000 }, 'opus') / Q.pointsFor({ output: 1000 }, 'haiku'), 4, 1e-9)
})
test('estimateLegacyPoints: eski kayıt varsayılan aileyle', () => {
  const t = { input: 0, output: 460_000, cacheWrite: 0, cacheRead: 0 }
  near(Q.estimateLegacyPoints(t), 1)
})

// ─── ağırlık override ─────────────────────────────────────────────────────────
test('loadWeights: dosya aileyi kısmen ezer, bozuk dosya → varsayılan', () => {
  const w = Q.loadWeights(() => ({ families: { opus: { output: 1, input: 1, cacheWrite: 1, cacheRead: 1 } } }))
  assert.equal(w.families.opus.output, 1)
  assert.equal(w.families.sonnet.output, Q.DEFAULT_WEIGHTS.families.sonnet.output)
  assert.equal(Q.loadWeights(() => { throw new Error('ENOENT') }), Q.DEFAULT_WEIGHTS)
  assert.equal(Q.loadWeights(() => ({ nope: 1 })), Q.DEFAULT_WEIGHTS)
})

console.log(`✓ ${passed} kontrol geçti`)

// ─── --replay: yerel geçmişi yeni metrikle göster ─────────────────────────────
if (process.argv.includes('--replay')) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const file = path.join(root, 'data', 'usage-daily.json')
  if (!fs.existsSync(file)) {
    console.log('(replay) data/usage-daily.json yok, atlandı')
  } else {
    const store = JSON.parse(fs.readFileSync(file, 'utf8'))
    console.log('\nGün        tile           kota%    çıktı  c.yaz  c.oku  girdi  (pay, model varsayılan=opus)')
    for (const day of Object.keys(store).sort()) {
      for (const [tile, t] of Object.entries(store[day])) {
        const w = Q.DEFAULT_WEIGHTS.families.opus
        const parts = { out: t.output / w.output, cw: t.cacheWrite / w.cacheWrite, cr: t.cacheRead / w.cacheRead, inp: t.input / w.input }
        const total = parts.out + parts.cw + parts.cr + parts.inp
        if (!total) continue
        const pct = (x) => `${Math.round((100 * x) / total)}%`.padStart(5)
        const q = t.quotaPoints ?? total
        console.log(`${day} ${tile.padEnd(14)} ${q.toFixed(3).padStart(6)}  ${pct(parts.out)}  ${pct(parts.cw)}  ${pct(parts.cr)}  ${pct(parts.inp)}${t.quotaPoints == null ? '' : '  (Aşama 1 kaydı)'}`)
      }
    }
  }
}
