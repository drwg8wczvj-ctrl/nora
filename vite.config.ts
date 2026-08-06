import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    {
      name: "nora-js-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (!/\/src\/.*\.js$/.test(id)) return null;
        return transformWithEsbuild(code, id, { loader: "jsx", jsx: "automatic" });
      },
    },
    react({ include: /\.(js|jsx|ts|tsx)$/ }),
  ],
  envPrefix: ["VITE_", "REACT_APP_"],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // ExcelJS is loaded on demand for spreadsheet exports and is just under 1 MB
    // after minification. Keep that feature intact while splitting the libraries
    // needed at startup into cacheable chunks.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react-vendor";
          }
          if (id.includes("/@supabase/")) return "supabase-vendor";
          if (id.includes("/i18next") || id.includes("/react-i18next/")) return "i18n-vendor";
          if (id.includes("/lucide-react/")) return "icons-vendor";
          if (id.includes("/@capacitor/")) return "capacitor-vendor";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.js"],
    include: ["src/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    exclude: [
      "src/**/*.integration.test.{js,jsx,ts,tsx}",
      "qa/**",
      "node_modules/**",
      "dist/**",
      "ios/**",
      ".claude/**",
    ],
    css: true,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
