#!/usr/bin/env node
// Türkçe karakter onarımı — canvas tile'daki mp3/pdf/resim başlıkları.
//
// Kullanım:
//   node scripts/fix-mojibake-titles.mjs          # dry-run: neyin değişeceğini yazar
//   node scripts/fix-mojibake-titles.mjs --apply  # DB'ye yazar
//
// Neden gerekti: multer 2.x, yüklenen dosyanın adını varsayılan olarak latin1 çözüyordu
// (multer/index.js: defParamCharset || 'latin1'), tarayıcı ise UTF-8 gönderir. Bu yüzden
// dosya adından türetilen başlıklar "şarkı" yerine "ÅŸarkÄ±" olarak kaydedildi.
// server.js artık defParamCharset:'utf8' kullanıyor; bu script eski kayıtları onarır.
//
// Yalnızca görünen metin alanlarını (title/artist) düzeltir; url alanları diskteki gerçek
// dosya adlarına işaret ettiği için ellenmez.

import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'prisma', 'dev.db')
const APPLY = process.argv.includes('--apply')
const FIELDS = ['title', 'artist']

// UTF-8 baytlarının latin1 okunmasından doğan tipik ikililer: Ã§, Ä±, Å, Ä°…
const looksMojibake = (s) => /[ÃÄÅ][\u0080-ſ‘-„ -¿]/.test(s)
const demojibake = (s) => Buffer.from(s, 'latin1').toString('utf8')

const db = new Database(DB_PATH)
const rows = db.prepare("SELECT id, content FROM Media WHERE type = 'canvas'").all()
const update = db.prepare('UPDATE Media SET content = ? WHERE id = ?')

let fixed = 0, skipped = 0, touchedRows = 0

for (const row of rows) {
  let data
  try { data = JSON.parse(row.content || '{}') } catch { continue }
  if (!Array.isArray(data.items)) continue

  let dirty = false
  for (const item of data.items) {
    for (const key of FIELDS) {
      const val = item[key]
      if (typeof val !== 'string' || !looksMojibake(val)) continue
      const next = demojibake(val)
      // U+FFFD → bayt dizisi geçerli UTF-8 değil: dokunma, veriyi bozmaktansa bırak.
      if (next.includes('�') || next === val) { skipped++; continue }
      console.log(`${row.id} ${item.type}.${key}: ${JSON.stringify(val)} → ${JSON.stringify(next)}`)
      item[key] = next
      dirty = true
      fixed++
    }
  }
  if (dirty) {
    touchedRows++
    if (APPLY) update.run(JSON.stringify(data), row.id)
  }
}

console.log(`\n${APPLY ? 'Yazıldı' : 'Dry-run'}: ${fixed} alan, ${touchedRows} canvas kaydı${skipped ? `, ${skipped} alan atlandı (çözülemedi)` : ''}`)
if (!APPLY && fixed) console.log('Uygulamak için: node scripts/fix-mojibake-titles.mjs --apply')
