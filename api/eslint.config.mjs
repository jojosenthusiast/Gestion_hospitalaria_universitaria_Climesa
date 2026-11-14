// Minimal ESLint flat config (audit PRO-06). It enforces the recommended JS/TypeScript rules without reformatting the existing
// code; rules that would need changes across many files are relaxed, each with the reason.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.jest } },
    rules: {
      // Off: SQL rows are typed `Record<string, any>` on purpose (no ORM, AGENTS.md) in about 170 places.
      '@typescript-eslint/no-explicit-any': 'off',
      // Warnings, not errors: about 15 unused names and one `let` exist today; fixing them touches many unrelated files.
      '@typescript-eslint/no-unused-vars': 'warn',
      'prefer-const': 'warn',
      // PGlite contrib extensions and a few test helpers load through require(); the build is CommonJS.
      '@typescript-eslint/no-require-imports': 'off',
      // matriz-rbac.spec.ts strips a byte-order mark with a regular expression that contains it on purpose.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
    },
  },
);
