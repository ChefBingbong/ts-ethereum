import path from 'node:path'
import { defineConfig, type TestUserConfig } from 'vitest/config'
import { unitTestMinimalProject } from './configs/vitest.config.unit-minimal.js'

export function getReporters(): TestUserConfig['reporters'] {
  if (process.env.GITHUB_ACTIONS)
    return ['tree', 'hanging-process', 'github-actions']
  if (process.env.TEST_COMPACT_OUTPUT) return ['basic', 'hanging-process']

  return ['tree', 'hanging-process']
}

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        ...unitTestMinimalProject,
      },
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/_cjs/**',
      '**/_esm/**',
      '**/_types/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
    env: {
      NODE_ENV: 'test',
    },
    clearMocks: true,
    // Some test files allocate a lot of data, which could cause more time for teardown
    teardownTimeout: 5_000,
    // We have a few spec tests suits (specially spec tests) which don't have individual tests
    passWithNoTests: true,
    reporters: getReporters(),
    diff: process.env.TEST_COMPACT_DIFF
      ? path.join(import.meta.dirname, './scripts/vitest/vitest.diff.ts')
      : undefined,
    onConsoleLog: () => !process.env.TEST_QUIET_CONSOLE,
    coverage: {
      enabled: false,
      include: ['packages/**/src/**.{ts}'],
      clean: true,
      provider: 'v8',
      reporter: [['lcovonly', { file: 'lcov.info' }], ['text']],
      reportsDirectory: './coverage',
      exclude: [
        '**/*.d.ts',
        '**/*.js',
        '**/lib/**',
        '**/coverage/**',
        '**/scripts/**',
        '**/test/**',
        '**/types/**',
        '**/bin/**',
        '**/node_modules/**',
      ],
    },
  },
})
