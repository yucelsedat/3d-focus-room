import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist: build çıktısı. room-projects/room-graphs/room-blueprints: çalışma
  // sırasında üretilen scaffold/ajan çıktıları (focus-room'un bakımlı kaynağı değil).
  // graphify-out: knowledge-graph çıktısı. Bunları lint dışı tutmak asıl src
  // hatalarını gürültüden ayırır — uygulama davranışına etkisi yoktur.
  globalIgnores(['dist', 'room-projects', 'room-graphs', 'room-blueprints', 'graphify-out']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Boş catch bloğu kod tabanında bilinçli bir kalıp (hata bastırma).
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Sunucu/araç tarafı Node dosyaları: process/require/__dirname/Buffer/module
  // gibi Node global'leri tanımlı olsun (aksi halde tarayıcı global seti yüzünden
  // yanlış "no-undef" hataları üretilir). Lint dışı davranışa etkisi yoktur.
  {
    files: ['server.js', 'prisma/**/*.js', 'prisma.config.js', 'permission-hook.js', 'scripts/**/*.js', 'bench/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
