import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename).replace('/src/server', '');

// ─── Prisma ───────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: 'file:' + DB_PATH });
const prisma = new PrismaClient({ adapter });

// Serialize media row → frontend shape (position/rotation arrays, id as number)
function serializeMedia(m) {
  return {
    id: Number(m.id),
    tileId: m.tileId,
    type: m.type,
    url: m.url ?? undefined,
    content: m.content ?? undefined,
    width: m.width,
    height: m.height,
    position: [m.posX, m.posY, m.posZ],
    rotation: [m.rotX, m.rotY, m.rotZ, m.rotOrder],
  };
}

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

// Ensure upload dirs exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir('public/uploads/images');
ensureDir('public/uploads/videos');

// ─── Active room ──────────────────────────────────────────────────────────────
let activeRoomId = 'default';

// ─── Boot-time: auto-migrate JSON → SQLite if DB is empty ────────────────────
async function bootMigrate() {
  const count = await prisma.room.count();
  if (count === 0) {
    const ROOMS_META = path.join(__dirname, 'public/data/rooms.json');
    if (fs.existsSync(ROOMS_META)) {
      console.log('[server] DB empty, running JSON→SQLite migration...');
      const { default: migrate } = await import('./prisma/migrate.js');
      await migrate();
    } else {
      // Fresh start: create default room
      await prisma.room.create({
        data: { id: 'default', name: 'Varsayılan Oda' },
      });
      await prisma.floor.create({
        data: { roomId: 'default', texture: 'zemin.png' },
      });
      console.log('[server] Created default room in DB');
    }
  }
}

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

// ─── Special door helpers ─────────────────────────────────────────────────────

const GRID_SIZE_SRV = 40;

function getSpecialDoorInstanceIds(anchorId) {
  const face = anchorId % 4;
  const j    = Math.floor((anchorId % (GRID_SIZE_SRV * 4)) / 4);
  const ids  = [];
  for (let dh = 0; dh < 3; dh++) {
    for (let dj = 0; dj < 2; dj++) {
      const jj = j + dj;
      if (jj >= GRID_SIZE_SRV) continue;
      ids.push((dh * GRID_SIZE_SRV * 4) + (jj * 4) + face);
    }
  }
  return ids;
}

function getReturnAnchorId(anchorId) {
  const face = anchorId % 4;
  const j    = Math.floor((anchorId % (GRID_SIZE_SRV * 4)) / 4);
  const oppositeFace = face === 0 ? 1 : face === 1 ? 0 : face === 2 ? 3 : 2;
  return j * 4 + oppositeFace;
}

// ─── Rooms API ────────────────────────────────────────────────────────────────

function serializeRoom(r) {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    categories: (r.categories ?? []).map(rc => rc.category),
    parent: r.parent ? { id: r.parent.id, name: r.parent.name } : null,
    children: (r.children ?? []).map(c => ({ id: c.id, name: c.name })),
  };
}

const roomInclude = {
  categories: { include: { category: true } },
  parent: true,
  children: true,
};

app.get('/api/rooms', async (req, res) => {
  const rooms = await prisma.room.findMany({
    orderBy: { createdAt: 'asc' },
    include: roomInclude,
  });
  res.json(rooms.map(serializeRoom));
});

app.post('/api/rooms', async (req, res) => {
  const { name, categoryNames = [], parentId = null } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });

  const id = `room-${Date.now()}`;

  const categories = await Promise.all(
    categoryNames.map(n => prisma.category.upsert({ where: { name: n }, update: {}, create: { name: n } }))
  );

  await prisma.$transaction([
    prisma.room.create({ data: { id, name: name.trim(), parentId: parentId || null } }),
    prisma.floor.create({ data: { roomId: id, texture: 'zemin.png' } }),
    ...categories.map(c => prisma.roomCategory.create({ data: { roomId: id, categoryId: c.id } })),
  ]);

  const room = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  res.json(serializeRoom(room));
});

app.post('/api/rooms/:id/activate', async (req, res) => {
  const { id } = req.params;
  const room = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  activeRoomId = id;
  console.log(`[server] Active room → ${id} (${room.name})`);
  res.json({ ok: true, room: serializeRoom(room) });
});

app.put('/api/rooms/:id/name', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  const updated = await prisma.room.update({
    where: { id },
    data: { name: name.trim() },
  });
  res.json(updated);
});

