import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg"],
      manifest: {
        name: "ArkGrid",
        short_name: "ArkGrid",
        description: "Flood response intelligence",
        theme_color: "#F7F9FC",
        background_color: "#F7F9FC",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        importScripts: ["/sos-sync.js"],
        runtimeCaching: [
          {
            // map tiles: cache what the user has already viewed
            urlPattern: /^https:\/\/.*(tile|tiles|basemaps|openstreetmap).*\/.*\.(png|jpg|jpeg|pbf|webp)/i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // read-only API data: show last known copy when offline
            urlPattern: /\/api\/(shelters|roads|risk|hospitals).*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-data",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
});