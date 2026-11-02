import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

const sibling = fileURLToPath(new URL('../../../freebore-ui', import.meta.url))

export default defineNuxtConfig({
  // Keep verification builds from overwriting a running dev server's generated layer aliases.
  buildDir: process.env.STUDIO_BUILD_DIR || '.nuxt',
  extends: [existsSync(sibling) ? sibling : ['github:jameswilliamknight/freebore-ui', { install: true }]],
  compatibilityDate: '2026-05-21',
  devtools: { enabled: false },
  devServer: { host: 'localhost', port: 42076 },
  vite: { plugins: [tailwindcss()], server: { strictPort: true } },
  modules: ['@nuxt/eslint', '@pinia/nuxt'],
  css: ['~/assets/css/tailwind.css'],
  nitro: {
    // Bun executes this Node-compatible server too. Unlike Nitro's Bun localFetch
    // preset, it preserves the peer socket needed for the loopback-only privacy guard.
    preset: 'node-server',
    // The sibling UI layer can resolve a different Vue installation. Bundle the SSR
    // runtime so Nitro's dependency tracer cannot omit vue/server-renderer from production.
    externals: { inline: [/^(vue|@vue\/[^/]+|pinia)(\/|$)/] },
  },
  app: { head: { title: 'Transcription Studio', htmlAttrs: { class: 'dark', lang: 'en-NZ' } } },
  typescript: { strict: true },
})
