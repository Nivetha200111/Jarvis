module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  env: {
    es2022: true,
    node: true
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  overrides: [
    {
      files: ['packages/desktop/src/renderer/**/*.{ts,tsx}'],
      env: {
        browser: true,
        node: false
      }
    }
  ]
}
