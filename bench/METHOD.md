# YÖNTEM — Deneme-yanılma yerine kanıtla ilerleme

Bu belge, focus-room token/parite çalışmasının (Faz 1-6) **nasıl** faydalı ilerleme
ürettiğini kaydeder. Amaç: sonraki işlerde aynı disiplini tekrarlamak. Kısa özet
tezi: **her iddiayı bir sayıya bağladık ve pahalı hamleyi ancak ölçüm gerektirince
yaptık.**

## Ne işe yaradı (bu çalışmada fiilen olan)

1. **Önce ölç, sonra optimize et.** İlk faz kod değiştirmedi — A/B bench düzeneği
   (`scripts/bench.mjs`) + tur-başı `[turn-usage]` logu kurdu. Bu olmadan "cacheWrite
   düştü mü" iddiası imkânsızdı. "6 kat token" şikâyetinin kaynağı ölçünce netleşti:
   çoğu zaten düzeltilmişti, gerisi tek bir yapısal sorundu.

2. **Mekanizmayı varsayma, gözlemle.** Cache TTL için dokümana/hafızaya güvenmedik;
   `result.usage.cache_creation` kırılımını okuyup `ephemeral_1h` vs `ephemeral_5m`
   ayrımını **gözle gördük**. Bayrakları kurulu CLI'da (`claude --help`, 2.1.195)
   doğruladık, "vardır herhalde" demedik.

3. **Sorunu çözmüş kaynaklardan öğren.** Strateji tahminle değil; resmi Agent SDK
   dokümanları, VS Code eklentisi deseni, açık kaynak orkestratörler (ChatML vb.)
   incelenerek çıkarıldı. "Amerika'yı yeniden keşfetme" tuzağı böyle görüldü.

4. **Kademeli + kanıta bağlı go/no-go.** Ucuz/düşük-riskli işler önce (Faz 1-3);
   yüksek-riskli yeniden yazım (Faz 4) **"ölçüm hâlâ boşluk gösterirse"** koşuluna
   bağlandı. Ölçüm boşluğun kapandığını gösterince Faz 4 NO-GO oldu — pahalı hamle
   yapılmadan önce gereksizliği kanıtlandı.

5. **Kontrollü A/B (izolasyon şart).** Aynı fikir, aynı ayar, izole `__bench__` odası,
   izole `USAGE_FILE`. İzolasyon kusuru (paylaşılan usage-daily → negatif delta)
   fark edilip düzeltilmeseydi tüm karşılaştırmalar bozuk olurdu.

6. **Gürültü ve arızalar konusunda dürüstlük.** ±%50 tek-koşu ajan varyansı, OOM-kill,
   oturum-limiti, roomsession faz3 anomalisi — hepsi rapora yazıldı, sayılar bu yüzden
   güvenilir. "Tur-başı log kanonik" kuralı bu dürüstlükten doğdu.

7. **Tek yüksek-riskli kararda bağımsız ikinci görüş.** Faz 4 go/no-go için codex
   (gpt-5.5/high) çapraz kontrol; büyük yeniden yazıma girmeden önce akıl yürütme
   doğrulandı.

8. **Geri dönülebilirlik / düşük blast-radius.** Bayrak arkası, tile-tipi tile-tipi,
   yıkıcı işlem yok, commit ertelendi. Her adım ölçülebilir bir kazançla kapandı.

## Bilinçli KAÇINILAN tuzaklar

- Nokta atışı, tahmine dayalı token yamaları (asıl bırakılması gereken alışkanlık).
- JSONL satır silme — format internal/kırılgan; "dokunabileceğinin sınırını bil".
- İlk hamle olarak compaction — kök neden geçmiş boyutu değil, gereksiz tur çoğalmasıydı.

## Sonraki işler için tekrarlanabilir döngü

1. **Sorunu sayıya çevir** — önce ölçüm/tekrar-üretim (bench senaryosu), baseline al.
2. **Mekanizmayı doğrula** — bayrak/API davranışını kurulu araçta gözlemle, varsayma.
3. **Kaynağı bul** — sorunu çözmüş referans (resmi docs / SDK / OSS) neyi farklı yapıyor?
4. **Ucuzdan pahalıya, kanıt kapılarıyla** — her fazı ölçülebilir kazançla kapat;
   yüksek-riskli hamleyi ancak ölçüm gerektiriyorsa ve (varsa) ikinci görüşle yap.
5. **İzole ölç, dürüst raporla** — kontrollü A/B; gürültüyü/arızayı sakla değil, yaz.
6. **Geri dönülebilir tut** — bayrak arkası, yıkıcı olmayan, commit'i kullanıcıya bırak.
