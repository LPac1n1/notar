import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // DuckDB-WASM ships its own worker + WASM glue and breaks if Vite's
  // dep-optimization step rewrites its imports (you get
  // `_setThrew is not defined` at runtime, because the Emscripten linker
  // can't bind the WASM exports back to the pre-bundled JS).
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/exceljs")) {
            return "exceljs";
          }

          if (id.includes("node_modules/@duckdb/duckdb-wasm")) {
            return "duckdb";
          }

          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react-router-dom")
          ) {
            return "react-vendor";
          }

          return undefined;
        },
      },
    },
  },
});
