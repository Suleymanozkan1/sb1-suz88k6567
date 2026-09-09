/** Biçim ve güvenlik testleri saf TypeScript; jsdom/RN ortamı gerekmiyor. */
module.exports = {
  preset: 'jest-expo/universal',
  projects: [
    {
      displayName: 'birim',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
    },
  ],
};
