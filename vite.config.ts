import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    printWidth: 100,
    singleQuote: true,
    sortPackageJson: false,
    associations: [
      {
        files: ['*.html'],
        language: 'angular-html',
      },
    ],
    ignorePatterns: ['pnpm-lock.yaml', 'dist/', '.angular/', 'node_modules/'],
  },
});
