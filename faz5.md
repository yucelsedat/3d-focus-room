# Faz 5 — Çok-Ajanı Yeniden Düşün (Worktree Paralellik vs Routing)

**Amaç:** "Multiagent'ın faydasını anlayamadım" sorusuna dürüst cevap vermek. Bu faz kod optimizasyonu değil, **mimari varlık-nedeni** kararıdır.

**Teşhis (kanıtla):** Mevcut multiagent **seri, tek-klasör**: orkestratör her iterasyonda tek rol seçiyor, worker'lar aynı dizinde sırayla çalışıyor. Ölçülen 2.73M token'lık koşu bunun sonucu — bu **çok-ajan değeri değil, yeniden-yazım makinesi**. Aynı `index.html`'i 4 rol sırayla yazınca paralellik olmaz, tekrar olur.

**Açık kaynak dersi:** İncelenen orkestratörlerin (Claude Squad, Crystal→Nimbalyst, Vibe Kanban, Conductor, **ChatML**, Emdash) **hepsi** çok-ajan değerini **tek yerden** üretiyor: **git worktree izolasyonu + gerçekten paralel oturumlar.** Her ajan kendi worktree'sinde (kendi branch, kendi çalışma dizini), dosya çakışması yok. ChatML bunu Agent SDK ile yapıp 750+ PR merge etmiş. CLI'ın kendi `claude -w <name>` özelliği de aynı fikirde: worktree başına izole oturum.

→ **Çok-ajanın değeri gerçek paralellikte. Sizin kurulumunuz onu üretmiyor.** İki yol var.

---

## Fork A — Gerçek paralelliği benimse (worktree izolasyonu)
Yalnız **gerçekten bağımsız** domainler için (backend / frontend / test aynı anda). Sıralı-bağımlı işlerde (schema→API→frontend) uygulanmaz.

**Uygulama:**
1. Manifest'te her paralel rol için ayrı worktree: `git worktree add .worktrees/<role> -b ma/<role>` (ana çalışma tree'si dokunulmaz).
2. Worker'ı `cwd = .worktrees/<role>` ile spawn et (bağımsız oturum veya `--fork-session`). Roller **aynı anda** çalışır (paralel `query()` / spawn), tek tek değil.
3. **Entegrasyon adımı** (yeni): tüm paralel roller bitince bir "integrator" turu branch'leri ana tree'ye merge eder, çakışmaları çözer. (OSS'nin "merge decisions on my plate" dediği kısım — burada ele alınmalı, yoksa değer yarım kalır.)
4. worktree yaşam döngüsü: koşu bitince `git worktree remove`. Port/DB çakışması riski (paralel migration) → bağımsız domainlerde nadir, ama integrator adımında dikkat.

**Ne zaman:** kullanıcı fikri açıkça paralellenebilir çok-domainli ("ayrı backend + ayrı frontend + ayrı test") olduğunda.

## Fork B — Çoğu iş için emekliye ayır (routing lehine)
**Bağlam:** Kod tabanında zaten deterministik routing kapısı var (`classifyIdeaScale` + `directManifest`): basit iş mimara hiç gitmiyor, tek güçlü oturumda bitiyor. focus-room projelerinin çoğu **sıralı-bağımlı** — tek güçlü oturum (roomsession) hem daha ucuz hem daha tutarlı (reviewer implementasyon gürültüsü görmez).

**Uygulama:**
- Routing sınıflandırıcısını sıkılaştır: `multiagent` yalnızca **kanıtlanabilir bağımsız paralel domain** varken seçilsin; aksi halde `roomsession` (tek oturum) veya `direct`.
- Yanlış sınıflamada mevcut kurtarma akışı bir üst moda yükseltiyor — koru.

---

## Öneri: Hibrit
- **Varsayılan Fork B:** routing zaten var; multiagent'ı çoğu iş için devre dışı bırak, tek güçlü oturuma yönlendir. Bu, "6 kat token" algısının multiagent kaynaklı kısmını doğrudan bitirir.
- **Opt-in Fork A:** kullanıcı açıkça "paralel geliştir" derse veya fikir net biçimde çok-domainliyse, worktree izolasyonlu **gerçek** paralellik + integrator. Faz 4'teki SDK subagent/`fork` altyapısıyla temiz oturur.

**Karar kriteri (Fable 5 bunu koda döksün):**
```
paralel_domain_sayısı >= 2 && domainler_bağımsız && her_domain >= birkaç_dosya
   → Fork A (worktree, paralel)
aksi halde
   → Fork B (tek oturum / direct)
```

---

## Doğrulama
- `direct-cafe` bench senaryosu: multiagent tile'a girse bile routing `direct`'e/tek-oturuma düşmeli → hedef ~30–60K token (2.73M değil).
- Fork A denenirse: açıkça paralel bir senaryo (ör. "REST API + ayrı statik landing + ayrı test suite") → roller **aynı anda** ayrı worktree'lerde çalıştı mı (`git worktree list`), integrator merge etti mi, sonuç bütünlüklü mü?
- Karar kriteri birim testi: birkaç örnek fikir → doğru fork'a yönlendiriliyor mu.

## Kabul kriteri
Çok-ajan ya (Fork A) worktree ile **gerçek paralel değer** üretiyor ve integrator ile bütünleşiyor, ya da (Fork B) routing ile çoğu işte devre dışı ve tek oturuma yönleniyor. Net, kanıtlı karar — belirsiz "bazen çalışıyor" değil.

## Risk
Orta. Fork A: worktree yaşam döngüsü + merge çakışması karmaşıklığı (integrator şart). Fork B: düşük risk, çoğunlukla routing ayarı. Hibrit ikisinin de en güvenli kısmını alır.
