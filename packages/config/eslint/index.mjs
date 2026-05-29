/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    rules: {
      'no-console':          ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars':       'off',
      'prefer-const':         'error',
      'no-var':               'error',
    },
  },
]
