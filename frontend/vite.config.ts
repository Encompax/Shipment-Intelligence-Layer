import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase",
              test: /node_modules[\\/](@firebase|firebase)[\\/]/,
              priority: 20,
            },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 15,
            },
            {
              name: "charts",
              test: /node_modules[\\/](recharts|d3-|victory-vendor)/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    // Bind to all interfaces so it's accessible from localhost and external IPs
    host: "0.0.0.0",
    port: 5173,
    // Proxy /api requests to backend
    proxy: {
      "/api/sil": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/api/shipment-intelligence": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/api/ingest": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
