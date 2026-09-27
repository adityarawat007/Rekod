import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// With no RLS, src/lib/server's scoped repos are the only thing that keeps a
// query inside its workspace. Nothing else may reach the raw handle.
const noDb = {
  "no-restricted-imports": ["error", {
    patterns: [{
      group: ["@/lib/db", "@/lib/db/*", "**/lib/db", "**/lib/db/*"],
      message: "Only src/lib/server may import the database. Add a function there instead.",
    }],
  }],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["**/*.{ts,tsx,js,mjs}"], ignores: ["src/lib/server/**", "src/lib/db/**"], rules: noDb },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
