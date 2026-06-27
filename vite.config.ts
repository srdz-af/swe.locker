import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.git/**",
        "**/dist/**",
        "**/generated/**",
        "**/node_modules/**",
        "**/prisma/**",
        "**/server/**",
        "**/server/src/generated/**",
        "**/shared/**",
        "**/*.db",
        "**/*.db-*",
        "**/dev.db",
        "**/dev.db-*"
      ],
      interval: 300,
      usePolling: true
    }
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  }
});
