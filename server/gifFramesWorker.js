// gifFrames.js'in worker'ı. İki rol:
//  decode: GIF'i sırayla çözer (kareler birbirine bağlı, paralel çözülemez),
//          seçilen kareleri küçültüp encoder havuzuna dağıtır, hazır olan
//          ardışık kare sayısını ana thread'e bildirir.
//  encode: tek bir kareyi JPEG/PNG'ye kodlayıp diske yazar (asıl pahalı iş;
//          jpeg-js ~50 ms/kare → çekirdeklere bölünür).
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { Worker, parentPort, workerData } from 'worker_threads';
import omggif from 'omggif';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const { GifReader } = omggif;
const JPEG_QUALITY = 82;
const frameName = (k, ext) => `${String(k).padStart(4, '0')}.${ext}`; // gifFrames.js ile aynı

// Alfa ağırlıklı kutu filtresiyle küçültme (saydam kenarlarda koyu hale olmasın)
function downscale(src, sw, sh, fw, fh) {
  if (sw === fw && sh === fh) return src.slice();
  const dst = new Uint8Array(fw * fh * 4);
  for (let ty = 0; ty < fh; ty++) {
    const y0 = Math.floor((ty * sh) / fh);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / fh));
    for (let tx = 0; tx < fw; tx++) {
      const x0 = Math.floor((tx * sw) / fw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / fw));
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++, p += 4) {
          const al = src[p + 3];
          r += src[p] * al; g += src[p + 1] * al; b += src[p + 2] * al; a += al;
          count++;
        }
      }
      const q = (ty * fw + tx) * 4;
      if (a > 0) {
        dst[q] = Math.round(r / a); dst[q + 1] = Math.round(g / a); dst[q + 2] = Math.round(b / a);
      }
      dst[q + 3] = Math.round(a / count);
    }
  }
  return dst;
}

function encodeRole() {
  parentPort.on('message', ({ k, rgba, fw, fh, ext, outDir }) => {
    const data = Buffer.from(rgba);
    const out = ext === 'png'
      ? PNG.sync.write({ width: fw, height: fh, data })
      : jpeg.encode({ width: fw, height: fh, data }, JPEG_QUALITY).data;
    // Önce geçici ada yaz: istemci yarım dosya indirmesin
    const file = path.join(outDir, frameName(k, ext));
    fs.writeFileSync(`${file}.part`, out);
    fs.renameSync(`${file}.part`, file);
    parentPort.postMessage({ k });
  });
}

async function decodeRole() {
  const { srcPath, outDir, encoders, picks, fw, fh, ext } = workerData;
  const buf = fs.readFileSync(srcPath);
  const reader = new GifReader(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const W = reader.width;
  const H = reader.height;
  const canvas = new Uint8Array(W * H * 4); // birleştirilmiş tam kare (başta saydam)

  const pool = Array.from({ length: encoders }, () =>
    new Worker(new URL(import.meta.url), { workerData: { role: 'encode' } }));
  const maxInflight = encoders * 2; // bellek: bekleyen ham kare sayısı sınırlı
  const written = new Uint8Array(picks.length);
  let inflight = 0;
  let ready = 0;
  let wake = null;

  for (const w of pool) {
    w.on('message', ({ k }) => {
      inflight--;
      written[k] = 1;
      const before = ready;
      while (ready < picks.length && written[ready]) ready++;
      if (ready !== before) parentPort.postMessage({ type: 'progress', ready });
      wake?.();
    });
    w.on('error', (err) => { throw err; });
  }
  const slot = () => (inflight < maxInflight ? null : new Promise((r) => { wake = () => { wake = null; r(); }; }));

  let k = 0;
  let next = 0;
  for (let i = 0; i < reader.numFrames() && k < picks.length; i++) {
    const info = reader.frameInfo(i);
    const snapshot = info.disposal === 3 ? canvas.slice() : null;
    reader.decodeAndBlitFrameRGBA(i, canvas);

    if (i === picks[k]) {
      const wait = slot();
      if (wait) await wait;
      const rgba = downscale(canvas, W, H, fw, fh);
      inflight++;
      pool[next].postMessage({ k, rgba, fw, fh, ext, outDir }, [rgba.buffer]);
      next = (next + 1) % pool.length;
      k++;
    }

    // Sonraki kareden önce bu karenin "dispose" yöntemi
    if (info.disposal === 2) {
      for (let y = info.y; y < Math.min(H, info.y + info.height); y++) {
        canvas.fill(0, (y * W + info.x) * 4, (y * W + Math.min(W, info.x + info.width)) * 4);
      }
    } else if (snapshot) {
      canvas.set(snapshot);
    }
  }

  while (ready < picks.length) await new Promise((r) => { wake = () => { wake = null; r(); }; });
  await Promise.all(pool.map((w) => w.terminate()));
  parentPort.postMessage({ type: 'done' });
}

if (workerData?.role === 'encode') encodeRole();
else decodeRole();
