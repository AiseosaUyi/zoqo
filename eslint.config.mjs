import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local `vercel build` output — gitignored, not source, but not covered
    // by the defaults above, so it silently ballooned every lint run with
    // thousands of warnings from minified bundles.
    ".vercel/**",
  ]),
]);

export default eslintConfig;
