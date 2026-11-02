import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS=1 npm run dev -> самоподписанный HTTPS, чтобы микрофон работал с телефона в локальной сети
const https = process.env.HTTPS === '1'

export default defineConfig({
  // GitHub Pages project page: https://hexlabelposition.github.io/vocade/
  base: '/vocade/',
  plugins: [
    ...(https ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Vocade',
        short_name: 'Vocade',
        description: 'Продиктуй цифры, получи Code128 или QR. Работает офлайн.',
        lang: 'ru',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#111827',
        theme_color: '#111827',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // модель речи кладём в precache, чтобы после первого открытия всё работало без сети
        globPatterns: ['**/*.{js,css,html,svg,png,gz}'],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
      },
    }),
  ],
  server: { host: https },
})
