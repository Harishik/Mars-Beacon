import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the app reads the synthetic bundle straight from ../fixtures,
// served at /bundle/. In production set VITE_BUNDLE_BASE_URL to the bucket URL.
export default defineConfig({
  plugins: [react()],
  publicDir: "../fixtures",
  base: "./",
  worker: { format: "es" },
  // Dev: /api goes to a local backend (uvicorn on 8000), so one address serves both (VITE_BEACON_API=/api).
  server: { port: 5173, host: true, proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } } },
});
