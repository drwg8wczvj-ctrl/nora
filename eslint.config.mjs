import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import react from "eslint-plugin-react";
import testingLibrary from "eslint-plugin-testing-library";
import jestDom from "eslint-plugin-jest-dom";
import tseslint from "typescript-eslint";

const sourceFiles = ["src/**/*.{js,jsx,ts,tsx}"];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "ios/**",
      "qa/**",
      ".claude/**",
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      react,
    },
    rules: {
      ...js.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "no-useless-assignment": "off",
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^(React|_)",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "react-refresh/only-export-components": "off",
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.{ts,tsx}"],
  })),
  {
    files: ["src/domain/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "**/App",
            "**/App.*",
            "**/MobileApp",
            "**/MobileApp.*",
            "**/components/**",
            "**/aiHub/**",
          ],
          message: "Domain code must remain independent of application screens and UI components.",
        }],
      }],
    },
  },
  {
    files: ["src/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    plugins: {
      "testing-library": testingLibrary,
      "jest-dom": jestDom,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022, ...globals.vitest },
    },
    rules: {
      ...testingLibrary.configs.react.rules,
      ...jestDom.configs.recommended.rules,
    },
  },
  {
    files: ["api/**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2022, fetch: "readonly" },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-useless-assignment": "off",
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
