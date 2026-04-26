// @ts-nocheck
import type { Config } from 'jest';

const config: Config = {
  displayName: 'main',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/main/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: 'tsconfig.json' },
    ] as [string, Record<string, unknown>],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
