import path from 'node:path'
import { defineProject } from 'vitest/config'

export const unitTestMinimalProject = defineProject({
  test: {
    name: 'unit',
    include: ['packages/**/test/unit/**/*.test.ts'],
    setupFiles: [
      path.join(
        import.meta.dirname,
        '../scripts/vitest/setupFiles/customMatchers.ts',
      ),
      path.join(import.meta.dirname, '../scripts/vitest/setupFiles/dotenv.ts'),
    ],
    pool: 'forks',
    env: {
      NODE_ENV: 'test',
    },
  },
})
