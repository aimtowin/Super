import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/preload/floating-preview.ts",
      formats: ["cjs"],
      fileName: () => "floating-preview.js",
    },
  },
});
