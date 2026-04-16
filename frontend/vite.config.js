import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api/* → FastAPI running on :8000
// This is what Apache does in production (reverse proxy).
// Locally, Vite handles it so you don't need Apache at all.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
