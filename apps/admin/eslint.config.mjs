// eslint-config-next 16 ships native flat config. Running it through
// FlatCompat — which is how this was written for v15 — makes ESLint throw
// "Converting circular structure to JSON" before it lints a single file.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import baseConfig from '@xxm/config/eslint'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...baseConfig,
]

export default config
