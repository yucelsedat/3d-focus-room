// GIF → tek tek kare dosyaları (mobil istemci için).
//
// expo-gl GIF'in yalnız ilk karesini çözebilir. Eskiden tüm kareler tek bir
// 2048 px atlasa sığdırılıyordu; uzun GIF'lerde (yüzlerce kare) bu, kareleri hem
// küçültüyor hem seyreltiyordu (544 kare → 68 kare, 113×200 px). Şimdi her kare
// ayrı bir JPEG/PNG olarak yazılır; telefon kareleri sırayla indirip tek bir
// dokuya yükler. Böylece çözünürlük ve kare hızı korunur, GPU'da GIF başına tek
// doku kalır.
//
// Üretim worker thread'lerde yapılır (sunucu kilitlenmez) ve kareler hazır
// oldukça istemciye açılır: istemci `ready` sayısını yoklayarak oynatmaya baştan
// başlayabilir.
//
// Yanıt: { key, base, ext, frames, frameWidth, frameHeight, width, height, delays, ready, done }
//   base + `${String(k).padStart(4, '0')}.${ext}` → k. kare
//   delays: kare başına milisaniye (seyreltilen karelerin süreleri toplanır)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { Worker } from 'worker_threads';
import omggif from 'omggif';

const { GifReader } = omggif;

const VERSION = 2;            // biçim değişirse önbellek kendiliğinden yenilenir
const MAX_FRAME_SIDE = 720;   // duvarda yakından bakınca da net; daha büyüğü telefonda çözmesi pahalı
const MIN_DELAY = 33;         // ~30 fps üstü seyreltilir (göz farkı görmez, iş yarıya iner)
const MAX_FRAMES = 1500;      // çok uzun GIF'lerde kare hızı düşürülür (toplam süre korunur)
const PAD = 4;                // dosya adı: 0000.jpg … 1499.jpg
const MAX_JOBS = 1;           // aynı anda üretilen GIF sayısı (CPU'yu web'e de bırak)

// Tarayıcılar 0–1 cs gecikmeyi 100 ms sayar; aynı davranış
const frameDelayMs = (cs) => (cs <= 1 ? 100 : cs * 10);

export const frameName = (k, ext) => `${String(k).padStart(PAD, '0')}.${ext}`;

/**
 * Hangi kareler yazılacak ve ne kadar gösterilecek. Bir kare, gösterim süresi
 * en az minDelay olana kadar arkasındaki kareleri de "yutar".
 */
export function planGif(reader) {
  const W = reader.width;
  const H = reader.height;
  const n = reader.numFrames();
  const infos = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const f = reader.frameInfo(i);
    infos.push(f);
    total += frameDelayMs(f.delay);
  }
  const minDelay = Math.max(MIN_DELAY, total / MAX_FRAMES);
  const picks = [];
  const delays = [];
  for (let i = 0; i < n; i++) {
    const d = frameDelayMs(infos[i].delay);
    if (!delays.length || delays[delays.length - 1] >= minDelay) {
      picks.push(i);
      delays.push(d);
    } else {
      delays[delays.length - 1] += d;
    }
  }
  const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(W, H));
  const fw = Math.max(1, Math.round(W * scale));
  const fh = Math.max(1, Math.round(H * scale));

  // Saydamlık: ilk kare saydam pikselli ise ya da bir kare "arka plana dön"
  // (disposal 2) ile alanı temizliyorsa PNG; değilse daha küçük ve hızlı JPEG.
  const first = new Uint8Array(W * H * 4);
  if (n > 0) reader.decodeAndBlitFrameRGBA(0, first);
  let alpha = infos.some((f) => f.disposal === 2 && f.transparent_index !== null);
  for (let p = 3; !alpha && p < first.length; p += 4) if (first[p] < 255) alpha = true;

  return { W, H, n, picks, delays, fw, fh, ext: alpha ? 'png' : 'jpg' };
}

const jobs = new Map();   // key → { meta, ready, done, error }
const queue = [];         // başlamayı bekleyen işler
let running = 0;

