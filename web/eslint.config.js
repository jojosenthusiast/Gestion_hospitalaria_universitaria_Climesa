// Minimal ESLint flat config (audit PRO-06). It enforces the recommended JS/TypeScript rules and the rules of hooks without
// reformatting the existing code; rules that would need changes across many files are off, each with the reason.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/lib/generated/**', 'vite.config.js', 'vite.config.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Warnings, not errors: about 20 unused imports and one `any` exist today in tests and fixtures; fixing them touches
      // files outside the CI task. Turn them back into errors once those files are cleaned.
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // navegacion.test.tsx strips a byte-order mark with a regular expression that contains it on purpose.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
    },
  },
);
