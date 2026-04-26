// @ts-nocheck
import type { Config } from 'jest';

const config: Config = {
  displayName: 'renderer',
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '<rootDir>/src/renderer/**/*.test.{ts,tsx}',
    '<rootDir>/src/shared/**/*.test.{ts,tsx}',
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: 'tsconfig.json' },
    ] as [string, Record<string, unknown>],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/test/__mocks__/fileMock.ts',
    '\\.(png|jpg|jpeg|gif|svg|webp|ico)$':
      '<rootDir>/test/__mocks__/fileMock.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup-renderer.ts'],
};

export default config;