app.delete('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  if (id === 'default') return res.status(400).json({ error: 'Varsayılan oda silinemez' });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  // Delete uploaded files for this room's media
  const mediaItems = await prisma.media.findMany({ where: { roomId: id } });
  for (const m of mediaItems) {
    if (m.url && m.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, 'public', m.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  // onDelete: Cascade removes media/doors/floor automatically
  await prisma.room.delete({ where: { id } });

  if (activeRoomId === id) activeRoomId = 'default';
  res.json({ ok: true });
});

app.get('/api/rooms/:id/details', async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { id: req.params.id },
    include: roomInclude,
  });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });
  res.json(serializeRoom(room));
});

// ─── helper: collect all ancestor IDs ────────────────────────────────────────
async function getAllAncestors(roomId, visited = new Set()) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { parentId: true } });
  if (room?.parentId && !visited.has(room.parentId)) {
    visited.add(room.parentId);
    await getAllAncestors(room.parentId, visited);
  }
  return visited;
}

app.put('/api/rooms/:id/settings', async (req, res) => {
  const { id } = req.params;
  const { name, categoryNames, parentId } = req.body;

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  if (parentId) {
    if (parentId === id) return res.status(400).json({ error: "Oda kendisinin parent'ı olamaz" });
    const ancestors = await getAllAncestors(parentId);
    if (ancestors.has(id)) return res.status(400).json({ error: "Dairesel ilişki: bu oda zaten seçilen odanın atası" });
  }

  await prisma.$transaction(async (tx) => {
    const data = {};
    if (name && name.trim()) data.name = name.trim();
    if (parentId !== undefined) data.parentId = parentId || null;
    if (Object.keys(data).length) await tx.room.update({ where: { id }, data });

    if (Array.isArray(categoryNames)) {
      await tx.roomCategory.deleteMany({ where: { roomId: id } });
      const cats = await Promise.all(
        categoryNames.map(n => tx.category.upsert({ where: { name: n }, update: {}, create: { name: n } }))
      );
      for (const c of cats) await tx.roomCategory.create({ data: { roomId: id, categoryId: c.id } });
    }
  });

  const updated = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  res.json(serializeRoom(updated));
});

// ─── Categories API ───────────────────────────────────────────────────────────

app.get('/api/categories', async (req, res) => {
  const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json(cats);
});

app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });
  const cat = await prisma.category.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim() },
  });
  res.json(cat);
});

// ─── Floor API ────────────────────────────────────────────────────────────────

app.get('/api/floor', async (req, res) => {
  let floor = await prisma.floor.findUnique({ where: { roomId: activeRoomId } });
  if (!floor) {
    floor = await prisma.floor.create({ data: { roomId: activeRoomId, texture: 'zemin.png' } });
  }
  res.json({ texture: floor.texture });
});

app.post('/api/floor', async (req, res) => {
  const { texture } = req.body;
  const floor = await prisma.floor.upsert({
    where: { roomId: activeRoomId },
    update: { texture },
    create: { roomId: activeRoomId, texture },
  });
  res.json({ texture: floor.texture });
});

app.get('/api/floor-textures', (req, res) => {
  const dir = 'public/textures';
  const files = fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'duvar.png');
  res.json(files);
});

// ─── Doors API ────────────────────────────────────────────────────────────────

app.get('/api/doors', async (req, res) => {
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => d.doorId));
});

app.post('/api/doors', async (req, res) => {
  const { ids } = req.body;
  for (const doorId of ids) {
    await prisma.door.upsert({
      where: { roomId_doorId: { roomId: activeRoomId, doorId: parseInt(doorId) } },
      update: {},
      create: { roomId: activeRoomId, doorId: parseInt(doorId) },
    });
  }
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => d.doorId));
});

app.delete('/api/doors', async (req, res) => {
  const { ids } = req.body;
  await prisma.door.deleteMany({
    where: { roomId: activeRoomId, doorId: { in: ids.map(Number) } },
  });
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => d.doorId));
});

// ─── Special Doors API ───────────────────────────────────────────────────────

function serializeSpecialDoor(sd) {
  return {
    id: sd.id,
    anchorId: sd.anchorId,
    targetRoomId: sd.targetRoomId,
    targetRoomName: sd.target.name,
    instanceIds: getSpecialDoorInstanceIds(sd.anchorId),
  };
}

app.get('/api/special-doors', async (req, res) => {
  const doors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  res.json(doors.map(serializeSpecialDoor));
});

