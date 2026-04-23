import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/auth": { target: "http://localhost:2567", changeOrigin: true },
      "/api": { target: "http://localhost:2567", changeOrigin: true },
      "/colyseus": { target: "http://localhost:2567", changeOrigin: true, ws: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
});
