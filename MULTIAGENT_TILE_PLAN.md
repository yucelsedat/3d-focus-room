# Multi-Agent Tile — Mimari Plan

**Proje:** focus-room  
**Amaç:** Kullanıcı bir proje fikri yazar → Architect agent teknolojiyi ve ekibi belirler → Ekip recall+loopflow döngüsüyle projeyi otonom bitirir.  
**Mimari karar:** Sequential Orchestrator + Context-Isolated Workers (ayrıntı aşağıda)

---

## Mimari Karar ve Gerekçe

### Seçilen Pattern: Sequential Orchestrator + Context-Isolated Workers

```
Kullanıcı fikri
      ↓
  [ARCHITECT]  (Opus, tek sefer)
  → Team Manifest JSON üretir
      ↓
  [ORCHESTRATOR] (Sonnet, her iterasyon)
  → Hangi worker çalışacak, hangi görev?
      ↓
  [WORKER N]  (Sonnet, fresh context, izole)
  → Görevi tamamlar, dosyaları yazar
      ↓
  [VERIFIER]  (Haiku, bağımsız, her iterasyon)
  → { met, reason, remaining }
      ↓
  Recall checkpoint → sonraki iterasyon
```

### Neden paralel değil
- focus-room projeleri sıralı bağımlılık: schema → API → frontend → test
- Paralel Opus spawn maliyet kontrolsüz
- SessionPool tile-başına tasarlanmış, N paralel pool için değil

### Neden single-session değil (Sakana Fugu)
- Büyük projede context şişer, iterasyon limiti dolmadan biter
- Reviewer'ın implementasyon tartışmalarını görmesi kaliteyi düşürür
- Verifier bağımsız olamaz (self-report güvenilmez)

### Neden bu pattern
- Mevcut `LoopRunner` + `SessionPool` doğrudan genişletiliyor, sıfırdan yazılmıyor
- Her worker fresh session → context isolation (token maliyeti düşük)
- Opus sadece Faz 0'da bir kez çalışır
- Recall mekanizması zaten var, sadece `agentRole` alanı ekleniyor

---

## Mevcut Altyapı — Dokunmadan Kalacaklar

```
server.js içinde HAZIR:
✅ SessionPool + PersistentSession (sıcak oturum havuzu)
✅ LoopRunner (work→verify döngü motoru)
✅ readRecall / writeRecall / recallDir (checkpoint sistemi)
✅ verifyGoal() (bağımsız Haiku verifier spawn)
✅ loopPool (aktif runner'ları yöneten Map)
✅ /api/loops/active endpoint (LoopIndicator için)
✅ SSE altyapısı (clientSink, _emit, makeTurnSink)
✅ formatSessionContent / parseSessionContent
```

---

## Faz 0 — Architect (Yeni)

### Endpoint
```
POST /api/multiagent
Body: { tileId, width, height, position, rotation, idea }
```
Tile oluşturur, `type: 'multiagent'` olarak kaydeder, `content`'e `{ idea, status: 'draft' }` yazar.

```
POST /api/multiagent/:mediaId/architect
Body: { idea }
Response: SSE stream (Architect'in çıktısı + final manifest JSON)
```

### Architect System Prompt
```
Sen bir yazılım mimarısın. Kullanıcının proje fikrini analiz ederek:
1. Hangi teknoloji stack'inin kullanılacağına karar ver (gereksiz teknoloji ekleme)
2. Projeyi tamamlamak için gereken minimal ajan ekibini belirle
3. Her ajan için 2-4 somut görev tanımla
4. Projenin "tamamlandı" sayılacağı doğrulanabilir hedefi yaz

ÇIKTI FORMAT (sadece JSON, açıklama ekleme):
{
  "stack": ["Express", "SQLite", "vanilla JS"],
  "goal": "Verifiable, checkable completion condition",
  "maxIterations": 8,
  "projectBrief": "2-3 cümle özet (workerlar bu özeti context olarak alır)",
  "team": [
    {
      "role": "db-schema",
      "agentProfile": "sqlite-schema-expert",
      "model": "sonnet",
      "tasks": ["users tablosu", "products tablosu", "migration dosyaları"]
    },
    {
      "role": "backend-api",
      "agentProfile": "express-api-expert",
      "model": "sonnet",
      "tasks": ["auth endpoint'leri", "CRUD routes", "middleware"]
    },
    {
      "role": "tester",
      "agentProfile": "test-generator",
      "model": "haiku",
      "tasks": ["unit testler", "endpoint testleri"]
    }
  ]
}
```

