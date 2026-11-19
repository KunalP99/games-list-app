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
      // React Compiler-era rules that flag working patterns already in the
      // code; warnings to review, not errors that block.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
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