app.post('/api/special-doors', async (req, res) => {
  const { anchorId, childRoomName } = req.body;
  if (!childRoomName?.trim()) return res.status(400).json({ error: 'Oda adı gerekli' });

  const childId = `room-${Date.now()}`;
  const returnAnchorId = getReturnAnchorId(anchorId);

  await prisma.$transaction([
    prisma.room.create({ data: { id: childId, name: childRoomName.trim(), parentId: activeRoomId } }),
    prisma.floor.create({ data: { roomId: childId, texture: 'zemin.png' } }),
    prisma.specialDoor.create({ data: { roomId: activeRoomId, anchorId, targetRoomId: childId } }),
    prisma.specialDoor.create({ data: { roomId: childId, anchorId: returnAnchorId, targetRoomId: activeRoomId } }),
  ]);

  const child = await prisma.room.findUnique({ where: { id: childId }, include: roomInclude });
  const parentSpecialDoors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  res.json({
    childRoom: serializeRoom(child),
    specialDoors: parentSpecialDoors.map(serializeSpecialDoor),
  });
});

app.delete('/api/special-doors/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const door = await prisma.specialDoor.findUnique({ where: { id } });
  if (!door) return res.status(404).json({ error: 'Bulunamadı' });
  const returnAnchorId = getReturnAnchorId(door.anchorId);
  await prisma.specialDoor.deleteMany({
    where: { OR: [{ id }, { roomId: door.targetRoomId, anchorId: returnAnchorId }] },
  });
  res.json({ success: true });
});

// ─── Media API ────────────────────────────────────────────────────────────────

app.get('/api/media', async (req, res) => {
  const media = await prisma.media.findMany({ where: { roomId: activeRoomId } });
  res.json(media.map(serializeMedia));
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  const { tileId, type, width, height, position, rotation, url } = req.body;

  let mediaUrl = url;
  if (req.file) {
    const folder = req.file.mimetype.startsWith('video/') ? 'videos' : 'images';
    mediaUrl = `/uploads/${folder}/${req.file.filename}`;
  }

  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);
  const id = BigInt(Date.now());

  const media = await prisma.media.create({
    data: {
      id,
      roomId: activeRoomId,
      tileId,
      type,
      url: mediaUrl || null,
      width: parseFloat(width) || 1,
      height: parseFloat(height) || 1,
      posX: parseFloat(pos[0]) || 0,
      posY: parseFloat(pos[1]) || 0,
      posZ: parseFloat(pos[2]) || 0,
      rotX: parseFloat(rot[0]) || 0,
      rotY: parseFloat(rot[1]) || 0,
      rotZ: parseFloat(rot[2]) || 0,
      rotOrder: String(rot[3] || 'XYZ'),
    },
  });

  res.json(serializeMedia(media));
});

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

app.post('/api/add-text', async (req, res) => {
  const { tileId, content, width, height, position, rotation } = req.body;
  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);
  const id = BigInt(Date.now());

  const media = await prisma.media.create({
    data: {
      id,
      roomId: activeRoomId,
      tileId,
      type: 'markdown',
      content,
      width: parseFloat(width) || 1,
      height: parseFloat(height) || 1,
      posX: parseFloat(pos[0]) || 0,
      posY: parseFloat(pos[1]) || 0,
      posZ: parseFloat(pos[2]) || 0,
      rotX: parseFloat(rot[0]) || 0,
      rotY: parseFloat(rot[1]) || 0,
      rotZ: parseFloat(rot[2]) || 0,
      rotOrder: String(rot[3] || 'XYZ'),
    },
  });

  res.json(serializeMedia(media));
});

app.put('/api/media/:id', async (req, res) => {
  let id;
  try { id = BigInt(req.params.id) } catch { return res.status(400).json({ error: 'Geçersiz ID' }) }
  const { width, height, content } = req.body;

  const existing = await prisma.media.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const data = {};
  if (width !== undefined) data.width = parseFloat(width) || existing.width;
  if (height !== undefined) data.height = parseFloat(height) || existing.height;
  if (content !== undefined) data.content = content;

  const updated = await prisma.media.update({ where: { id }, data });
  res.json(serializeMedia(updated));
});

app.delete('/api/media/:id', async (req, res) => {
  let id;
  try { id = BigInt(req.params.id) } catch { return res.status(400).json({ error: 'Geçersiz ID' }) }
  const item = await prisma.media.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (item.url && item.url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', item.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await prisma.media.delete({ where: { id } });
  res.json({ success: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
await bootMigrate();
app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
