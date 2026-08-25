import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'release', 'portable'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // The Electron main/preload process was excluded from linting entirely,
    // which left the most privileged code in the project — IPC handlers, the
    // PowerShell spawn, the navigation lockdown, the auto-updater — checked by
    // nothing but `node --check`, a syntax-only pass. It runs elevated and has
    // full Node access, so it is the last place that should go unlinted.
    files: ['electron/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    // Playwright e2e tests and the test/build config files run under Node, not
    // the browser/React fast-refresh model, so drop the React-specific rules.
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Unit/component tests mock third-party SDKs whose surfaces are large and
    // awkward to reproduce exactly (the Supabase client, Web Serial, fake
    // timers). Partial test doubles legitimately need `any`, so scope that rule
    // off for tests only — production code under src/** stays fully strict and
    // carries zero `any`.
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
