import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { ROOM_CONFIGS, getDoorInstanceIds, getReturnAnchorId, encodeWallId, decodeWallId, defaultFloorTexture } from './src/utils/roomConfig.js';

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
let activeRoomId   = 'default';
let activeRoomType = 'room';

// ─── AI Session tracking ─────────────────────────────────────────────────────
// Use standalone claude CLI (not CLAUDE_CODE_EXECPATH which is the VS Code extension's
// internal binary and doesn't work when spawned outside the VS Code context)
const CLAUDE_CLI = (() => {
  const candidates = [
    '/home/sedat/.local/bin/claude',
    process.env.CLAUDE_CODE_EXECPATH,
    'claude',
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return 'claude'
})()

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

const uploadCover = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/images/'),
    filename: (req, file, cb) => cb(null, `cover-${Date.now()}-${file.originalname}`),
  }),
});

const canvasUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/images/'),
    filename: (req, file, cb) => cb(null, `canvas-${Date.now()}-${file.originalname}`),
  }),
});

app.post('/api/upload-cover', uploadCover.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yüklenmedi' });
  const url = `/uploads/images/${req.file.filename}`;
  res.json({ url });
});

// ─── Special door helpers ─────────────────────────────────────────────────────

const OUTER_GRID_SIZE_SRV = 120;
const OUTER_CONFIG = { gx: OUTER_GRID_SIZE_SRV, gz: OUTER_GRID_SIZE_SRV, wh: 5 };

// ─── Rooms API ────────────────────────────────────────────────────────────────

function serializeRoom(r) {
  return {
    id: r.id,
    name: r.name,
    roomType: r.roomType ?? 'room',
    coverImage: r.coverImage ?? null,
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
  const { name, categoryNames = [], parentId = null, roomType = 'room' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });

  const id = `room-${Date.now()}`;
  const type = ROOM_CONFIGS[roomType] ? roomType : 'room';

  const categories = await Promise.all(
    categoryNames.map(n => prisma.category.upsert({ where: { name: n }, update: {}, create: { name: n } }))
  );

  await prisma.$transaction([
    prisma.room.create({ data: { id, name: name.trim(), parentId: parentId || null, roomType: type } }),
    prisma.floor.create({ data: { roomId: id, texture: defaultFloorTexture(type) } }),
    ...categories.map(c => prisma.roomCategory.create({ data: { roomId: id, categoryId: c.id } })),
  ]);

  const room = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  res.json(serializeRoom(room));
});

app.post('/api/rooms/:id/activate', async (req, res) => {
  const { id } = req.params;
  const room = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  activeRoomId   = id;
  activeRoomType = room.roomType ?? 'room';
  console.log(`[server] Active room → ${id} (${room.name}) type=${activeRoomType}`);
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

async function collectDescendants(rootId) {
  const ids = [rootId];
  const children = await prisma.room.findMany({ where: { parentId: rootId }, select: { id: true } });
  for (const child of children) {
    ids.push(...await collectDescendants(child.id));
  }
  return ids;
}

app.delete('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  const cascade = req.query.cascade === 'true';
  if (id === 'default') return res.status(400).json({ error: 'Varsayılan oda silinemez' });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  if (cascade) {
    const allIds = await collectDescendants(id);
    for (const roomId of allIds) {
      const mediaItems = await prisma.media.findMany({ where: { roomId } });
      for (const m of mediaItems) {
        if (m.url && m.url.startsWith('/uploads/')) {
          const fp = path.join(__dirname, 'public', m.url);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      }
    }
    await prisma.room.deleteMany({ where: { id: { in: allIds } } });
    if (allIds.includes(activeRoomId)) activeRoomId = 'default';
    return res.json({ ok: true, deletedIds: allIds });
  }

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
  res.json({ ok: true, deletedIds: [id] });
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

app.get('/api/worlds', async (req, res) => {
  const worlds = await prisma.room.findMany({
    where: { parentId: null },
    orderBy: { createdAt: 'asc' },
    include: roomInclude,
  });
  res.json(worlds.map(serializeRoom));
});

app.put('/api/rooms/:id/cover-image', async (req, res) => {
  const { id } = req.params;
  const { coverImage } = req.body;
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });
  const updated = await prisma.room.update({ where: { id }, data: { coverImage: coverImage || null } });
  res.json({ ok: true, coverImage: updated.coverImage });
});

app.put('/api/rooms/:id/settings', async (req, res) => {
  const { id } = req.params;
  const { name, categoryNames, parentId, coverImage } = req.body;

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
    if (coverImage !== undefined) data.coverImage = coverImage || null;
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
  res.json(doors.map(d => ({ id: d.doorId, isOuter: d.isOuter })));
});

app.post('/api/doors', async (req, res) => {
  const { ids, isOuter = false } = req.body;
  for (const doorId of ids) {
    await prisma.door.upsert({
      where: { roomId_doorId_isOuter: { roomId: activeRoomId, doorId: parseInt(doorId), isOuter } },
      update: {},
      create: { roomId: activeRoomId, doorId: parseInt(doorId), isOuter },
    });
  }
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => ({ id: d.doorId, isOuter: d.isOuter })));
});

