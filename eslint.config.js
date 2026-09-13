import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /*
    Derleme çıktıları lint edilmiyor. `sunucu-dist` sunucunun derlenmiş
    hâli: kaynaktaki lint yorumlarını da taşıyor ama JavaScript olarak
    lint edildiği için TypeScript kuralları tanımlı olmuyor ve "kural
    bulunamadı" hatası veriyordu.
  */
  {
    ignores: [
      'dist', 'sunucu-dist', 'node_modules', 'playwright-report', 'test-results',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
