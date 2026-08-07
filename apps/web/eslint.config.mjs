// eslint-config-next 16 ships native flat config. Running it through
// FlatCompat — which is how this was written for v15 — makes ESLint throw
// "Converting circular structure to JSON" before it lints a single file.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import baseConfig from '@xxm/config/eslint'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...baseConfig,
  {
    files: ['lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['__tests__/**'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
]

export default config
