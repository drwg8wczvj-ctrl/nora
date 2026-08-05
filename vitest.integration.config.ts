import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.integration.test.{js,jsx,ts,tsx}"],
    exclude: ["qa/**", "node_modules/**", "dist/**", "ios/**", ".claude/**"],
    testTimeout: 15_000,
  },
});
