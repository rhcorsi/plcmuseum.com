// ESLint flat config: JS + TypeScript + Astro. Formatting is Prettier's job (pnpm lint runs both).
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Globals the Node scripts use; listed by hand to avoid a dependency for a dozen names.
const NODE_GLOBALS = Object.fromEntries(
  ['process', 'console', 'URL', 'Buffer', 'setTimeout', 'clearTimeout', 'fetch', 'AbortController'].map((name) => [
    name,
    'readonly',
  ]),
);

export default defineConfig([
  {
    ignores: [
      'dist/',
      '.astro/',
      '.wrangler/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
      'prototypes/',
      'docs/private/',
      'content/private/',
      'content/stories/',
      'src/content/types.ts',
      'worker/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: NODE_GLOBALS },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // docs/SECURITY.md 3.1: no inline scripts (CSP script-src 'self') and no raw HTML injection.
      'astro/no-unsafe-inline-scripts': 'error',
      'astro/no-set-html-directive': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden (docs/SECURITY.md); render text, never HTML.',
        },
        {
          selector: 'JSXAttribute[name.name=/^on[A-Z]/][value.type="Literal"]',
          message: 'Inline event handler strings are forbidden; use a function.',
        },
      ],
    },
  },
]);
