import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Disallow all console.* calls by default (server/shared code)
  {
    rules: {
      // All logging must use Winston logger in server code. No console.* allowed.
      'no-console': 'error',
    },
  },
  // Allow console.error in client components/hooks for actionable errors in development only
  {
    files: [
      "components/**/*.tsx",
      "components/**/*.ts",
      "lib/hooks/**/*.ts",
    ],
    rules: {
      // Allow console.error in client code for actionable errors only
      'no-console': [
        'error',
        { allow: ['error'] },
      ],
    },
  },
];

export default eslintConfig;
