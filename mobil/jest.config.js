/** Biçim ve güvenlik testleri saf TypeScript; jsdom/RN ortamı gerekmiyor. */
module.exports = {
  preset: 'jest-expo/universal',
  projects: [
    {
      displayName: 'birim',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      /*
        `src/supabase.ts` yerel modüllere bağlı olduğu için saf Node
        projesinde hiç içe aktarılamıyordu -- yani o dosyanın mantığı
        (jeton çözme, oturum saklama) test DIŞINDAYDI. `Buffer` hatası
        tam oradan çıktı ve cihaza kadar görülmedi. Bu eşlemeler o
        kapıyı açıyor.
      */
      moduleNameMapper: {
        '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.ts',
        '^expo-constants$': '<rootDir>/__mocks__/expo-constants.ts',
        '^react-native$': '<rootDir>/__mocks__/react-native.ts',
        '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.ts',
      },
    },
  ],
};
