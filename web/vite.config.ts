import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
    // ECharts lives in the lazy dashboard chunk; the initial app shell stays small.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
