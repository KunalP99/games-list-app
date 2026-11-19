import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Supabase queries are cast `as any` on purpose where the hand-written
      // lib/database.types.ts can't express them (see CLAUDE.md).
      "@typescript-eslint/no-explicit-any": "off",
      // Plain <img> is used deliberately for YouTube thumbnails and other
      // external images (no next/image domain config needed).
      "@next/next/no-img-element": "off",
      // Reviewed on 2026-11-19: every case (29) was a working, intended
      // pattern — reading browser-only values after hydration ("mounted",
      // theme, localStorage, the clock), resetting results when a search
      // starts, or copying a changed prop into local state. Rewriting them for
      // this rule would add risk and change nothing users see.
      "react-hooks/set-state-in-effect": "off",
      // React Compiler-era rules; real cases are fixed, deliberate ones carry
      // an inline eslint-disable saying why. Warnings, so they never block.
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      // `_name` for a parameter kept for its callers; `{ a, ...rest }` to copy
      // an object without one field.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Not part of the website: the desktop tracker (its own project), the
      // PowerShell prototype agent, and test output.
      "desktop/**",
      "agent/**",
      "test-results/**",
      "playwright-report/**",
      "supabase/**",
    ],
  },
];

export default eslintConfig;
