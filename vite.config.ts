import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: "Sailor's Wx",
        short_name: "Sailor's Wx",
        description: 'Sailing-focused weather — tides, wind, rain',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the app shell; API calls go through the network (cached in localStorage already)
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/metoffice': {
        target: 'https://data.hub.api.metoffice.gov.uk',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/metoffice/, ''),
      },
      '/ukho': {
        target: 'https://admiraltyapi.azure-api.net',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ukho/, ''),
      },
      '/sunrisesunset': {
        target: 'https://api.sunrise-sunset.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/sunrisesunset/, ''),
      },
    },
  },
})
