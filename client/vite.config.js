// Vite build configuration for the React client and Tailwind CSS integration.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Use relative paths for Electron builds
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Ensure assets are referenced with relative paths
    assetsDir: "assets",
    rollupOptions: {
      output: {
        // Ensure all assets use relative paths
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js"
      }
    }
  },
  // Development server config
  server: {
    port: 5173,
    strictPort: true
  }
});