app.delete('/api/doors', async (req, res) => {
  const { ids, isOuter = false } = req.body;
  await prisma.door.deleteMany({
    where: { roomId: activeRoomId, doorId: { in: ids.map(Number) }, isOuter },
  });
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => ({ id: d.doorId, isOuter: d.isOuter })));
});

// ─── Special Doors API ───────────────────────────────────────────────────────

function serializeSpecialDoor(sd, roomConfig) {
  const config = sd.isOuter ? OUTER_CONFIG : (roomConfig ?? ROOM_CONFIGS[activeRoomType] ?? ROOM_CONFIGS.room);
  return {
    id: sd.id,
    anchorId: sd.anchorId,
    targetRoomId: sd.targetRoomId,
    targetRoomName: sd.target.name,
    isOuter: sd.isOuter,
    instanceIds: getDoorInstanceIds(sd.anchorId, config),
  };
}

app.get('/api/special-doors', async (req, res) => {
  const doors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  res.json(doors.map(sd => serializeSpecialDoor(sd)));
});

app.post('/api/special-doors', async (req, res) => {
  const { anchorId, childRoomName, isOuter = false, roomType = 'room' } = req.body;
  if (!childRoomName?.trim()) return res.status(400).json({ error: 'Oda adı gerekli' });

  const childId = `room-${Date.now()}`;
  const childType = ROOM_CONFIGS[roomType] ? roomType : 'room';
  const parentConfig = isOuter ? OUTER_CONFIG : (ROOM_CONFIGS[activeRoomType] ?? ROOM_CONFIGS.room);
  const childConfig  = ROOM_CONFIGS[childType];

  // Back door: opposite face in child's coordinate system, j clamped to child face width
  const { face: pFace, j: pJ } = decodeWallId(anchorId, parentConfig);
  const oppFace = [1, 0, 3, 2][pFace];
  const childFaceWidth = oppFace < 2 ? childConfig.gx : childConfig.gz;
  const childJ = Math.min(pJ, childFaceWidth - 2);
  const childReturnAnchorId = encodeWallId(0, oppFace, childJ, childConfig);

  await prisma.$transaction([
    prisma.room.create({ data: { id: childId, name: childRoomName.trim(), parentId: activeRoomId, roomType: childType } }),
    prisma.floor.create({ data: { roomId: childId, texture: defaultFloorTexture(childType) } }),
    prisma.specialDoor.create({ data: { roomId: activeRoomId, anchorId, targetRoomId: childId, isOuter } }),
    prisma.specialDoor.create({ data: { roomId: childId, anchorId: childReturnAnchorId, targetRoomId: activeRoomId, isOuter: false } }),
  ]);

  const child = await prisma.room.findUnique({ where: { id: childId }, include: roomInclude });
  const parentSpecialDoors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  res.json({
    childRoom: serializeRoom(child),
    specialDoors: parentSpecialDoors.map(sd => serializeSpecialDoor(sd)),
  });
});

app.delete('/api/special-doors/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const door = await prisma.specialDoor.findUnique({
    where: { id },
    include: {
      room:   { select: { roomType: true } },
      target: { select: { roomType: true } },
    },
  });
  if (!door) return res.status(404).json({ error: 'Bulunamadı' });
  const sourceType = door.room?.roomType ?? 'room';
  const config = door.isOuter ? OUTER_CONFIG : (ROOM_CONFIGS[sourceType] ?? ROOM_CONFIGS.room);
  const targetType = door.target?.roomType ?? 'room';
  const targetConfig = ROOM_CONFIGS[targetType] ?? ROOM_CONFIGS.room;
  const { face: pFace, j: pJ } = decodeWallId(door.anchorId, config);
  const oppFace = [1, 0, 3, 2][pFace];
  const tFaceWidth = oppFace < 2 ? targetConfig.gx : targetConfig.gz;
  const tJ = Math.min(pJ, tFaceWidth - 2);
  const returnAnchorId = encodeWallId(0, oppFace, tJ, targetConfig);
  await prisma.specialDoor.deleteMany({
    where: {
      OR: [
        { id },
        { roomId: door.targetRoomId, anchorId: returnAnchorId, isOuter: false },
        { roomId: door.targetRoomId, targetRoomId: door.roomId },
      ],
    },
  });
  await prisma.room.updateMany({
    where: {
      OR: [
        { id: door.targetRoomId, parentId: door.roomId },
        { id: door.roomId,       parentId: door.targetRoomId },
      ],
    },
    data: { parentId: null },
  });
  const allRooms = await prisma.room.findMany({ include: roomInclude });
  res.json({ success: true, rooms: allRooms.map(serializeRoom) });
});