### Sonuç
Manifest DB'ye `content` alanına yazılır (`{ idea, status: 'planned', manifest }`)  
Frontend kullanıcıya team kartlarını gösterir, "Başlat" butonu aktifleşir.

---

## Faz 1 — Team Assembly (Yeni, minimal)

### Endpoint
```
POST /api/multiagent/:mediaId/loop/start
Body: { manifest? }  (manifest yoksa DB'den okunur)
```

### Yapılan işler
1. `manifest.team` içindeki her `agentProfile` için `.claude/agents/<profile>.md` var mı kontrol et
2. Yoksa hata dön: "Şu agent profilleri eksik: [liste]" (runtime'da npx çalıştırma — güvenlik riski)
3. Recall checkpoint başlat:
   ```json
   {
     "task": "multiagent",
     "goal": "...",
     "maxIterations": 8,
     "iteration": 0,
     "status": "running",
     "manifest": { ... },
     "activeRole": null,
     "done": [],
     "remaining": ["db-schema → users tablosu", "backend-api → auth", ...]
   }
   ```
4. `MultiAgentRunner` instance oluştur, `loopPool`'a ekle

---

## Faz 2 — Loop Motor Uzantısı

### Mevcut `LoopRunner` → Yeni `MultiAgentRunner`

`LoopRunner`'ı subclass et veya yan sınıf olarak yaz. Fark: `_workTurn()` override edilir.

### Yeni `_workTurn(rec)` Mantığı

```
Adım 1 — Orchestrator Turn (Sonnet):
  sessionPool key: `multiagent:<mediaId>:orchestrator`
  System: "Sen çok-ajanlı projenin orkestratörüsün..."
  Input: rec.remaining listesi + rec.history özeti
  Output (JSON): { nextRole: "backend-api", task: "auth endpoint'leri yaz" }

Adım 2 — Worker Turn (role'e göre model):
  agentProfile = manifest.team.find(role === nextRole).agentProfile
  agentMd = fs.readFile(`.claude/agents/<agentProfile>.md`)
  sessionPool key: `multiagent:<mediaId>:<nextRole>`
  System: agentMd içeriği + "\n\nProje özeti: " + manifest.projectBrief
  Input: "Görev: <task>\nÇalışma dizini: <dir>\nDosyaları doğrudan yaz."
  → İş biter, worker summary döner

Adım 3 — rec güncelle:
  rec.activeRole = null
  rec.done.push("<nextRole> → <task>")
  rec.remaining = rec.remaining.filter(r => r !== "<nextRole> → <task>")
```

### Orchestrator System Prompt
```
Sen çok-ajanlı bir yazılım projesinin orkestratörüsün.
Manifest: <JSON>
Kalan görevler: <remaining listesi>
Tamamlanan görevler: <done listesi>

Şu an hangi görevi hangi ajan yapmalı? Bağımlılıklara dikkat et
(schema olmadan API yazmaya çalışma).

SADECE JSON ile yanıt ver:
{ "nextRole": "<role>", "task": "<specific task description>" }
```

### SessionPool Key Şeması
```
orchestrator:     multiagent:<mediaId>:orchestrator
her worker:       multiagent:<mediaId>:<role>
(her role ilk kez spawn edilince fresh context, sonraki çağrılarda --resume ile ısıtılır)
```

### Verifier — Değişmez
`verifyGoal()` mevcut haliyle kullanılır. Haiku, cwd'yi okur, goal'ü check eder.

---

## Faz 3 — Tamamlanma

Loop `met` olduğunda:
1. Son iterasyon olarak `code-reviewer` agent çalışır (hard-coded, manifeste bağlı değil)
2. `rec.status = 'met'`
3. Tile UI "Proje tamamlandı" gösterir, review özetini yayınlar
4. SessionPool'daki tüm `multiagent:<mediaId>:*` session'ları dispose edilir

---

## Agent Profilleri — Kurulum Stratejisi

### Önce oluşturulacak custom profiller (focus-room'a özgü)
Konum: `.claude/agents/`

**`project-architect.md`** (Architect Phase için, Opus)
```yaml
---
name: project-architect
description: Analyzes project ideas and produces a team manifest with stack, agents, tasks, and verifiable goal.
model: opus
tools: Read
---
[System prompt buraya]
```

**`threejs-specialist.md`** (Three.js + @react-three/fiber, Sonnet)
**`express-api-expert.md`** (Express 5, middleware, REST, Sonnet)
**`sqlite-schema-expert.md`** (SQLite + Prisma schema, migration, Sonnet)
**`multiagent-orchestrator.md`** (Worker seçimi, bağımlılık grafiği, Sonnet)

### aitmpl'den kurulacaklar (hazır)
```bash
npx claude-code-templates@latest --agent development-tools/code-reviewer
npx claude-code-templates@latest --agent testing/test-generator
npx claude-code-templates@latest --agent security/security-auditor
```

### 0xfurai/claude-code-subagents'tan kopyalanacaklar
```bash
# express-expert.md ve sqlite-expert.md manuel kopyala
# repo: https://github.com/0xfurai/claude-code-subagents
```

---

## Backend Değişimleri Özeti

### Yeni tile type: `multiagent`
- `server.js` → tile type listesine ekle
- `parseSessionContent` / `formatSessionContent` zaten generic JSON, değişmez

### Yeni endpoint'ler
```
POST   /api/multiagent                     → tile oluştur
POST   /api/multiagent/:id/architect       → SSE, Architect phase
GET    /api/multiagent/:id/architect       → manifest + status
POST   /api/multiagent/:id/loop/start      → MultiAgentRunner başlat
GET    /api/multiagent/:id/loop/stream     → SSE, loop events
POST   /api/multiagent/:id/loop/stop       → abort
GET    /api/multiagent/:id/loop/status     → recall checkpoint
```

### Var olan endpoint'lerden değişecekler
- `/api/loops/active` → `loopPool`'a `MultiAgentRunner` da girince otomatik görünür (LoopIndicator ücretsiz çalışır)
- Cleanup (`cleanupRoom`) → `multiagent:<mediaId>:*` pattern'ı dispose eder

### Recall checkpoint uzantısı
Mevcut alanlara eklenenler:
```json
{
  "manifest": { ... },
  "activeRole": "backend-api | null",
  "agentSessions": {
    "orchestrator": "<sessionId>",
    "db-schema": "<sessionId>",
    "backend-api": "<sessionId>"
  }
}
```

---

## Frontend Tile UI

### Tile bileşeni: `MultiAgentTile.jsx`

**Draft state** (manifest yok):
```
┌─────────────────────────────────┐
│  Proje Fikri                    │
│  ┌─────────────────────────┐   │
│  │ textarea (idea)          │   │
│  └─────────────────────────┘   │
│  [Ekip Kur →]                   │
└─────────────────────────────────┘
```

**Planned state** (manifest hazır, loop başlamamış):
```
┌─────────────────────────────────┐
│  Stack: Express · SQLite · JS   │
│  Goal: "Tüm testler geçiyor..."│
│                                 │
│  Ekip:                          │
│  [db-schema]  [backend-api]    │
│  [tester]     [reviewer]       │
│                                 │
│  [← Yeniden planla] [Başlat →] │
└─────────────────────────────────┘
```

**Running state** (loop aktif):
```
┌─────────────────────────────────┐
│  iter 3 / 8  ████░░░░  37%     │
│  Aktif: backend-api             │
│  ──────────────────────────     │
│  ✅ db-schema → users tablosu  │
│  ✅ db-schema → products tbl   │
│  ⚡ backend-api → auth routes  │
│  ○ tester → unit testler       │
│  ──────────────────────────     │
│  [Durdur]                       │
└─────────────────────────────────┘
```

**Done state**:
```
┌─────────────────────────────────┐
│  ✓ Proje tamamlandı (iter 6)   │
│  [Review Özetini Gör]           │
│  [room-projects'te Aç]          │
│  [Yeni Proje]                   │
└─────────────────────────────────┘
```

### SSE olayları (frontend dinler)
```
loop_state     → initial state, running: bool
loop_started   → loop başladı
loop_working   → { iteration, activeRole, task }
loop_verifying → verify aşamasında
loop_iteration → { recall } checkpoint sonrası
loop_done      → { recall } met/maxed/stopped
error          → { message }
architect_chunk → Architect SSE token'ları (architect phase)
architect_done  → { manifest }
```

---

## Uygulama Sırası

```
1. Agent profilleri yaz  (.claude/agents/ altına 5 custom .md)
   → project-architect, threejs-specialist, express-api-expert,
     sqlite-schema-expert, multiagent-orchestrator

2. aitmpl + 0xfurai agent kurulumu  (npx + manuel kopyala)
   → code-reviewer, test-generator, security-auditor,
     express-expert, sqlite-expert

3. Backend — Architect endpoint  (POST /api/multiagent/:id/architect)
   → SSE stream, PersistentSession(Opus), manifest parse + DB kaydet

4. Backend — MultiAgentRunner  (LoopRunner'ın yan sınıfı)
   → _workTurn override: orchestrator turn + worker turn
   → SessionPool key şeması: multiagent:<id>:<role>

5. Backend — tile CRUD endpoint'leri  (POST /api/multiagent, GET history, vb.)

6. Frontend — MultiAgentTile.jsx
   → 4 state: draft → planned → running → done
   → SSE client, progress kartları, agent durum göstergesi

7. Frontend — App.jsx / MediaOverlay.jsx'e tile tip ekle

8. Test: basit bir Express + SQLite projesi, 8 iterasyon sınırında bitmeli
```

---

## Kritik Kısıtlar

- **Runtime'da npx çalıştırma yok.** Agent profilleri önceden kurulu olmalı; eksikse hata dön, kullanıcı manuel kursun.
- **SessionPool dispose.** Tile silindiğinde `multiagent:<mediaId>:*` tüm session'lar dispose. `cleanupRoom` zaten prefix bazlı dispose ediyor, pattern ekle.
- **Manifest değişirse loop sıfırlanır.** `LoopRunner`'daki `rec.goal !== this.spec.goal` mantığı `MultiAgentRunner`'da `rec.manifest !== this.spec.manifest` olarak çalışır.
- **Orchestrator loop'u.** Orchestrator sonsuz "orchestrate et" döngüsüne girmesin: her iterasyonda TEK bir `nextRole + task` döner, sonra control ana loop'a döner.
- **Paralel agent örtüşmesi yok.** Aynı anda iki worker çalışmaz; orchestrator her iterasyonda tek bir seçim yapar.
- **Model override.** Architect ve orchestrator için model, tile settings'ten değil manifest'ten gelir (Opus, Sonnet). Worker'lar manifest'teki `model` alanını kullanır.

---

## Dosya Listesi (oluşturulacak / değiştirilecek)

```
Yeni:
  .claude/agents/project-architect.md
  .claude/agents/threejs-specialist.md
  .claude/agents/express-api-expert.md
  .claude/agents/sqlite-schema-expert.md
  .claude/agents/multiagent-orchestrator.md
  src/components/MultiAgentTile.jsx

Değişen:
  server.js
    → MultiAgentRunner class (LoopRunner'ın yanına, ~200 satır)
    → POST /api/multiagent (tile oluştur)
    → POST /api/multiagent/:id/architect (SSE)
    → GET  /api/multiagent/:id/architect
    → POST /api/multiagent/:id/loop/start
    → GET  /api/multiagent/:id/loop/stream (SSE)
    → POST /api/multiagent/:id/loop/stop
    → GET  /api/multiagent/:id/loop/status
    → cleanupRoom → multiagent prefix dispose
  src/App.jsx veya MediaOverlay.jsx
    → type === 'multiagent' → <MultiAgentTile>
```
