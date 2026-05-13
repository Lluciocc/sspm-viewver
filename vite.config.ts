import { defineConfig } from "vite";

export default defineConfig({
  base: "./",

  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  server: {
    port: 5173,
    open: true,
  },
});
