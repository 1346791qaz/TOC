import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The client lives in /client; index.html sits at the repo root. Shared Zod
// schemas are imported by both client and server via the @shared alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 5173,
    fs: {
      // allow importing from shared/ which sits outside the client root
      allow: [path.resolve(__dirname)],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
