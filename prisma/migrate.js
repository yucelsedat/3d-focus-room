// JSON → SQLite migration script
// Run directly: node prisma/migrate.js
// Or import and call: import migrate from './prisma/migrate.js'
// Idempotent: uses upsert, safe to run multiple times

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DB_PATH = path.join(__dirname, 'dev.db')
const DATA_DIR = path.join(__dirname, '../public/data')
const ROOMS_JSON = path.join(DATA_DIR, 'rooms.json')

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export default async function migrate(prismaInstance) {
  const ownClient = !prismaInstance
  const prisma = prismaInstance ?? (() => {
    const adapter = new PrismaBetterSqlite3({ url: 'file:' + DB_PATH })
    return new PrismaClient({ adapter })
  })()

  if (!fs.existsSync(ROOMS_JSON)) {
    console.log('[migrate] No rooms.json found, nothing to migrate.')
    if (ownClient) await prisma.$disconnect()
    return
  }

  const rooms = readJson(ROOMS_JSON)
  if (!rooms || !Array.isArray(rooms)) {
    console.log('[migrate] rooms.json is empty or invalid.')
    if (ownClient) await prisma.$disconnect()
    return
  }

  console.log(`[migrate] Migrating ${rooms.length} rooms...`)

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { id: room.id },
      update: { name: room.name, updatedAt: new Date(room.updatedAt) },
      create: {
        id: room.id,
        name: room.name,
        createdAt: new Date(room.createdAt),
        updatedAt: new Date(room.updatedAt),
      },
    })
    console.log(`[migrate]   ✓ Room: ${room.name} (${room.id})`)

    const roomDir = path.join(DATA_DIR, 'rooms', room.id)

    // Media
    const mediaList = readJson(path.join(roomDir, 'media.json'))
    if (Array.isArray(mediaList)) {
      for (const m of mediaList) {
        const pos = Array.isArray(m.position) ? m.position : [0, 0, 0]
        const rot = Array.isArray(m.rotation) ? m.rotation : [0, 0, 0, 'XYZ']
        await prisma.media.upsert({
          where: { id: BigInt(m.id) },
          update: {},
          create: {
            id: BigInt(m.id),
            roomId: room.id,
            tileId: String(m.tileId),
            type: m.type,
            url: m.url || null,
            content: m.content || null,
            width: parseFloat(m.width) || 1,
            height: parseFloat(m.height) || 1,
            posX: parseFloat(pos[0]) || 0,
            posY: parseFloat(pos[1]) || 0,
            posZ: parseFloat(pos[2]) || 0,
            rotX: parseFloat(rot[0]) || 0,
            rotY: parseFloat(rot[1]) || 0,
            rotZ: parseFloat(rot[2]) || 0,
            rotOrder: String(rot[3] || 'XYZ'),
          },
        })
      }
      console.log(`[migrate]     ✓ ${mediaList.length} media items`)
    }

    // Doors
    const doorIds = readJson(path.join(roomDir, 'doors.json'))
    if (Array.isArray(doorIds)) {
      for (const doorId of doorIds) {
        await prisma.door.upsert({
          where: { roomId_doorId: { roomId: room.id, doorId: parseInt(doorId) } },
          update: {},
          create: { roomId: room.id, doorId: parseInt(doorId) },
        })
      }
      console.log(`[migrate]     ✓ ${doorIds.length} doors`)
    }

    // Floor
    const floor = readJson(path.join(roomDir, 'floor.json'))
    if (floor && floor.texture) {
      await prisma.floor.upsert({
        where: { roomId: room.id },
        update: { texture: floor.texture },
        create: { roomId: room.id, texture: floor.texture },
      })
      console.log(`[migrate]     ✓ Floor: ${floor.texture}`)
    }
  }

  console.log('[migrate] Migration complete!')
  if (ownClient) await prisma.$disconnect()
}

// Run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch(err => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
}
