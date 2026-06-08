import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  experimental: { viewTransition: true },
};

export default withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Cache data JSON files
        urlPattern: /\/search-data\.json$/,
        handler: "CacheFirst",
        options: {
          cacheName: "search-data",
          expiration: { maxEntries: 1, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        // Cache images (pixel art sprites)
        urlPattern: /\/images\/.+\.(png|jpg|webp|gif)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "images",
          expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
})(nextConfig);
