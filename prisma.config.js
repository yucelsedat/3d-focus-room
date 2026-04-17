const { defineConfig } = require('prisma/config')
const path = require('path')

const DB_PATH = path.join(__dirname, 'prisma/dev.db')

module.exports = defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma/migrations'),
  },
  datasource: {
    url: `file:${DB_PATH}`,
  },
})
