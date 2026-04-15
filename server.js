import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename).replace('/src/server', '');

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

// ─── Directory helpers ────────────────────────────────────────────────────────
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir('public/uploads/images');
ensureDir('public/uploads/videos');
ensureDir('public/data');
ensureDir('public/data/rooms');

// ─── Boot-time migration ──────────────────────────────────────────────────────
// If the flat files still exist at public/data/{media,doors,floor}.json,
// move them into the default room folder so the old data is preserved.
const ROOMS_META = 'public/data/rooms.json';
const DEFAULT_ROOM_DIR = 'public/data/rooms/default';

if (!fs.existsSync(ROOMS_META)) {
  ensureDir(DEFAULT_ROOM_DIR);

  const legacyMedia = 'public/data/media.json';
  const legacyDoors = 'public/data/doors.json';
  const legacyFloor = 'public/data/floor.json';

  if (fs.existsSync(legacyMedia)) fs.renameSync(legacyMedia, `${DEFAULT_ROOM_DIR}/media.json`);
  else fs.writeFileSync(`${DEFAULT_ROOM_DIR}/media.json`, '[]');

  if (fs.existsSync(legacyDoors)) fs.renameSync(legacyDoors, `${DEFAULT_ROOM_DIR}/doors.json`);
  else fs.writeFileSync(`${DEFAULT_ROOM_DIR}/doors.json`, '[]');

  if (fs.existsSync(legacyFloor)) fs.renameSync(legacyFloor, `${DEFAULT_ROOM_DIR}/floor.json`);
  else fs.writeFileSync(`${DEFAULT_ROOM_DIR}/floor.json`, JSON.stringify({ texture: 'zemin.png' }));

  const now = new Date().toISOString();
  fs.writeFileSync(ROOMS_META, JSON.stringify([
    { id: 'default', name: 'Varsayılan Oda', createdAt: now, updatedAt: now }
  ], null, 2));

  console.log('[server] Migrated legacy data → rooms/default/');
}

// ─── Active room ──────────────────────────────────────────────────────────────
let activeRoomId = 'default';

const DATA_PATH  = () => `public/data/rooms/${activeRoomId}/media.json`;
const DOORS_PATH = () => `public/data/rooms/${activeRoomId}/doors.json`;
const FLOOR_PATH = () => `public/data/rooms/${activeRoomId}/floor.json`;

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = file.mimetype.startsWith('video/') ? 'videos' : 'images';
    cb(null, `public/uploads/${type}/`);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// ─── Rooms API ────────────────────────────────────────────────────────────────

app.get('/api/rooms', (req, res) => {
  const rooms = JSON.parse(fs.readFileSync(ROOMS_META, 'utf8'));
  res.json(rooms);
});

app.post('/api/rooms', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });

  const id = `room-${Date.now()}`;
  const now = new Date().toISOString();
  const newRoom = { id, name: name.trim(), createdAt: now, updatedAt: now };

  const dir = `public/data/rooms/${id}`;
  ensureDir(dir);
  fs.writeFileSync(`${dir}/media.json`, '[]');
  fs.writeFileSync(`${dir}/doors.json`, '[]');
  fs.writeFileSync(`${dir}/floor.json`, JSON.stringify({ texture: 'zemin.png' }));

  const rooms = JSON.parse(fs.readFileSync(ROOMS_META, 'utf8'));
  rooms.push(newRoom);
  fs.writeFileSync(ROOMS_META, JSON.stringify(rooms, null, 2));

  res.json(newRoom);
});

app.post('/api/rooms/:id/activate', (req, res) => {
  const { id } = req.params;
  const rooms = JSON.parse(fs.readFileSync(ROOMS_META, 'utf8'));
  const room = rooms.find(r => r.id === id);
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  activeRoomId = id;
  console.log(`[server] Active room → ${id} (${room.name})`);
  res.json({ ok: true, room });
});

app.put('/api/rooms/:id/name', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });

  const rooms = JSON.parse(fs.readFileSync(ROOMS_META, 'utf8'));
  const room = rooms.find(r => r.id === id);
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  room.name = name.trim();
  room.updatedAt = new Date().toISOString();
  fs.writeFileSync(ROOMS_META, JSON.stringify(rooms, null, 2));
  res.json(room);
});

app.delete('/api/rooms/:id', (req, res) => {
  const { id } = req.params;
  if (id === 'default') return res.status(400).json({ error: 'Varsayılan oda silinemez' });

  const rooms = JSON.parse(fs.readFileSync(ROOMS_META, 'utf8'));
  const idx = rooms.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Oda bulunamadı' });

  // Remove room directory
  const dir = `public/data/rooms/${id}`;
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

  rooms.splice(idx, 1);
  fs.writeFileSync(ROOMS_META, JSON.stringify(rooms, null, 2));

  // If this was the active room, fall back to default
  if (activeRoomId === id) activeRoomId = 'default';

  res.json({ ok: true });
});

// ─── Floor API ────────────────────────────────────────────────────────────────

app.get('/api/floor', (req, res) => {
  if (!fs.existsSync(FLOOR_PATH())) fs.writeFileSync(FLOOR_PATH(), JSON.stringify({ texture: 'zemin.png' }))
  res.json(JSON.parse(fs.readFileSync(FLOOR_PATH(), 'utf8')))
})