app.post('/api/special-doors/link', async (req, res) => {
  const { anchorId, targetRoomId, linkType, isOuter = false } = req.body;
  if (!targetRoomId) return res.status(400).json({ error: 'Oda seçilmedi' });

  await prisma.$transaction(async (tx) => {
    if (linkType === 'child') {
      await tx.room.update({ where: { id: targetRoomId }, data: { parentId: activeRoomId } });
    }
    await tx.specialDoor.create({ data: { roomId: activeRoomId, anchorId, targetRoomId, isOuter } });
  });

  const updatedDoors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  const allRooms = await prisma.room.findMany({ include: roomInclude });
  res.json({
    specialDoors: updatedDoors.map(sd => serializeSpecialDoor(sd)),
    rooms: allRooms.map(serializeRoom),
  });
});

// ─── Media API ────────────────────────────────────────────────────────────────

app.get('/api/media', async (req, res) => {
  const media = await prisma.media.findMany({ where: { roomId: activeRoomId } });
  res.json(media.map(serializeMedia));
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[upload] error:', err.message);
    res.status(500).json({ error: err.message });
  }
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

app.post('/api/canvas', async (req, res) => {
  const { tileId, width, height, position, rotation, bg = '#1a1a2e' } = req.body;
  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);
  const id = BigInt(Date.now());
  const content = JSON.stringify({ items: [], bg });

  const media = await prisma.media.create({
    data: {
      id,
      roomId: activeRoomId,
      tileId,
      type: 'canvas',
      url: null,
      content,
      width: parseFloat(width) || 8,
      height: parseFloat(height) || 4.5,
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

app.post('/api/header', async (req, res) => {
  const { tileId, width, height, position, rotation, bg = '#1a1a2e', color = '#ffffff', text = '' } = req.body;
  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);
  const id = BigInt(Date.now());
  const content = JSON.stringify({ text, bg, color });

  const media = await prisma.media.create({
    data: {
      id,
      roomId: activeRoomId,
      tileId,
      type: 'header',
      url: null,
      content,
      width: parseFloat(width) || 4,
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

app.post('/api/canvas/:id/upload', canvasUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  res.json({ url: `/uploads/images/${req.file.filename}` });
});

// Farklı canvas'a yapıştırırken resim dosyalarını kopyalar
app.post('/api/canvas/copy-images', (req, res) => {
  const { urls } = req.body;
  const mapping = {};
  for (const srcUrl of (urls || [])) {
    if (!srcUrl?.startsWith('/uploads/')) continue;
    const srcPath = path.join(__dirname, 'public', srcUrl);
    if (!fs.existsSync(srcPath)) continue;
    const ext = path.extname(srcUrl);
    const newFilename = `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    fs.copyFileSync(srcPath, path.join(__dirname, 'public', 'uploads', 'images', newFilename));
    mapping[srcUrl] = `/uploads/images/${newFilename}`;
  }
  res.json({ mapping });
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

app.post('/api/media/clone', async (req, res) => {
  const { sourceId, tileId, position, rotation } = req.body;
  let source;
  try {
    source = await prisma.media.findUnique({ where: { id: BigInt(sourceId) } });
  } catch { return res.status(400).json({ error: 'Geçersiz ID' }); }
  if (!source) return res.status(404).json({ error: 'Kaynak bulunamadı' });

  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);

  const copyUpload = (srcUrl) => {
    if (!srcUrl?.startsWith('/uploads/')) return srcUrl;
    const srcPath = path.join(__dirname, 'public', srcUrl);
    if (!fs.existsSync(srcPath)) return srcUrl;
    const ext = path.extname(srcUrl);
    const dir = path.dirname(srcUrl);
    const newFilename = `clone-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    fs.copyFileSync(srcPath, path.join(__dirname, 'public', dir, newFilename));
    return `${dir}/${newFilename}`;
  };

  const newUrl = copyUpload(source.url);

  let newContent = source.content;
  if (source.type === 'canvas' && source.content) {
    try {
      const parsed = JSON.parse(source.content);
      const items = (parsed.items || []).map(ci => ({ ...ci, url: copyUpload(ci.url) }));
      newContent = JSON.stringify({ ...parsed, items });
    } catch {}
  }

  const media = await prisma.media.create({
    data: {
      id: BigInt(Date.now()),
      roomId: activeRoomId,
      tileId,
      type: source.type,
      url: newUrl,
      content: newContent,
      width: source.width,
      height: source.height,
      posX: parseFloat(pos[0]), posY: parseFloat(pos[1]), posZ: parseFloat(pos[2]),
      rotX: parseFloat(rot[0]), rotY: parseFloat(rot[1]), rotZ: parseFloat(rot[2]),
      rotOrder: String(rot[3] || 'XYZ'),
    },
  });
  res.json(serializeMedia(media));
});

app.delete('/api/media/:id', async (req, res) => {
  let id;
  try { id = BigInt(req.params.id) } catch { return res.status(400).json({ error: 'Geçersiz ID' }) }
  const item = await prisma.media.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (item.type === 'canvas' && item.content) {
    try {
      const parsed = JSON.parse(item.content);
      (parsed.items || []).forEach(ci => {
        if (ci.url?.startsWith('/uploads/')) {
          const fp = path.join(__dirname, 'public', ci.url);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      });
    } catch {}
  }

  if (item.url && item.url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', item.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await prisma.media.delete({ where: { id } });
  res.json({ success: true });
});

// YouTube oEmbed meta proxy (title + thumbnail — avoids browser CORS)
app.get('/api/youtube-meta', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url gerekli' });
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!r.ok) return res.status(r.status).json({ error: 'oEmbed hatası' });
    const d = await r.json();
    res.json({ title: d.title || '', thumbnail_url: d.thumbnail_url || '', author_name: d.author_name || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Live Session (works standalone — no VS Code required) ───────────────────

const CWD_KEY = process.cwd().replace(/\//g, '-') // e.g. -home-sedat-projects-...
const PROJECT_DIR = path.join(os.homedir(), '.claude', 'projects', CWD_KEY)

// Session ID pinned for this server process lifetime (set on first message if no prior session)
let pinnedSessionId = null

function getLiveSession() {
  // Strategy 1: pinned session from this server run
  if (pinnedSessionId) {
    const jsonlPath = path.join(PROJECT_DIR, `${pinnedSessionId}.jsonl`)
    if (fs.existsSync(jsonlPath)) return { sessionId: pinnedSessionId, jsonlPath }
  }

  // Strategy 2: active VS Code session (most recent subdir under /tmp/claude-1000)
  try {
    const tmpDir = path.join('/tmp/claude-1000', CWD_KEY)
    const entries = fs.readdirSync(tmpDir, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory()).map(e => ({
      name: e.name,
      mtime: fs.statSync(path.join(tmpDir, e.name)).mtimeMs,
    }))
    if (dirs.length) {
      dirs.sort((a, b) => b.mtime - a.mtime)
      const sessionId = dirs[0].name
      const jsonlPath = path.join(PROJECT_DIR, `${sessionId}.jsonl`)
      if (fs.existsSync(jsonlPath)) return { sessionId, jsonlPath }
    }
  } catch {}

  // Strategy 3: most recently modified JSONL in ~/.claude/projects/{CWD_KEY}/
  try {
    fs.mkdirSync(PROJECT_DIR, { recursive: true })
    const files = fs.readdirSync(PROJECT_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ sessionId: f.slice(0, -6), mtime: fs.statSync(path.join(PROJECT_DIR, f)).mtimeMs }))
    if (files.length) {
      files.sort((a, b) => b.mtime - a.mtime)
      const { sessionId } = files[0]
      return { sessionId, jsonlPath: path.join(PROJECT_DIR, `${sessionId}.jsonl`) }
    }
  } catch {}

  return null // no prior session — first message will create one
}

// media.content stores JSON: { sessionId?, model, effort }
// Backward compat: plain session ID string → treat as sessionId
function parseSessionContent(raw) {
  const defaults = { sessionId: null, model: 'claude-fable-5', effort: 'normal' }
  if (!raw) return defaults
  if (!raw.startsWith('{')) return { ...defaults, sessionId: raw }
  try { return { ...defaults, ...JSON.parse(raw) } } catch { return defaults }
}

function formatSessionContent(obj) {
  return JSON.stringify(obj)
}

// Standalone claude CLI bazı UI model adlarını (ör. claude-fable-5) tanımıyor.
// --model'e geçmeden önce desteklenen bir ada normalize et. Fable 5 ≈ Opus.
function cliModel(model) {
  if (!model || /fable/i.test(model)) return 'opus'
  return model
}

function parseLiveMessages(content) {
  const messages = []
  for (const line of content.split('\n').filter(Boolean)) {
    try {
      const d = JSON.parse(line)
      if (d.isSidechain) continue
      const msg = d.message
      if (!msg) continue
      const blocks = Array.isArray(msg.content) ? msg.content : []

      if (msg.role === 'user') {
        // --print mode writes user content as a plain string, not blocks
        if (typeof msg.content === 'string' && msg.content.trim() && !msg.content.startsWith('<')) {
          messages.push({ role: 'user', text: msg.content, id: d.uuid })
        }
        for (const b of blocks) {
          if (b.type === 'text' && b.text?.trim()) {
            messages.push({ role: 'user', text: b.text, id: d.uuid })
          }
          if (b.type === 'tool_result') {
            const out = Array.isArray(b.content)
              ? b.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
              : (typeof b.content === 'string' ? b.content : '')
            if (out.trim()) {
              messages.push({ role: 'tool_result', text: out, id: `tr-${b.tool_use_id}` })
            }
          }
        }
      }

      if (msg.role === 'assistant') {
        for (const b of blocks) {
          if (b.type === 'text' && b.text?.trim()) {
            messages.push({ role: 'assistant', text: b.text, id: `${d.uuid}-text` })
          }
          if (b.type === 'tool_use') {
            const cmd = b.input?.command || b.input?.description || b.name
            messages.push({ role: 'tool_call', text: cmd, toolName: b.name, id: `${d.uuid}-${b.id}` })
          }
        }
      }
    } catch {}
  }
  return messages
}

app.get('/api/session/live', (req, res) => {
  const info = getLiveSession()
  if (!info) {
    return res.status(404).json({ error: 'Aktif Claude Code session bulunamadı' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send all existing messages as init
  try {
    const content = fs.existsSync(info.jsonlPath) ? fs.readFileSync(info.jsonlPath, 'utf8') : ''
    const messages = parseLiveMessages(content)
    res.write(`data: ${JSON.stringify({ type: 'init', messages })}\n\n`)
    var lineCount = content.split('\n').filter(Boolean).length
  } catch { var lineCount = 0 }

  // Watch for new lines
  let lastLineCount = lineCount
  let watcher = null
  try {
    watcher = fs.watch(info.jsonlPath, () => {
      try {
        const content = fs.readFileSync(info.jsonlPath, 'utf8')
        const lines = content.split('\n').filter(Boolean)
        if (lines.length > lastLineCount) {
          const newContent = lines.slice(lastLineCount).join('\n')
          lastLineCount = lines.length
          const newMessages = parseLiveMessages(newContent)
          for (const m of newMessages) {
            res.write(`data: ${JSON.stringify({ type: 'update', message: m })}\n\n`)
          }
        }
      } catch {}
    })
  } catch {}

  res.on('close', () => watcher?.close())
})

app.post('/api/session/live/message', (req, res) => {
  const { message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' })

  const info = getLiveSession()
  if (!info) return res.status(404).json({ error: 'Aktif session yok' })

  streamClaudeToSSE(res, [
    '--print', '--output-format=stream-json', '--verbose',
    '--resume', info.sessionId, '--dangerously-skip-permissions',
    message.trim()
  ])
})

// Spawns the claude CLI and streams its stream-json output to an SSE response.
// Handles both normal stdout mode and "background task" mode (when the CLI
// detects it's running inside an active session it writes output to a task
// file instead of stdout — we detect the path and poll the file).
// opts.onEvent(ev) is called for every forwarded event.
function streamClaudeToSSE(res, args, opts = {}) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const spawnEnv = { ...process.env, ...(opts.envOverrides || {}) }
  for (const v of ['CLAUDECODE','CLAUDE_CODE_CHILD_SESSION','CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_ENTRYPOINT','AI_AGENT','CLAUDE_AGENT_SDK_VERSION']) {
    delete spawnEnv[v]
  }

  let finished = false
  let pollInterval = null
  let idleTimer = null

  function finish() {
    if (finished) return
    finished = true
    if (pollInterval) clearInterval(pollInterval)
    if (idleTimer) clearTimeout(idleTimer)
    res.write('data: {"type":"done"}\n\n')
    res.end()
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    // 3s no new content → done
    idleTimer = setTimeout(finish, 3000)
  }

  function forwardLine(line) {
    if (!line.trim()) return false
    try {
      const ev = JSON.parse(line)
      opts.onEvent?.(ev)
      if (['assistant', 'tool', 'result', 'system'].includes(ev.type)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`)
        return true
      }
    } catch {}
    return false
  }

  const proc = spawn(CLAUDE_CLI, args, { cwd: opts.cwd || process.cwd(), env: spawnEnv })
  let stdoutBuf = ''
  let taskFilePath = null
  let taskOffset = 0
  let taskLineBuf = ''

  function pollTaskFile() {
    if (finished || !taskFilePath) return
    try {
      const content = fs.readFileSync(taskFilePath, 'utf8')
      if (content.length > taskOffset) {
        const newText = content.slice(taskOffset)
        taskOffset = content.length
        taskLineBuf += newText
        const lines = taskLineBuf.split('\n')
        taskLineBuf = lines.pop() ?? ''
        let gotContent = false
        for (const line of lines) {
          if (forwardLine(line)) gotContent = true
        }
        if (gotContent) resetIdleTimer()
      }
    } catch {}
  }

  proc.stdout.on('data', chunk => {
    stdoutBuf += chunk.toString()
    // Detect background task file path (CLI is running inside an active session)
    const m = stdoutBuf.match(/Output is being written to: ([^\n]+?)\.?\n/)
    if (m && !taskFilePath) {
      taskFilePath = m[1].trim()
      taskOffset = 0
      taskLineBuf = ''
      resetIdleTimer()
      pollInterval = setInterval(pollTaskFile, 250)
      return
    }
    if (taskFilePath) return  // already in background-task mode
    const lines = stdoutBuf.split('\n')
    stdoutBuf = lines.pop() ?? ''
    for (const line of lines) forwardLine(line)
  })

  proc.stderr.on('data', chunk => {
    console.error('[claude-sse stderr]', chunk.toString().slice(0, 200))
  })

  proc.on('close', () => {
    if (!taskFilePath) {
      // Normal mode: process exited → stream is complete
      finish()
    } else {
      // Background task mode: process exited after submitting the task,
      // but the task file is still being written to. Use idle timer.
      resetIdleTimer()
    }
  })

  proc.on('error', err => {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
    finish()
  })

  res.on('close', () => {
    finished = true
    if (pollInterval) clearInterval(pollInterval)
    if (idleTimer) clearTimeout(idleTimer)
    if (!proc.killed) proc.kill()
  })
}

// ─── AI Session ──────────────────────────────────────────────────────────────

app.post('/api/session', async (req, res) => {
  const { tileId, width, height, position, rotation, model, effort } = req.body;
  const id = BigInt(Date.now());
  try {
    const pos = JSON.parse(position);
    const rot = JSON.parse(rotation);
    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId: String(tileId),
        type: 'session',
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
        content: formatSessionContent({ model: model || 'claude-fable-5', effort: effort || 'normal' }),
      },
    });
    res.json(serializeMedia(media));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Returns session history + current settings for this tile
app.get('/api/ai-session/:mediaId/history', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'session') {
      return res.status(404).json({ error: 'Session bulunamadı' })
    }
    const { sessionId, model, effort } = parseSessionContent(media.content)
    if (!sessionId) return res.json({ sessionId: null, messages: [], model, effort })

    const jsonlPath = path.join(PROJECT_DIR, `${sessionId}.jsonl`)
    if (!fs.existsSync(jsonlPath)) return res.json({ sessionId, messages: [], model, effort })

    const content = fs.readFileSync(jsonlPath, 'utf8')
    res.json({ sessionId, messages: parseLiveMessages(content), model, effort })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update model/effort settings without touching the session
app.patch('/api/ai-session/:mediaId/settings', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'session') return res.status(404).json({ error: 'Session bulunamadı' })
    const current = parseSessionContent(media.content)
    const updated = { ...current, ...req.body }
    await prisma.media.update({
      where: { id: BigInt(req.params.mediaId) },
      data: { content: formatSessionContent(updated) },
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/ai-session/message', async (req, res) => {
  const { mediaId, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' });

  let settings = { sessionId: null, model: 'claude-fable-5', effort: 'normal' }
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(mediaId) } })
    if (media) settings = parseSessionContent(media.content)
  } catch {}

  const args = [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(settings.model),
    '--dangerously-skip-permissions',
  ];
  if (settings.sessionId) args.push('--resume', settings.sessionId);
  args.push(message.trim());

  const spawnEnvOverrides = {}
  if (settings.effort && settings.effort !== 'normal') {
    spawnEnvOverrides.CLAUDE_EFFORT = settings.effort
  }

  streamClaudeToSSE(res, args, {
    envOverrides: spawnEnvOverrides,
    onEvent: (ev) => {
      if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id && !settings.sessionId) {
        settings.sessionId = ev.session_id
        const newContent = formatSessionContent({ ...settings, sessionId: ev.session_id })
        prisma.media.update({
          where: { id: BigInt(mediaId) },
          data: { content: newContent },
        }).catch(err => console.error('[ai-session] kayıt hatası:', err.message))
      }
    }
  })
});

// ─── Room Chat (her oda için ayrı graphify grafı) ────────────────────────────
// roomchat tile, session tile'a benzer ama sohbet o odanın metin/canvas
// içeriğinden graphify ile üretilen ayrı bir bilgi grafıyla beslenir.
// Her odanın grafı izole bir klasörde tutulur: room-graphs/<roomId>/

function roomGraphDir(roomId) {
  return path.join(__dirname, 'room-graphs', String(roomId))
}

// Bir odadaki metin/canvas/başlık medyalarından düz metin çıkarır
async function extractRoomTexts(roomId) {
  const media = await prisma.media.findMany({ where: { roomId: String(roomId) } })
  const docs = []
  for (const m of media) {
    if (m.type === 'markdown' && m.content?.trim()) {
      docs.push({ id: String(m.id), tileId: m.tileId, kind: 'metin', text: m.content.trim() })
    } else if (m.type === 'header' && m.content) {
      try {
        const h = JSON.parse(m.content)
        if (h.text?.trim()) docs.push({ id: String(m.id), tileId: m.tileId, kind: 'baslik', text: h.text.trim() })
      } catch {}
    } else if (m.type === 'canvas' && m.content) {
      try {
        const c = JSON.parse(m.content)
        const texts = (c.items || [])
          .filter(it => it.type === 'text' && it.content?.trim())
          .map(it => it.content.trim())
        if (texts.length) docs.push({ id: String(m.id), tileId: m.tileId, kind: 'canvas', text: texts.join('\n\n') })
      } catch {}
    }
  }
  return docs
}

// Çıkarılan metinleri room-graphs/<roomId>/raw/ altına .md dosyaları olarak yazar
function writeRoomRaw(roomId, docs) {
  const rawDir = path.join(roomGraphDir(roomId), 'raw')
  fs.rmSync(rawDir, { recursive: true, force: true })
  fs.mkdirSync(rawDir, { recursive: true })
  for (const d of docs) {
    fs.writeFileSync(path.join(rawDir, `${d.kind}-${d.id}.md`), d.text + '\n')
  }
  return rawDir
}

// Sohbet için odadaki ham metinleri (bütçeli) tek bir bağlam metnine birleştirir
function roomCorpusText(docs, budgetChars = 24000) {
  let out = ''
  for (const d of docs) {
    const block = `\n\n## ${d.kind} (tile ${d.tileId})\n${d.text}`
    if (out.length + block.length > budgetChars) { out += '\n\n…(kısaltıldı)'; break }
    out += block
  }
  return out.trim()
}

// Odanın grafının disk durumunu okur
function roomGraphStatus(roomId, builtAt = null) {
  const graphPath = path.join(roomGraphDir(roomId), 'graphify-out', 'graph.json')
  const status = { exists: false, nodeCount: 0, builtAt }
  if (fs.existsSync(graphPath)) {
    try {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'))
      status.exists = true
      status.nodeCount = (g.nodes || []).length
    } catch {}
  }
  return status
}

// roomchat tile oluştur (session tile ile aynı şema, type='roomchat')
app.post('/api/roomchat', async (req, res) => {
  const { tileId, width, height, position, rotation, model, effort } = req.body
  const id = BigInt(Date.now())
  try {
    const pos = JSON.parse(position)
    const rot = JSON.parse(rotation)
    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId: String(tileId),
        type: 'roomchat',
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
        content: formatSessionContent({ model: model || 'claude-fable-5', effort: effort || 'normal' }),
      },
    })
    res.json(serializeMedia(media))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// roomchat geçmişi + ayarları + graf durumu
app.get('/api/roomchat/:mediaId/history', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'roomchat') {
      return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })
    }
    const settings = parseSessionContent(media.content)
    const { sessionId, model, effort } = settings
    const graph = roomGraphStatus(media.roomId, settings.graphBuiltAt || null)

    let messages = []
    if (sessionId) {
      const jsonlPath = path.join(PROJECT_DIR, `${sessionId}.jsonl`)
      if (fs.existsSync(jsonlPath)) {
        messages = parseLiveMessages(fs.readFileSync(jsonlPath, 'utf8'))
      }
    }
    res.json({ sessionId, messages, model, effort, graph })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// model/effort ayarlarını güncelle (sohbeti bozmadan)
app.patch('/api/roomchat/:mediaId/settings', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'roomchat') return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })
    const current = parseSessionContent(media.content)
    const updated = { ...current, ...req.body }
    await prisma.media.update({
      where: { id: BigInt(req.params.mediaId) },
      data: { content: formatSessionContent(updated) },
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// "Güncelle" butonu — odanın metinlerini topla, raw/'a yaz, graphify ile graf kur
app.post('/api/roomchat/:mediaId/rebuild', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'roomchat') return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })

  const roomId = media.roomId
  const docs = await extractRoomTexts(roomId)

  if (!docs.length) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Bu odada metin/canvas yazısı yok. Önce metin veya canvas ekleyin.' })}\n\n`)
    res.write('data: {"type":"done"}\n\n')
    return res.end()
  }

  const dir = roomGraphDir(roomId)
  fs.mkdirSync(dir, { recursive: true })
  writeRoomRaw(roomId, docs)

  // Graf zaten varsa artımlı (--update) modda çalış: yalnızca yeni/değişen
  // metinleri yeniden işle, silinenleri grafdan çıkar. İlk kurulumda full build.
  const hasGraph = fs.existsSync(path.join(dir, 'graphify-out', 'graph.json'))
  const { model } = parseSessionContent(media.content)
  const prompt = hasGraph
    ? `graphify skill'ini (Skill tool, skill adı "graphify") --update (artımlı) modunda geçerli çalışma dizinindeki ./raw klasörü üzerinde çalıştır. Yalnızca yeni eklenen veya içeriği değişen dosyaları yeniden işle, silinen dosyaların düğümlerini mevcut grafdan çıkar ve sonucu mevcut graphify-out/graph.json ile birleştir; ardından clustering ve GRAPH_REPORT.md'yi tazele. Bana hiçbir şey sorma, onay bekleme — doğrudan yap. Bittiğinde tek satırla kaç node ve kaç community olduğunu söyle.`
    : `graphify skill'ini (Skill tool, skill adı "graphify") geçerli çalışma dizinindeki ./raw klasörü üzerinde çalıştır ve bilgi grafını kur. Tam pipeline'ı uygula: detect → extract → cluster → report → graph.json + GRAPH_REPORT.md üret. Çıktılar graphify-out/ altına yazılmalı. Bana hiçbir şey sorma, onay bekleme — doğrudan kur. Bittiğinde tek satırla kaç node ve kaç community oluştuğunu söyle.`

  streamClaudeToSSE(res, [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(model),
    '--dangerously-skip-permissions',
    prompt,
  ], {
    cwd: dir,
    onEvent: (ev) => {
      if (ev.type === 'result') {
        const cur = parseSessionContent(media.content)
        const status = roomGraphStatus(roomId)
        prisma.media.update({
          where: { id: media.id },
          data: { content: formatSessionContent({ ...cur, graphBuiltAt: new Date().toISOString(), nodeCount: status.nodeCount }) },
        }).catch(err => console.error('[roomchat] graf kaydı hatası:', err.message))
      }
    },
  })
})

// roomchat mesajı — odanın grafı + ham metni system prompt'a enjekte edilir
app.post('/api/roomchat/message', async (req, res) => {
  const { mediaId, message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' })

  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(mediaId) } }) } catch {}
  if (!media || media.type !== 'roomchat') return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })

  const settings = parseSessionContent(media.content)
  const roomId = media.roomId
  const dir = roomGraphDir(roomId)

  let sys = `Sen bu sanal odanın asistanısın. Yalnızca bu odadaki metin ve canvas yazılarından oluşturulan bilgiyle konuş. Genel bilgini yalnızca odanın içeriğinde cevap yoksa kullan ve bunu açıkça belirt. Cevaplarını Türkçe ver, kısa ve net ol.`

  const reportPath = path.join(dir, 'graphify-out', 'GRAPH_REPORT.md')
  if (fs.existsSync(reportPath)) {
    try { sys += `\n\n# Oda Bilgi Grafı Raporu\n${fs.readFileSync(reportPath, 'utf8')}` } catch {}
  }

  const docs = await extractRoomTexts(roomId)
  if (docs.length) sys += `\n\n# Oda İçeriği (kaynak metinler)\n${roomCorpusText(docs)}`

  const graphJson = path.join(dir, 'graphify-out', 'graph.json')
  if (fs.existsSync(graphJson)) {
    sys += `\n\nDaha derin ilişkiler için odanın grafı: ${graphJson} — gerekirse \`graphify query "<soru>"\` çalıştırabilirsin.`
  }

  const args = [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(settings.model),
    '--append-system-prompt', sys,
    '--dangerously-skip-permissions',
  ]
  if (settings.sessionId) args.push('--resume', settings.sessionId)
  args.push(message.trim())

  const envOverrides = {}
  if (settings.effort && settings.effort !== 'normal') {
    envOverrides.CLAUDE_EFFORT = settings.effort
  }

  streamClaudeToSSE(res, args, {
    envOverrides,
    onEvent: (ev) => {
      if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id && !settings.sessionId) {
        settings.sessionId = ev.session_id
        prisma.media.update({
          where: { id: BigInt(mediaId) },
          data: { content: formatSessionContent({ ...settings, sessionId: ev.session_id }) },
        }).catch(err => console.error('[roomchat] kayıt hatası:', err.message))
      }
    },
  })
})

// ─── Start ────────────────────────────────────────────────────────────────────
await bootMigrate();
app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