function pump() {
  while (running < MAX_JOBS && queue.length) {
    running++;
    const start = queue.shift();
    start().finally(() => { running--; pump(); });
  }
}

function runJob(job, srcPath, outDir, plan) {
  return new Promise((resolve) => {
    const encoders = Math.max(1, Math.min(3, (os.availableParallelism?.() ?? os.cpus().length) - 1));
    const worker = new Worker(new URL('./gifFramesWorker.js', import.meta.url), {
      workerData: {
        role: 'decode', srcPath, outDir, encoders,
        picks: plan.picks, fw: plan.fw, fh: plan.fh, ext: plan.ext,
      },
    });
    worker.on('message', async (msg) => {
      if (msg.type === 'progress') job.ready = msg.ready;
      if (msg.type === 'done') {
        job.ready = job.meta.frames;
        await fs.promises.writeFile(path.join(outDir, 'meta.json'), JSON.stringify({ ...job.meta, ready: job.ready, done: true }))
          .catch((err) => console.error('[gif-frames] meta yazılamadı:', err.message));
        job.done = true;
        setTimeout(() => jobs.delete(job.key), 60_000); // artık diskteki meta.json yeter
        resolve();
      }
    });
    worker.on('error', (err) => {
      console.error('[gif-frames] hata:', err.message);
      job.error = err;
      setTimeout(() => jobs.delete(job.key), 60_000);
      resolve();
    });
    worker.on('exit', () => resolve());
  });
}

const status = (job) => {
  if (job.error) throw Object.assign(new Error(`GIF işlenemedi: ${job.error.message}`), { status: 500 });
  return { ...job.meta, ready: job.ready, done: job.done };
};

/**
 * publicDir: sunucunun public klasörü; srcUrl: '/uploads/...' yolu.
 * Kareler public/uploads/gif-frames/<key>/ altına yazılır. Geçersiz istek → Error(status).
 */
export async function getGifFrames(publicDir, srcUrl) {
  const uploadsRoot = path.join(publicDir, 'uploads') + path.sep;
  const srcPath = path.resolve(path.join(publicDir, srcUrl));
  if (!srcUrl.startsWith('/uploads/') || !srcPath.startsWith(uploadsRoot)) {
    throw Object.assign(new Error('Geçersiz kaynak'), { status: 400 });
  }
  const stat = await fs.promises.stat(srcPath).catch(() => null);
  if (!stat?.isFile()) throw Object.assign(new Error('Dosya bulunamadı'), { status: 404 });

  const key = crypto.createHash('sha1')
    .update(`${VERSION}|${srcUrl}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 20);
  if (jobs.has(key)) return status(jobs.get(key));

  const outDir = path.join(publicDir, 'uploads', 'gif-frames', key);
  const cached = await fs.promises.readFile(path.join(outDir, 'meta.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (cached?.done) return cached;

  // İlk istek: başlığı ayrıştır (büyük GIF'te bile ~20 ms), planı hemen döndür
  const job = { key, meta: null, ready: 0, done: false, error: null };
  jobs.set(key, job);
  try {
    const buf = await fs.promises.readFile(srcPath);
    if (buf.subarray(0, 3).toString('latin1') !== 'GIF') {
      throw Object.assign(new Error('GIF değil'), { status: 415 });
    }
    const plan = planGif(new GifReader(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)));
    job.meta = {
      key,
      base: `/uploads/gif-frames/${key}/`,
      ext: plan.ext,
      frames: plan.picks.length,
      frameWidth: plan.fw,
      frameHeight: plan.fh,
      width: plan.W,
      height: plan.H,
      delays: plan.delays,
    };
    // Yarım kalmış önceki üretim (sunucu yeniden başladıysa) baştan yazılır
    await fs.promises.rm(outDir, { recursive: true, force: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    queue.push(() => runJob(job, srcPath, outDir, plan));
    pump();
    return status(job);
  } catch (err) {
    jobs.delete(key);
    throw err;
  }
}
