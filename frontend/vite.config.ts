import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});