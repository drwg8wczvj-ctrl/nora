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
    chunkSizeWarningLimit: 650,
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