app.post('/api/floor', (req, res) => {
  const { texture } = req.body
  fs.writeFileSync(FLOOR_PATH(), JSON.stringify({ texture }))
  res.json({ texture })
})

app.get('/api/floor-textures', (req, res) => {
  const dir = 'public/textures'
  const files = fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'duvar.png')
  res.json(files)
})

// ─── Doors API ────────────────────────────────────────────────────────────────

app.get('/api/doors', (req, res) => {
  if (!fs.existsSync(DOORS_PATH())) fs.writeFileSync(DOORS_PATH(), '[]')
  res.json(JSON.parse(fs.readFileSync(DOORS_PATH(), 'utf8')))
})

app.post('/api/doors', (req, res) => {
  const { ids } = req.body
  if (!fs.existsSync(DOORS_PATH())) fs.writeFileSync(DOORS_PATH(), '[]')
  const data = JSON.parse(fs.readFileSync(DOORS_PATH(), 'utf8'))
  const updated = [...new Set([...data, ...ids])]
  fs.writeFileSync(DOORS_PATH(), JSON.stringify(updated))
  res.json(updated)
})

app.delete('/api/doors', (req, res) => {
  const { ids } = req.body
  if (!fs.existsSync(DOORS_PATH())) return res.json([])
  const data = JSON.parse(fs.readFileSync(DOORS_PATH(), 'utf8'))
  const updated = data.filter(id => !ids.includes(id))
  fs.writeFileSync(DOORS_PATH(), JSON.stringify(updated))
  res.json(updated)
})

// ─── Media API ────────────────────────────────────────────────────────────────

app.get('/api/media', (req, res) => {
  if (!fs.existsSync(DATA_PATH())) {
    fs.writeFileSync(DATA_PATH(), '[]');
  }
  const data = fs.readFileSync(DATA_PATH(), 'utf8');
  res.json(JSON.parse(data));
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  const { tileId, type, width, height, position, rotation, url } = req.body;

  let mediaUrl = url;
  if (req.file) {
    const folder = req.file.mimetype.startsWith('video/') ? 'videos' : 'images';
    mediaUrl = `/uploads/${folder}/${req.file.filename}`;
  }

  const newItem = {
    id: Date.now(),
    tileId,
    type,
    url: mediaUrl,
    width: parseFloat(width) || 1,
    height: parseFloat(height) || 1,
    position: JSON.parse(position),
    rotation: JSON.parse(rotation)
  };

  const data = JSON.parse(fs.readFileSync(DATA_PATH(), 'utf8') || '[]');
  data.push(newItem);
  fs.writeFileSync(DATA_PATH(), JSON.stringify(data, null, 2));

  res.json(newItem);
});

// Proxy-download: fetches an external URL server-side and saves it locally.
app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Geçerli bir URL girin' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MediaFetcher/1.0)' }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Kaynak sunucu hatası: HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    const isVideo = contentType.startsWith('video/');
    const folder = isVideo ? 'videos' : 'images';

    let ext = 'jpg';
    try {
      const urlExt = path.extname(new URL(url).pathname).replace('.', '');
      if (urlExt) {
        ext = urlExt.toLowerCase().split('?')[0];
      } else {
        const ctExt = contentType.split('/')[1]?.split(';')[0];
        if (ctExt) ext = ctExt === 'jpeg' ? 'jpg' : ctExt;
      }
    } catch {}

    const filename = `${Date.now()}-fetched.${ext}`;
    const destPath = path.join(__dirname, 'public', 'uploads', folder, filename);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    res.json({
      localUrl: `/uploads/${folder}/${filename}`,
      type: isVideo ? 'video' : 'image',
    });
  } catch (err) {
    console.error('[fetch-url] error:', err.message);
    res.status(500).json({ error: `İndirme hatası: ${err.message}` });
  }
});

app.post('/api/add-text', (req, res) => {
  const { tileId, content, width, height, position, rotation } = req.body
  const newItem = {
    id: Date.now(),
    tileId,
    type: 'markdown',
    content,
    width: parseFloat(width) || 1,
    height: parseFloat(height) || 1,
    position: JSON.parse(position),
    rotation: JSON.parse(rotation)
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH(), 'utf8') || '[]')
  data.push(newItem)
  fs.writeFileSync(DATA_PATH(), JSON.stringify(data, null, 2))
  res.json(newItem)
})

app.put('/api/media/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const { width, height, content } = req.body
  const data = JSON.parse(fs.readFileSync(DATA_PATH(), 'utf8') || '[]')
  const itemIndex = data.findIndex(m => m.id === id)

  if (itemIndex === -1) return res.status(404).json({ error: 'Not found' })

  if (width !== undefined) data[itemIndex].width = parseFloat(width) || data[itemIndex].width;
  if (height !== undefined) data[itemIndex].height = parseFloat(height) || data[itemIndex].height;
  if (content !== undefined) data[itemIndex].content = content;

  fs.writeFileSync(DATA_PATH(), JSON.stringify(data, null, 2))
  res.json(data[itemIndex])
})

app.delete('/api/media/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const data = JSON.parse(fs.readFileSync(DATA_PATH(), 'utf8') || '[]')
  const item = data.find((m) => m.id === id)

  if (!item) return res.status(404).json({ error: 'Not found' })

  if (item.url && item.url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', item.url)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  const updated = data.filter((m) => m.id !== id)
  fs.writeFileSync(DATA_PATH(), JSON.stringify(updated, null, 2))
  res.json({ success: true })
})

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
