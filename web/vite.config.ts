import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Stamp a human-readable build date into the bundle so users can confirm
// (in the "More" menu) that they're running the freshly-installed version.
const BUILD_ID = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
});
