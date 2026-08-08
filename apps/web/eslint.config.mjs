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
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      // Vitest reuses a worker thread across test files. Replacing `process.env`
      // wholesale detaches it from the object every other file's `vi.stubEnv`
      // holds a reference to, so their `unstubAllEnvs` restores onto something
      // nobody reads and their environment leaks into whatever runs next in that
      // worker. It produced a suite that failed at random, in files that had not
      // been touched. `vi.stubEnv` / `vi.unstubAllEnvs` mutate keys in place and
      // are the only safe way to do this.
      'no-restricted-syntax': ['error', {
        selector: 'AssignmentExpression > MemberExpression[object.name="process"][property.name="env"]',
        message: 'Do not assign to process.env in tests — use vi.stubEnv / vi.unstubAllEnvs. Replacing the object leaks environment between test files sharing a worker.',
      }],
    },
  },
]

export default config
