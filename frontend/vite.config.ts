import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the app reads the synthetic bundle straight from ../fixtures,
// served at /bundle/. In production set VITE_BUNDLE_BASE_URL to the bucket URL.
export default defineConfig({
  plugins: [react()],
  publicDir: "../fixtures",
  base: "./",
  worker: { format: "es" },
  server: { port: 5173, host: true },
});
